import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SurveyQuestionsService } from './survey-questions.service';
import { SurveyPagesService } from './survey-pages.service';

@ApiTags('survey-builder')
@Controller('survey-builder/search-question')
export class SurveySearchController {
  constructor(
    private readonly surveyQuestionsService: SurveyQuestionsService,
    private readonly surveyPagesService: SurveyPagesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search Question' })
  @ApiQuery({ name: 'text', required: true, description: 'Search text' })
  @ApiResponse({ status: 200, description: 'List of Questions' })
  async searchQuestions(@Query('text') text: string) {
    // Search across all surveys and pages
    const allPages = await this.surveyPagesService.searchQuestions(text);

    const questions = [];
    const seenIds = new Set<string>();

    for (const page of allPages) {
      for (const question of page.questions) {
        const questionId = question.questionId || (question as any)._id?.toString();
        if (
          !question.isDeleted &&
          question.text.toLowerCase().includes(text.toLowerCase()) &&
          !seenIds.has(questionId)
        ) {
          questions.push({
            id: questionId,
            text: question.text,
          });
          seenIds.add(questionId);
        }
      }
    }

    return {
      statusCode: 200,
      message: 'List of Questions',
      data: {
        questions,
        totalQuestions: questions.length,
      },
    };
  }
}

