import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;
  private readonly appName = 'Impact Plus';

  constructor(private readonly configService: ConfigService) {
    this.transporter = this.createTransporter();
  }

  private createTransporter(): nodemailer.Transporter {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = this.configService.get<number>('SMTP_PORT') || 587;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!user || !pass) {
      this.logger.warn('⚠️ SMTP credentials not configured. Email sending will fail.');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    // Verify connection asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await transporter.verify();
        this.logger.log('✅ SMTP connection verified successfully');
      } catch (error) {
        this.logger.warn(`⚠️ SMTP verification failed (non-blocking): ${error.message}`);
      }
    });

    return transporter;
  }

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    try {
      const fromEmail = this.configService.get<string>('SMTP_FROM') || this.configService.get<string>('SMTP_USER') || 'noreply@impactplus.com';

      const mailOptions = {
        from: `"${this.appName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      this.logger.log(`✅ Email sent successfully to ${options.to} (Message ID: ${result.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Error sending email to ${options.to}:`, error.message);
      
      if (error.code === 'EAUTH') {
        this.logger.error('❌ SMTP Authentication failed. Check SMTP credentials.');
      } else if (error.code === 'ECONNECTION') {
        this.logger.error('❌ SMTP Connection failed. Check SMTP host and port.');
      }
      
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('✅ SMTP connection verified successfully');
      return true;
    } catch (error) {
      this.logger.error('❌ SMTP connection verification failed:', error);
      return false;
    }
  }
}

