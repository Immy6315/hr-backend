import { IsString, IsNotEmpty, IsMongoId, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateResponseDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  userSurveyId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  questionType: string;

  @ApiProperty({ description: 'Response can be string, number, array, or object' })
  @IsNotEmpty()
  response: any;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  score?: number;
}

