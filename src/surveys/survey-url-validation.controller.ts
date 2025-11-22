import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SurveysService } from './surveys.service';

@ApiTags('survey-url-validation')
@Controller('survey-url')
export class SurveyUrlValidationController {
  constructor(private readonly surveysService: SurveysService) {}

  @Get('validate/:url')
  @ApiOperation({ summary: 'Validate Survey URL' })
  @ApiResponse({ status: 200, description: 'Survey' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async validateUrl(@Param('url') url: string) {
    // Find survey by publicUrl or privateUrl
    const survey = await this.surveysService.findByUrl(url);
    
    if (!survey) {
      return {
        statusCode: 404,
        message: 'Survey not found',
      };
    }

    return {
      statusCode: 200,
      message: 'Survey',
      data: {
        id: survey._id.toString(),
        name: survey.name,
        category: survey.category,
        publicUrl: survey.publicUrl || null,
        privateUrl: survey.privateUrl || null,
        status: survey.status,
        isDeleted: survey.isDeleted,
        createdAt: (survey as any).createdAt || new Date(),
        updatedAt: (survey as any).updatedAt || new Date(),
      },
    };
  }
}

