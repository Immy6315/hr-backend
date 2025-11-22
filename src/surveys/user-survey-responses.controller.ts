import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserSurveyResponsesService } from './user-survey-responses.service';
import { CreateResponseDto } from './dto/create-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('responses')
@Controller('responses')
export class UserSurveyResponsesController {
  constructor(
    private readonly responsesService: UserSurveyResponsesService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Submit a response to a question' })
  @ApiResponse({ status: 201, description: 'Response submitted successfully' })
  async create(@Body() createResponseDto: CreateResponseDto, @Req() req) {
    return this.responsesService.create(req.user.userId, createResponseDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all responses' })
  @ApiQuery({ name: 'userSurveyId', required: false })
  @ApiQuery({ name: 'surveyId', required: false })
  @ApiQuery({ name: 'questionId', required: false })
  @ApiResponse({ status: 200, description: 'List of responses' })
  async findAll(
    @Query('userSurveyId') userSurveyId?: string,
    @Query('surveyId') surveyId?: string,
    @Query('questionId') questionId?: string,
  ) {
    return this.responsesService.findAll(userSurveyId, surveyId, questionId);
  }

  @Get('user-survey/:userSurveyId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all responses for a user survey' })
  @ApiResponse({ status: 200, description: 'List of responses' })
  async findByUserSurvey(@Param('userSurveyId') userSurveyId: string) {
    return this.responsesService.findByUserSurvey(userSurveyId);
  }

  @Get('analytics/:surveyId/:questionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get analytics for a question' })
  @ApiResponse({ status: 200, description: 'Question analytics' })
  async getQuestionAnalytics(
    @Param('surveyId') surveyId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.responsesService.getQuestionAnalytics(surveyId, questionId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get response by ID' })
  @ApiResponse({ status: 200, description: 'Response details' })
  @ApiResponse({ status: 404, description: 'Response not found' })
  async findOne(@Param('id') id: string) {
    return this.responsesService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete response' })
  @ApiResponse({ status: 200, description: 'Response deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.responsesService.remove(id);
    return { message: 'Response deleted successfully' };
  }
}

