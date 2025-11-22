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
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserSurveysService } from './user-surveys.service';
import { CreateUserSurveyDto } from './dto/create-user-survey.dto';
import { UserSurveyStatus } from './schemas/user-survey.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('user-surveys')
@Controller('user-surveys')
export class UserSurveysController {
  constructor(private readonly userSurveysService: UserSurveysService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Start a new survey' })
  @ApiResponse({ status: 201, description: 'Survey started successfully' })
  async create(@Body() createUserSurveyDto: CreateUserSurveyDto, @Req() req) {
    return this.userSurveysService.create(req.user.userId, createUserSurveyDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all user surveys' })
  @ApiQuery({ name: 'surveyId', required: false })
  @ApiQuery({ name: 'status', enum: UserSurveyStatus, required: false })
  @ApiResponse({ status: 200, description: 'List of user surveys' })
  async findAll(
    @Req() req,
    @Query('surveyId') surveyId?: string,
    @Query('status') status?: UserSurveyStatus,
  ) {
    return this.userSurveysService.findAll(req.user.userId, surveyId, status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user survey by ID' })
  @ApiResponse({ status: 200, description: 'User survey details' })
  @ApiResponse({ status: 404, description: 'User survey not found' })
  async findOne(@Param('id') id: string) {
    return this.userSurveysService.findOne(id);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark survey as completed' })
  @ApiResponse({ status: 200, description: 'Survey completed successfully' })
  async complete(
    @Param('id') id: string,
    @Body() body?: {
      userAgent?: string;
      surveyUrl?: string;
      collector?: string;
      tags?: string[];
    },
  ) {
    return this.userSurveysService.complete(id, body);
  }

  @Patch(':id/abandon')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Abandon survey' })
  @ApiResponse({ status: 200, description: 'Survey abandoned successfully' })
  async abandon(@Param('id') id: string) {
    return this.userSurveysService.abandon(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user survey' })
  @ApiResponse({ status: 200, description: 'User survey deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.userSurveysService.remove(id);
    return { message: 'User survey deleted successfully' };
  }
}

