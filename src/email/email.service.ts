import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from '../services/rabbitmq.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly appName = 'Impact Plus';

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async sendVerificationEmail(email: string, otp: string, username: string = ''): Promise<boolean> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #4a6ee0; margin: 0;">${this.appName}</h1>
            <p style="color: #666; font-size: 14px;">AI-driven human capital advisory</p>
          </div>
          
          <h2 style="color: #333; margin-top: 0;">Verify Your Account</h2>
          
          <p>Hello${username ? ' ' + username : ''},</p>
          
          <p>Thank you for registering with ${this.appName}. To complete your registration and verify your account, please use the following verification code:</p>
          
          <div style="background: #f8f8f8; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; margin: 25px 0; border-radius: 5px; border: 1px solid #ddd;">${otp}</div>
          
          <p>This code will expire in 10 minutes for security purposes.</p>
          
          <p>If you didn't create an account with ${this.appName}, you can safely ignore this email.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>This is an automated message from ${this.appName}. Please do not reply to this email.</p>
            <p>© ${new Date().getFullYear()} ${this.appName}. All rights reserved.</p>
          </div>
        </div>
      `;

      const text = `Verify Your ${this.appName} Account

Hello${username ? ' ' + username : ''},

Your verification code is: ${otp}

This code will expire in 10 minutes.

If you didn't create an account with ${this.appName}, you can safely ignore this email.

© ${new Date().getFullYear()} ${this.appName}. All rights reserved.`;

      const emailMessage = {
        to: email,
        subject: `Your ${this.appName} Verification Code`,
        template: 'verification',
        context: {
          otp,
          username,
          appName: this.appName,
          frontendUrl,
        },
        html,
        text,
        priority: 'high' as const,
      };

      const published = await this.rabbitMQService.publishEmail(emailMessage);
      
      if (published) {
        this.logger.log(`✅ Verification email queued for ${email}`);
      } else {
        this.logger.warn(`⚠️ Failed to queue verification email for ${email}`);
      }

      return published;
    } catch (error) {
      this.logger.error(`❌ Error sending verification email to ${email}:`, error);
      return false;
    }
  }

  private formatRoleLabel(role: string) {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'org_admin':
        return 'Organization Admin';
      case 'org_sub_admin':
        return 'Organization Sub Admin';
      case 'participant':
        return 'Participant';
      default:
        return role;
    }
  }

  async sendInvitationEmail(
    email: string,
    invitationToken: string,
    organizationName: string,
    username: string = '',
    role: string = 'participant',
    expiryDays: number = 10,
  ): Promise<boolean> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:8080';
      const invitationLink = `${frontendUrl}/accept-invitation?token=${invitationToken}`;
      const roleLabel = this.formatRoleLabel(role);

      const html = `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px; background: #f7f8fb; color: #101828;">
          <div style="background: #ffffff; border-radius: 18px; border: 1px solid #edf0f6; padding: 32px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #3b5bdb; margin: 0; font-size: 26px; letter-spacing: 0.04em;">${this.appName}</h1>
              <p style="color: #475467; font-size: 13px; margin-top: 4px;">AI-driven human capital advisory</p>
            </div>

            <div style="background: linear-gradient(120deg, #eef2ff, #fdf2ff); border-radius: 16px; padding: 24px; margin-bottom: 28px; text-align: center;">
              <p style="margin: 0; color: #344054; font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase;">Invitation to join</p>
              <h2 style="margin: 10px 0 0; font-size: 28px; font-weight: 600; color: #101828;">${organizationName}</h2>
            </div>

            <p style="font-size: 15px; margin-bottom: 16px;">Hello${username ? ` ${username}` : ''},</p>
            <p style="font-size: 15px; line-height: 1.6; color: #475467;">
              You’ve been invited to join <strong>${organizationName}</strong> on <strong>${this.appName}</strong> as a
              <strong>${roleLabel}</strong>. This access gives you the right tools and insights to collaborate with your team seamlessly.
            </p>

            <div style="background: #f8fafc; border-radius: 14px; padding: 18px 20px; margin: 24px 0;">
              <p style="margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.2em; color: #98a2b3;">Next steps</p>
              <ol style="margin: 10px 0 0 18px; padding: 0; color: #475467; font-size: 14px;">
                <li>Click the button below within ${expiryDays} days.</li>
                <li>Create a secure password to activate your account.</li>
                <li>Sign in and start managing ${organizationName} on Impact Plus.</li>
              </ol>
            </div>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${invitationLink}" style="background: #3b5bdb; color: #fff; padding: 14px 34px; border-radius: 999px; font-size: 15px; font-weight: 600; text-decoration: none; display: inline-block;">
                Accept Invitation
              </a>
            </div>

            <p style="font-size: 13px; color: #98a2b3; margin-top: 0;">If the button doesn’t work, copy and paste this link into your browser:</p>
            <p style="font-size: 12px; color: #3b5bdb; word-break: break-all; margin-top: 4px;">${invitationLink}</p>

            <p style="font-size: 13px; color: #475467; margin-top: 24px;">
              Need help or didn’t expect this invitation? Reach out to the Impact Plus admin for ${organizationName}, or reply to this email.
            </p>

            <hr style="border: none; border-top: 1px solid #edf0f6; margin: 28px 0;" />

            <p style="font-size: 12px; color: #98a2b3; text-align: center; margin: 0;">
              This invitation expires in ${expiryDays} days. If the link has expired, please request a new invitation.
            </p>
          </div>
          <p style="text-align: center; font-size: 11px; color: #98a2b3; margin-top: 16px;">
            © ${new Date().getFullYear()} ${this.appName}. All rights reserved.
          </p>
        </div>
      `;

      const text = `You've been invited to join ${organizationName}

Hello${username ? ' ' + username : ''},

You have been invited to join ${organizationName} on ${this.appName} as a ${roleLabel}.

Click the link below to accept the invitation and set up your account:

${invitationLink}

This invitation link will expire in ${expiryDays} days.

Steps to accept:
1. Open the link within ${expiryDays} days.
2. Create a secure password.
3. Sign in to start collaborating with your team.

If you didn't expect this invitation, contact your Impact Plus administrator or reply to this email.

© ${new Date().getFullYear()} ${this.appName}. All rights reserved.`;

      const emailMessage = {
        to: email,
        subject: `Invitation to join ${organizationName} on ${this.appName}`,
        template: 'invitation',
        context: {
          invitationLink,
          organizationName,
          username,
          role,
          appName: this.appName,
          frontendUrl,
        },
        html,
        text,
        priority: 'high' as const,
      };

      const published = await this.rabbitMQService.publishEmail(emailMessage);
      
      if (published) {
        this.logger.log(`✅ Invitation email queued for ${email}`);
      } else {
        this.logger.warn(`⚠️ Failed to queue invitation email for ${email}`);
      }

      return published;
    } catch (error) {
      this.logger.error(`❌ Error sending invitation email to ${email}:`, error);
      return false;
    }
  }

  async sendSurveyReminderEmail(
    email: string,
    subject: string,
    body: string,
    context: Record<string, string> = {},
  ): Promise<boolean> {
    try {
      const compiledBody = this.interpolateTemplate(body, context);
      const emailMessage = {
        to: email,
        subject,
        template: 'survey-reminder',
        context: {
          ...context,
          appName: this.appName,
        },
        html: compiledBody,
        text: compiledBody.replace(/<[^>]+>/g, ''),
        priority: 'normal' as const,
      };

      const published = await this.rabbitMQService.publishEmail(emailMessage);
      if (published) {
        this.logger.log(`✅ Survey reminder queued for ${email}`);
      } else {
        this.logger.warn(`⚠️ Failed to queue survey reminder for ${email}`);
      }
      return published;
    } catch (error) {
      this.logger.error(`❌ Error sending survey reminder to ${email}:`, error);
      return false;
    }
  }

  private interpolateTemplate(template: string, context: Record<string, string>) {
    return template.replace(/\{(\w+)\}/g, (_, key) => context[key] || '');
  }

  async sendPasswordResetEmail(
    email: string,
    invitationToken: string,
    organizationName: string,
    username: string = '',
    expiryDays: number = 10,
  ): Promise<boolean> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:8080';
      const resetLink = `${frontendUrl}/reset-password?token=${invitationToken}`;

      const html = `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px; background: #f7f8fb; color: #101828;">
          <div style="background: #ffffff; border-radius: 18px; border: 1px solid #edf0f6; padding: 32px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #3b5bdb; margin: 0; font-size: 26px; letter-spacing: 0.04em;">${this.appName}</h1>
              <p style="color: #475467; font-size: 13px; margin-top: 4px;">AI-driven human capital advisory</p>
            </div>

            <div style="background: linear-gradient(120deg, #eef2ff, #fdf2ff); border-radius: 16px; padding: 24px; margin-bottom: 28px; text-align: center;">
              <p style="margin: 0; color: #344054; font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase;">Password reset</p>
              <h2 style="margin: 10px 0 0; font-size: 24px; font-weight: 600; color: #101828;">${organizationName}</h2>
            </div>

            <p style="font-size: 15px; margin-bottom: 16px;">Hello${username ? ` ${username}` : ''},</p>
            <p style="font-size: 15px; line-height: 1.6; color: #475467;">
              A password reset was requested for your ${this.appName} account. Use the secure link below to set a new password. This link remains active for ${expiryDays} days.
            </p>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${resetLink}" style="background: #3b5bdb; color: #fff; padding: 14px 34px; border-radius: 999px; font-size: 15px; font-weight: 600; text-decoration: none; display: inline-block;">
                Reset password
              </a>
            </div>

            <p style="font-size: 13px; color: #98a2b3; margin-top: 0;">If the button doesn’t work, copy and paste this link into your browser:</p>
            <p style="font-size: 12px; color: #3b5bdb; word-break: break-all; margin-top: 4px;">${resetLink}</p>

            <p style="font-size: 12px; color: #98a2b3; text-align: center; margin-top: 24px;">
              Didn’t request this? You can safely ignore this email—your password will remain unchanged.
            </p>
          </div>
          <p style="text-align: center; font-size: 11px; color: #98a2b3; margin-top: 16px;">
            © ${new Date().getFullYear()} ${this.appName}. All rights reserved.
          </p>
        </div>
      `;

      const text = `Password reset for ${this.appName}

Hello${username ? ' ' + username : ''},

A password reset was requested for your ${this.appName} account. Use the link below to set a new password within ${expiryDays} days:

${resetLink}

If you didn’t request this change, you can ignore this email.

© ${new Date().getFullYear()} ${this.appName}. All rights reserved.`;

      const emailMessage = {
        to: email,
        subject: `Reset your ${this.appName} password`,
        template: 'password-reset',
        context: {
          resetLink,
          organizationName,
          username,
          appName: this.appName,
          frontendUrl,
        },
        html,
        text,
        priority: 'high' as const,
      };

      const published = await this.rabbitMQService.publishEmail(emailMessage);
      if (published) {
        this.logger.log(`✅ Password reset email queued for ${email}`);
      } else {
        this.logger.warn(`⚠️ Failed to queue password reset email for ${email}`);
      }
      return published;
    } catch (error) {
      this.logger.error(`❌ Error sending password reset email to ${email}:`, error);
      return false;
    }
  }

}

