import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsArray } from 'class-validator';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserPermission } from '../../users/user-permissions';

export class UpdateOrganizationUserDto {
  @ApiPropertyOptional({ description: 'User display name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Role inside the organization',
    enum: UserRole,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Toggle user activity',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Explicit permissions to assign',
    enum: UserPermission,
    isArray: true,
  })
  @IsArray()
  @IsEnum(UserPermission, { each: true })
  @IsOptional()
  permissions?: UserPermission[];
}


