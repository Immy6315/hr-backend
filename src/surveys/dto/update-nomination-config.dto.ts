import { IsBoolean, IsArray, IsString, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class NominationRequirementDto {
    @ApiProperty()
    @IsString()
    relationship: string;

    @ApiProperty()
    @IsNumber()
    minCount: number;
}

export class UpdateNominationConfigDto {
    @ApiProperty()
    @IsBoolean()
    isOpen: boolean;

    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    allowedRelationships: string[];

    @ApiProperty({ type: [NominationRequirementDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => NominationRequirementDto)
    requirements: NominationRequirementDto[];

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    instructions?: string;
}
