import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateFeedback360ReviewDto } from './create-feedback360-review.dto';
import { ReviewStatus } from '../schemas/feedback360-review.schema';

export class UpdateFeedback360ReviewDto extends PartialType(CreateFeedback360ReviewDto) {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}

