import { IsString, IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddNomineeDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    respondentName: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    respondentEmail: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    relationship: string;
}
