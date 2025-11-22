import { Controller, Put, Body, Param, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SurveysService } from './surveys.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('survey-builder')
@Controller('survey-builder/surveys/:surveyId/visibility')
export class SurveyVisibilityController {
  constructor(private readonly surveysService: SurveysService) {}

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update Survey Visibility' })
  @ApiResponse({ status: 200, description: 'Updated Survey Settings Visibility' })
  async updateVisibility(
    @Param('surveyId') surveyId: string,
    @Body() body: { publicEnabled: boolean; privateEnabled: boolean },
  ) {
    // This would typically update a settings document
    // For now, we'll just return success
    // In a real implementation, you'd update the survey settings
    return {
      statusCode: 200,
      message: 'Updated Survey Settings Visibility',
    };
  }
}

