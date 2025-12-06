import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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

  @ApiPropertyOptional({ description: 'Who added the participant', enum: ['admin', 'participant'] })
  @IsOptional()
  @IsString()
  addedBy?: 'admin' | 'participant';

  @ApiPropertyOptional({ description: 'Verification status', enum: ['pending', 'verified', 'rejected'] })
  @IsOptional()
  @IsString()
  verificationStatus?: 'pending' | 'verified' | 'rejected';
}

export class UpdateSurveyParticipantDto extends PartialType(CreateSurveyParticipantDto) {
  @ApiPropertyOptional({ description: 'Nomination status', enum: ['not_started', 'in_progress', 'submitted'] })
  @IsOptional()
  @IsString()
  nominationStatus?: 'not_started' | 'in_progress' | 'submitted';
}

