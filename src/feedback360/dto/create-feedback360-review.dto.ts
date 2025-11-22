import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, IsMongoId, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeedback360ReviewDto {
  @ApiProperty({ description: 'Employee ID being reviewed' })
  @IsMongoId()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ description: 'Manager ID providing feedback' })
  @IsMongoId()
  @IsNotEmpty()
  managerId: string;

  @ApiProperty({ description: 'Review cycle name' })
  @IsString()
  @IsNotEmpty()
  reviewCycle: string;

  @ApiPropertyOptional({ description: 'Peer employee IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  peerIds?: string[];

  @ApiPropertyOptional({ description: 'Direct report employee IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  directReportIds?: string[];

  @ApiPropertyOptional({ description: 'Competencies to assess', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  competencies?: string[];

  @ApiPropertyOptional({ description: 'Custom instructions for reviewers' })
  @IsOptional()
  @IsString()
  customInstructions?: string;

  @ApiPropertyOptional({ description: 'Enable anonymous feedback', default: false })
  @IsOptional()
  @IsBoolean()
  anonymousFeedback?: boolean;

  @ApiPropertyOptional({ description: 'Start date' })
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'End date' })
  @IsOptional()
  endDate?: Date;
}

