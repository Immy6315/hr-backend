import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SurveyQuestionsService } from './survey-questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('survey-builder')
@Controller('survey-builder/surveys/:surveyId/pages/:pageId/questions')
export class SurveyQuestionsController {
  constructor(private readonly surveyQuestionsService: SurveyQuestionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create Survey Question (supports all 19 question types)' })
  @ApiResponse({ status: 200, description: 'Created Survey Question' })
  async create(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string,
    @Body() questionDto: CreateQuestionDto,
  ) {
    const question = await this.surveyQuestionsService.createQuestion(surveyId, pageId, questionDto);
    return {
      statusCode: 200,
      message: 'Created Survey Question',
      data: question,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all questions for a page' })
  @ApiQuery({ name: 'index', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Questions retrieved' })
  async findAll(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string,
    @Query('index') index?: number,
  ) {
    if (index !== undefined) {
      const question = await this.surveyQuestionsService.getQuestion(surveyId, pageId, Number(index));
      return {
        statusCode: 200,
        message: 'Question Found',
        data: question,
      };
    }
    // Return all questions logic here if needed
    return { statusCode: 200, message: 'Questions retrieved', data: [] };
  }

  @Get(':questionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Question by ID' })
  @ApiResponse({ status: 200, description: 'Survey Question Found' })
  @ApiResponse({ status: 404, description: 'Question not found' })
  async findOne(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string,
    @Param('questionId') questionId: string,
  ) {
    return await this.surveyQuestionsService.getQuestionById(surveyId, pageId, questionId);
  }

  @Put(':questionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update Question by ID' })
  @ApiResponse({ status: 200, description: 'Question Updated' })
  async update(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string,
    @Param('questionId') questionId: string,
    @Body() questionDto: Partial<CreateQuestionDto>,
  ) {
    return await this.surveyQuestionsService.updateQuestionById(
      surveyId,
      pageId,
      questionId,
      questionDto,
    );
  }

  @Delete(':questionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete Question by ID' })
  @ApiResponse({ status: 200, description: 'Survey Question Deleted' })
  async delete(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string,
    @Param('questionId') questionId: string,
  ) {
    await this.surveyQuestionsService.deleteQuestionById(surveyId, pageId, questionId);
    return {
      statusCode: 200,
      message: 'Survey Question Deleted',
    };
  }
}

