import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '../users/schemas/user.schema';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private emailService: EmailService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user account is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Check role match
    if (loginDto.role && user.role !== loginDto.role) {
      throw new UnauthorizedException(
        `This email is registered as ${user.role}. Please sign in with the correct role.`,
      );
    }

    if (!user.verified) {
      throw new UnauthorizedException('Email not verified. Please verify your email first.');
    }

    const mappedUser = this.mapUserResponse(user);
    const tokenPayload = {
      sub: mappedUser.id,
      email: mappedUser.email,
      role: mappedUser.role,
      organizationId: mappedUser.organizationId,
      permissions: mappedUser.permissions,
    };

    return {
      user: mappedUser,
      token: this.jwtService.sign(tokenPayload),
    };
  }

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      if (!existingUser.isActive) {
        // Delete the old user
        await this.usersService.remove(existingUser._id.toString());
      } else {
        throw new BadRequestException('User with this email already exists');
      }
    }

    // Generate OTP
    const otp = this.generateOtp();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP valid for 10 minutes

    // Create the user
    const userData = {
      ...registerDto,
      password: await this.hashPassword(registerDto.password),
      verified: registerDto.role === UserRole.SUPER_ADMIN ? true : false,
      verificationOtp: registerDto.role === UserRole.SUPER_ADMIN ? undefined : otp,
      otpExpiry: registerDto.role === UserRole.SUPER_ADMIN ? undefined : otpExpiry,
      isActive: true,
      organizationId: registerDto.organizationId
        ? new Types.ObjectId(registerDto.organizationId)
        : undefined,
    };

    const user = await this.usersService.create(userData);

    // Send verification email via RabbitMQ (non-blocking)
    if (registerDto.role !== UserRole.SUPER_ADMIN) {
      this.emailService.sendVerificationEmail(registerDto.email, otp, registerDto.name).catch((err) => {
        this.logger.error(`Failed to send verification email: ${err.message}`);
      });
    } else {
      this.logger.log(`Admin user created - no verification email sent for ${registerDto.email}`);
    }

    return {
      user: this.mapUserResponse(user),
      message:
        registerDto.role === UserRole.SUPER_ADMIN
          ? `${registerDto.role} user created successfully`
          : 'Registration successful. Please verify your email.',
    };
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.verified) {
      return {
        success: true,
        message: 'Email already verified',
        user: this.mapUserResponse(user),
        token: this.jwtService.sign({
          sub: user._id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId ? user.organizationId.toString() : null,
          permissions: user.permissions || [],
        }),
      };
    }

    if (!user.verificationOtp) {
      throw new BadRequestException('No OTP found for this user');
    }

    if (user.otpExpiry < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    if (user.verificationOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // Update user to verified
    await this.usersService.update(user._id.toString(), {
      verified: true,
      verificationOtp: undefined,
      otpExpiry: undefined,
    });

    const updatedUser = await this.usersService.findById(user._id.toString());

    const mappedUser = this.mapUserResponse(updatedUser);
    return {
      success: true,
      message: 'Email verified successfully',
      user: mappedUser,
      token: this.jwtService.sign({
        sub: mappedUser.id,
        email: mappedUser.email,
        role: mappedUser.role,
        organizationId: mappedUser.organizationId,
        permissions: mappedUser.permissions,
      }),
    };
  }

  async resendOtp(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.verified) {
      throw new BadRequestException('Email already verified');
    }

    // Generate new OTP
    const otp = this.generateOtp();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP valid for 10 minutes

    // Update user with new OTP
    await this.usersService.update(user._id.toString(), {
      verificationOtp: otp,
      otpExpiry: otpExpiry,
    });

    // Send verification email via RabbitMQ (non-blocking)
    this.emailService.sendVerificationEmail(email, otp, user.name).catch((err) => {
      console.error(`Failed to resend verification email: ${err.message}`);
    });

    return {
      success: true,
      message: 'OTP resent successfully. Please check your email.',
    };
  }

  async acceptInvitation(token: string, password: string) {
    const user = await this.usersService.findByInvitationToken(token);

    if (!user) {
      throw new BadRequestException('Invalid invitation token');
    }

    // Check if invitation already accepted
    if (user.invitationAccepted) {
      throw new BadRequestException('This invitation has already been accepted. Please login with your password.');
    }

    // Check if token expired
    if (user.invitationTokenExpiry && user.invitationTokenExpiry < new Date()) {
      throw new BadRequestException('Invitation token has expired. Please request a new invitation.');
    }

    // Check if password is provided
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long');
    }

    // Hash password and update user
    const hashedPassword = await this.hashPassword(password);
    await this.usersService.update(user._id.toString(), {
      password: hashedPassword,
      invitationAccepted: true,
      verified: true,
      invitationToken: undefined,
      invitationTokenExpiry: undefined,
      passwordResetToken: undefined,
      passwordResetTokenExpiry: undefined,
    });

    // Get updated user
    const updatedUser = await this.usersService.findById(user._id.toString());

    const mappedUser = this.mapUserResponse(updatedUser);

    return {
      success: true,
      message: 'Invitation accepted successfully. You can now login.',
      user: mappedUser,
    };
  }

  async getInvitationDetails(token: string) {
    const user = await this.usersService.findByInvitationToken(token);

    if (!user) {
      throw new BadRequestException('Invalid invitation token');
    }

    // Check if invitation already accepted
    if (user.invitationAccepted) {
      throw new BadRequestException('This invitation has already been accepted. Please login with your password.');
    }

    // Check if token expired
    if (user.invitationTokenExpiry && user.invitationTokenExpiry < new Date()) {
      throw new BadRequestException('Invitation token has expired. Please request a new invitation.');
    }

    return {
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId?.toString(),
      permissions: user.permissions || [],
    };
  }

  async getPasswordResetDetails(token: string) {
    const user = await this.usersService.findByPasswordResetToken(token);

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset link.');
    }

    if (user.passwordResetTokenExpiry && user.passwordResetTokenExpiry < new Date()) {
      throw new BadRequestException('Password reset link has expired. Please request a new reset.');
    }

    if (!user.invitationAccepted) {
      throw new BadRequestException('This account has not completed onboarding yet.');
    }

    return {
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.usersService.findByPasswordResetToken(token);

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset link.');
    }

    if (user.passwordResetTokenExpiry && user.passwordResetTokenExpiry < new Date()) {
      throw new BadRequestException('Password reset link has expired. Please request a new reset.');
    }

    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long');
    }

    const hashedPassword = await this.hashPassword(password);
    await this.usersService.update(user._id.toString(), {
      password: hashedPassword,
      passwordResetToken: undefined,
      passwordResetTokenExpiry: undefined,
      verified: true,
      invitationAccepted: true,
    });

    return {
      success: true,
      message: 'Password reset successfully. You can now login.',
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }

  private mapUserResponse(user: any) {
    return {
      id: user._id?.toString() || user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified,
      organizationId: user.organizationId ? user.organizationId.toString() : null,
      permissions: user.permissions || [],
    };
  }
}

