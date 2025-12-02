import { PartialType } from '@nestjs/swagger';
import { CreateSurveyDto } from './create-survey.dto';
import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

// Helper to clean empty objects
function cleanEmptyObject(value: any) {
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
        return undefined;
    }
    return value;
}

export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {
    @IsOptional()
    @Transform(({ value }) => cleanEmptyObject(value))
    startDate?: Date;

    @IsOptional()
    @Transform(({ value }) => cleanEmptyObject(value))
    endDate?: Date;
}
