import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSurveyParticipantDto {
  @ApiProperty({ description: 'Participant full name' })
  @IsString()
  @IsNotEmpty()
  participantName: string;

  @ApiPropertyOptional({ description: 'Participant email' })
  @IsOptional()
  @IsEmail()
  participantEmail?: string;

  @ApiProperty({ description: 'Respondent full name' })
  @IsString()
  @IsNotEmpty()
  respondentName: string;

  @ApiProperty({ description: 'Respondent email' })
  @IsEmail()
  @IsNotEmpty()
  respondentEmail: string;

  @ApiPropertyOptional({ description: 'Relationship between participant and respondent' })
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiPropertyOptional({ description: 'Completion status (Completed, In Progress, etc.)' })
  @IsOptional()
  @IsString()
  completionStatus?: string;

  @ApiPropertyOptional({ description: 'Completion date in ISO string or Excel serial date format' })
  @IsOptional()
  @IsString()
  completionDate?: string;
}

export class UpdateSurveyParticipantDto extends CreateSurveyParticipantDto {}


