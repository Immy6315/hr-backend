import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsObject,
  IsNumber,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SurveyStatus } from '../schemas/survey.schema';

export class QuestionOptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ required: false })
  @IsOptional()
  seqNo?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  uniqueOrder?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  mandatoryEnabled?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  preSelected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  score?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}

export class ValidationOptionsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  maxvalue?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  minvalue?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  minlength?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  maxlength?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  scaleFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  scaleTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startLabel?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  endLabel?: string;

}

export class GridRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ required: false })
  @IsOptional()
  uniqueOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  score?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  columnsId?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  columns?: any[];
}

export class GridColumnDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ required: false })
  @IsOptional()
  uniqueOrder?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  mandatoryEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  rowId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  questionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  question?: any;
}

export class SurveyQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  validationEnabled?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  mandatoryEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mandatoryMsg?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  hintEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hintMsg?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  randomEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  randomizationType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  randomizeType?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  noneOptionEnabled?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  otherOptionEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  otherOptionMsg?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  commentEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentMsg?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  notApplicableEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notApplicableMsg?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  scoreEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  uniqueOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  answerWidth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  initialMsg?: string;

  @ApiProperty({ type: [QuestionOptionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @ApiProperty({ type: ValidationOptionsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ValidationOptionsDto)
  validation?: ValidationOptionsDto;

  @ApiProperty({ type: [GridRowDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridRowDto)
  gridRows?: GridRowDto[];

  @ApiProperty({ type: [GridColumnDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridColumnDto)
  gridColumns?: GridColumnDto[];
}

export class SurveyPageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  uniqueOrder?: number;

  @ApiProperty({ type: [SurveyQuestionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyQuestionDto)
  questions?: SurveyQuestionDto[];

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}

export class ReminderTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  schedule?: string;
}

export class EmailTemplateContentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  html: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class CommunicationTemplatesDto {
  @ApiProperty({ required: false, type: EmailTemplateContentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateContentDto)
  participantInvite?: EmailTemplateContentDto;

  @ApiProperty({ required: false, type: EmailTemplateContentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateContentDto)
  respondentInvite?: EmailTemplateContentDto;

  @ApiProperty({ required: false, type: EmailTemplateContentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateContentDto)
  respondentReminder?: EmailTemplateContentDto;

  @ApiProperty({ required: false, type: EmailTemplateContentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailTemplateContentDto)
  respondentCancellation?: EmailTemplateContentDto;
}

export class ReminderSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  waitBeforeReminderHours?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reminderFrequency?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  completionStatusDashboard?: Record<string, any>;
}

export class RatingScaleEntryDto {
  @ApiProperty()
  @IsNumber()
  weight: number;

  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateSurveyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ enum: SurveyStatus, required: false, default: SurveyStatus.DRAFT })
  @IsOptional()
  @IsEnum(SurveyStatus)
  status?: SurveyStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [SurveyPageDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyPageDto)
  pages?: SurveyPageDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  startDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  endDate?: Date;

  @ApiProperty({ required: false, description: 'Organization that owns this survey' })
  @IsOptional()
  @IsMongoId()
  organizationId?: string;

  @ApiProperty({
    required: false,
    type: [ReminderTemplateDto],
    description: 'Reminder templates associated with the survey',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderTemplateDto)
  reminderTemplates?: ReminderTemplateDto[];

  @ApiProperty({
    required: false,
    type: CommunicationTemplatesDto,
    description: 'Email templates parsed from the Communication sheet',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommunicationTemplatesDto)
  communicationTemplates?: CommunicationTemplatesDto;

  @ApiProperty({
    required: false,
    type: ReminderSettingsDto,
    description: 'Reminder & dashboard configuration parsed from Excel',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderSettingsDto)
  reminderSettings?: ReminderSettingsDto;

  @ApiProperty({
    required: false,
    type: Object,
    description: 'Raw project details parsed from Excel',
  })
  @IsOptional()
  @IsObject()
  projectDetails?: Record<string, any>;

  @ApiProperty({
    required: false,
    type: [RatingScaleEntryDto],
    description: 'Rating scale reference parsed from Excel',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingScaleEntryDto)
  ratingScale?: RatingScaleEntryDto[];
}

