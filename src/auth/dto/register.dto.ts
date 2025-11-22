import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional, IsMongoId } from 'class-validator';
import { UserRole } from '../../users/schemas/user.schema';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'User name', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'User password', example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.PARTICIPANT,
    default: UserRole.PARTICIPANT,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role: UserRole = UserRole.PARTICIPANT;

  @ApiProperty({ description: 'Phone number', required: false })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({
    description: 'Organization ID (for org-level users)',
    example: '60f7c0f4b3b1d72d6c8f9a12',
    required: false,
  })
  @IsMongoId()
  @IsOptional()
  organizationId?: string;
}

