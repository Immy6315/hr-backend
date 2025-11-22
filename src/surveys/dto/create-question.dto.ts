import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsBoolean, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { QuestionOptionDto } from './create-survey.dto';
import { ValidationOptionsDto } from './create-survey.dto';
import { GridRowDto, GridColumnDto } from './create-survey.dto';

export class CreateQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string; // SINGLE_CHOICE, MULTIPLE_CHOICE, CHECK_BOX, etc.

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  uniqueOrder?: string;

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
  @IsString()
  answerWidth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  initialMsg?: string;

  // For questions with options
  @ApiProperty({ type: [QuestionOptionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  // For questions with validation
  @ApiProperty({ type: ValidationOptionsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ValidationOptionsDto)
  validation?: ValidationOptionsDto;

  @ApiProperty({ type: ValidationOptionsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ValidationOptionsDto)
  validations?: ValidationOptionsDto; // Some APIs use 'validations' plural

  // For grid questions
  @ApiProperty({ type: [GridRowDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridRowDto)
  row?: GridRowDto[];

  @ApiProperty({ type: [GridRowDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridRowDto)
  gridRows?: GridRowDto[];

  // For grid columns
  @ApiProperty({ type: [GridColumnDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridColumnDto)
  columns?: GridColumnDto[];

  @ApiProperty({ type: [GridColumnDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridColumnDto)
  gridColumns?: GridColumnDto[];

  // For width (SHORT_ANSWER, LONG_ANSWER)
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  width?: number;

  // For MATRIX types
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  columnRandomEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  columnRandomizationType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  weightageEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  showWeightage?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  displayFormat?: string;

  // Display Logic fields
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  displayLogicEnabled?: boolean;

  @ApiProperty({ required: false, default: 'always' })
  @IsOptional()
  @IsString()
  displayLogicType?: string; // 'always', 'conditional', 'never', 'hide-conditional'

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  displayLogicConditions?: any[]; // Array of conditions: [{ questionId, operator, value }]
}

