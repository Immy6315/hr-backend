import {
  Controller,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  Get,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    schema: {
      properties: {
        user: { type: 'object' },
        token: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid credentials' })
  @Post('login')
  @UsePipes(new ValidationPipe())
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }

  @Public()
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    schema: {
      properties: {
        user: { type: 'object' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - email already exists' })
  @Post('register')
  @UsePipes(new ValidationPipe())
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @ApiOperation({ summary: 'Verify OTP' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        user: { type: 'object' },
        token: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid OTP' })
  @Post('verify-otp')
  @UsePipes(new ValidationPipe())
  async verifyOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyOtp(body.email, body.otp);
  }

  @Public()
  @ApiOperation({ summary: 'Resend OTP' })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
    schema: {
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - user not found or already verified' })
  @Post('resend-otp')
  @UsePipes(new ValidationPipe())
  async resendOtp(@Body() body: { email: string }) {
    return this.authService.resendOtp(body.email);
  }

  @ApiOperation({ summary: 'Validate token' })
  @ApiResponse({
    status: 200,
    description: 'Token is valid',
    schema: {
      properties: {
        valid: { type: 'boolean' },
        message: { type: 'string' },
        user: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid token' })
  @Get('validate-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async validateToken(@Req() req) {
    return {
      valid: true,
      message: 'Token is valid',
      user: {
        id: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        organizationId: req.user.organizationId || req.user.user?.organizationId || null,
        permissions: req.user.permissions || req.user.user?.permissions || [],
      },
    };
  }

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getProfile(@Req() req) {
    const user = await this.authService['usersService'].findById(req.user.userId);
    const { password, verificationOtp, otpExpiry, ...userInfo } = user.toObject();
    return {
      user: userInfo,
    };
  }

  @Public()
  @ApiOperation({ summary: 'Get invitation details' })
  @ApiResponse({
    status: 200,
    description: 'Invitation details retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @Get('invitation')
  async getInvitationDetails(@Query('token') token: string) {
    return this.authService.getInvitationDetails(token);
  }

  @Public()
  @ApiOperation({ summary: 'Accept invitation and set password' })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid token or password' })
  @Post('accept-invitation')
  @UsePipes(new ValidationPipe())
  async acceptInvitation(@Body() body: { token: string; password: string }) {
    return this.authService.acceptInvitation(body.token, body.password);
  }

  @Public()
  @ApiOperation({ summary: 'Get password reset details' })
  @ApiResponse({ status: 200, description: 'Password reset details fetched successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @Get('password-reset')
  async getPasswordResetDetails(@Query('token') token: string) {
    return this.authService.getPasswordResetDetails(token);
  }

  @Public()
  @ApiOperation({ summary: 'Reset password using email link' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or password' })
  @Post('reset-password')
  @UsePipes(new ValidationPipe())
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.password);
  }
}

