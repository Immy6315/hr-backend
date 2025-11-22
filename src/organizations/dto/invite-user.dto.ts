import { IsEmail, IsNotEmpty, IsString, IsEnum, IsOptional, IsArray } from 'class-validator';
import { UserRole } from '../../users/schemas/user.schema';
import { ApiProperty } from '@nestjs/swagger';
import { UserPermission } from '../../users/user-permissions';

export class InviteUserDto {
  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'User name', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.PARTICIPANT,
    default: UserRole.PARTICIPANT,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiProperty({
    description: 'Custom permissions for the invited user',
    enum: UserPermission,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(UserPermission, { each: true })
  permissions?: UserPermission[];
}

