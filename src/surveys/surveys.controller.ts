import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SurveysService } from './surveys.service';
import { SurveyParticipantsService } from './survey-participants.service';
import { EmailService } from '../email/email.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { SurveyStatus } from './schemas/survey.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserSurveysService } from './user-surveys.service';

@ApiTags('survey-builder')
@Controller('survey-builder/surveys')
export class SurveysController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly userSurveysService: UserSurveysService,
    private readonly participantsService: SurveyParticipantsService,
    private readonly emailService: EmailService,
  ) { }

  @Post(':surveyId/reminders/send')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Send reminder emails to pending participants' })
  async sendSurveyReminder(@Param('surveyId') surveyId: string, @Req() req: any) {
    const survey = await this.surveysService.findOne(surveyId, {
      userId: req.user.userId,
      role: req.user.role,
      organizationId: req.user.organizationId || req.user.user?.organizationId?.toString(),
    });

    const template = survey.reminderTemplates?.[0];
    if (!template) {
      throw new BadRequestException('No reminder template configured for this survey.');
    }

    const pendingParticipants = await this.participantsService.findPendingParticipants(surveyId);
    if (!pendingParticipants.length) {
      return {
        message: 'No pending participants to remind.',
        data: { total: 0 },
      };
    }

    const promises = pendingParticipants
      .filter((participant) => participant.respondentEmail)
      .map((participant) => {
        const context = {
          assesseename: participant.participantName || '',
          respondentname: participant.respondentName || '',
          duedate: survey.endDate ? new Date(survey.endDate).toLocaleDateString() : '',
        };
        return this.emailService.sendSurveyReminderEmail(
          participant.respondentEmail!,
          template.subject,
          template.body,
          context,
        );
      });

    await Promise.all(promises);

    return {
      message: 'Reminder emails queued successfully',
      data: {
        total: pendingParticipants.length,
      },
    };
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create a new survey' })
  @ApiResponse({ status: 201, description: 'Survey created successfully' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  async create(@Body() createSurveyDto: CreateSurveyDto, @Req() req) {
    const userOrgId =
      req.user.organizationId || req.user.user?.organizationId?.toString() || undefined;

    const requestedOrgId = createSurveyDto.organizationId;
    const payload: CreateSurveyDto = { ...createSurveyDto };
    delete (payload as any).organizationId;

    let organizationId = userOrgId;

    if (requestedOrgId) {
      if (req.user.role === UserRole.SUPER_ADMIN) {
        organizationId = requestedOrgId;
      } else if (userOrgId && userOrgId.toString() === requestedOrgId) {
        organizationId = requestedOrgId;
      } else {
        throw new ForbiddenException('You can only create surveys for your organization');
      }
    }

    return this.surveysService.create(payload, req.user.userId, organizationId);
  }

  @Post('upload-excel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload survey via Excel (Super Admin & Org Admin)',
    description:
      'Accepts an Excel file and creates a survey with pages and questions based on the sheet contents.',
  })
  @ApiResponse({ status: 201, description: 'Survey created from Excel successfully' })
  async uploadSurveyFromExcel(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const organizationId =
      req.user.organizationId || req.user.user?.organizationId?.toString() || undefined;

    const survey = await this.surveysService.createFromExcel(
      file,
      req.user.userId,
      organizationId,
    );

    return {
      message: 'Survey created from Excel successfully',
      data: survey,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all surveys for the authenticated user' })
  @ApiQuery({ name: 'status', enum: SurveyStatus, required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of surveys for the authenticated user' })
  async findAll(
    @Req() req: any,
    @Query('status') status?: SurveyStatus,
    @Query('category') category?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const organizationId =
      req.user.organizationId || req.user.user?.organizationId?.toString() || undefined;

    const pageNumber = page ? Number(page) : 1;
    const limitNumber = limit ? Number(limit) : 10;

    const filters: Record<string, any> = {
      status,
      category,
      isDeleted: false,
    };

    if (organizationId) {
      filters.organizationId = organizationId;
    }

    if (!organizationId || req.user.role === UserRole.SUPER_ADMIN) {
      filters.createdBy = req.user.userId;
    }

    const result = await this.surveysService.findAll(filters, {
      page: pageNumber,
      limit: limitNumber,
    });

    return {
      message: 'Surveys fetched successfully',
      data: result.surveys,
      meta: {
        total: result.total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.max(1, Math.ceil(result.total / limitNumber)),
      },
    };
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search surveys for the authenticated user' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(@Req() req: any, @Query('q') searchTerm: string, @Query('limit') limit?: number) {
    return this.surveysService.searchSurveys(searchTerm, limit ? Number(limit) : 10, req.user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get survey by ID' })
  @ApiResponse({ status: 200, description: 'Survey details' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your survey' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const survey = await this.surveysService.findOne(id, {
      userId: req.user.userId,
      role: req.user.role,
      organizationId: req.user.organizationId || req.user.user?.organizationId?.toString(),
    });

    // Format response to match API structure
    return {
      statusCode: 200,
      message: 'Survey Found',
      data: {
        id: survey._id ? survey._id.toString() : id,
        name: survey.name,
        category: survey.category,
        description: survey.description || null,
        status: survey.status,
        isDeleted: survey.isDeleted,
        organizationId: survey.organizationId ? survey.organizationId.toString() : null,
        ipResponseLimit: survey.ipResponseLimit ?? 1,
        totalPages: survey.totalPages ?? survey.pages?.length ?? 0,
        totalQuestions: survey.totalQuestions ?? survey.pages?.reduce((sum, page) => sum + (page.questions?.length || 0), 0) ?? 0,
        totalResponses: survey.totalResponses ?? 0,
        totalVisits: survey.totalVisits ?? 0,
        communicationTemplates: survey.communicationTemplates || null,
        reminderTemplates: survey.reminderTemplates || [],
        reminderSettings: survey.reminderSettings || null,
        projectDetails: survey.projectDetails || null,
        ratingScale: survey.ratingScale || [],
        startDate: survey.startDate,
        endDate: survey.endDate,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
        pages: survey.pages || [],
        settings: {
          sid: 0,
          surveyId: survey._id ? survey._id.toString() : id,
          headerEnabled: false,
          headerLogoUrl: null,
          introductionPageEnabled: false,
          introductionPageDescription: null,
          termsConditionsEnabled: false,
          termsConditionsDescription: null,
          endDateEnabled: false,
          endDate: null,
          responseLimitEnabled: false,
          responseLimit: null,
          timeLimitEnabled: false,
          timeLimit: null,
          createdAt: survey.createdAt,
          updatedAt: survey.updatedAt,
        },
      },
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update survey' })
  @ApiResponse({ status: 200, description: 'Survey updated successfully' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your survey' })
  async update(@Param('id') id: string, @Body() updateSurveyDto: UpdateSurveyDto, @Req() req: any) {
    return this.surveysService.update(id, updateSurveyDto, req.user.userId);
  }

  @Get(':id/user-surveys')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all user surveys for a survey (for reports)' })
  @ApiResponse({ status: 200, description: 'List of user surveys' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your survey' })
  async getUserSurveysForSurvey(@Param('id') id: string, @Req() req: any) {
    // Verify survey ownership first
    await this.surveysService.findOne(id, {
      userId: req.user.userId,
      role: req.user.role,
      organizationId: req.user.organizationId || req.user.user?.organizationId?.toString(),
    });

    // Get all UserSurveys for this survey (only if user owns the survey)
    const userSurveys = await this.userSurveysService.findAll(undefined, id);
    return {
      statusCode: 200,
      message: 'User Surveys Found',
      data: userSurveys.map((us) => ({
        id: us._id.toString(),
        userId: us.userId ? us.userId.toString() : null,
        surveyId: us.surveyId.toString(),
        status: us.status,
        ipAddress: us.ipAddress || null,
        answeredQuestions: us.answeredQuestions,
        totalQuestions: us.totalQuestions,
        createdAt: (us as any).createdAt,
        completedAt: us.completedAt,
      })),
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete survey' })
  @ApiResponse({ status: 200, description: 'Survey deleted successfully' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your survey' })
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.surveysService.remove(id, req.user.userId);
    return { message: 'Survey deleted successfully' };
  }
}

