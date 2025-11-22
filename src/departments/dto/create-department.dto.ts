import { IsString, IsOptional, IsBoolean, IsMongoId, IsNumber, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Department name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Department code (e.g., HR, IT, FIN)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Department description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent department ID (for hierarchy)' })
  @IsOptional()
  @IsMongoId()
  parentDepartmentId?: string;

  @ApiPropertyOptional({ description: 'Department head/manager ID' })
  @IsOptional()
  @IsMongoId()
  departmentHeadId?: string;

  @ApiPropertyOptional({ description: 'HR manager ID for this department' })
  @IsOptional()
  @IsMongoId()
  hrManagerId?: string;

  @ApiPropertyOptional({ description: 'Physical location/office' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Cost center code' })
  @IsOptional()
  @IsString()
  costCenter?: string;

  @ApiPropertyOptional({ description: 'Department budget' })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiPropertyOptional({ description: 'Department status', enum: ['active', 'inactive', 'archived'], default: 'active' })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'archived'])
  status?: string;

  @ApiPropertyOptional({ description: 'Maximum employee capacity' })
  @IsOptional()
  @IsNumber()
  maxCapacity?: number;

  @ApiPropertyOptional({ description: 'Tags for categorization', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: {
    establishedDate?: Date;
    reportingStructure?: string;
    businessUnit?: string;
    division?: string;
    [key: string]: any;
  };

  @ApiPropertyOptional({ description: 'Is department active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
