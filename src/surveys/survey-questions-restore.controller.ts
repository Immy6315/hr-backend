import { Controller, Put, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SurveyQuestionsService } from './survey-questions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('survey-builder')
@Controller('survey-builder/surveys/:surveyId/pages/:pageId/deleted-questions/:questionId')
export class SurveyQuestionsRestoreController {
  constructor(private readonly surveyQuestionsService: SurveyQuestionsService) {}

  @Put('restore')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore Survey Question' })
  @ApiResponse({ status: 200, description: 'Survey Question Restored' })
  async restore(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string,
    @Param('questionId') questionId: string,
  ) {
    await this.surveyQuestionsService.restoreQuestionById(surveyId, pageId, questionId);
    return {
      statusCode: 200,
      message: 'Survey Question Restored',
    };
  }
}

