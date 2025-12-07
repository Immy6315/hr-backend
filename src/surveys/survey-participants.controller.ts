import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { SurveyParticipantsService } from './survey-participants.service';
import { CreateSurveyParticipantDto, UpdateSurveyParticipantDto } from './dto/create-participant.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReminderService } from './reminder.service';

@ApiTags('survey-participants')
@Controller('survey-builder/surveys/:surveyId/participants')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SurveyParticipantsController {
  constructor(
    private readonly participantsService: SurveyParticipantsService,
    private readonly reminderService: ReminderService,
  ) { }

  private buildAccessContext(req: any) {
    return {
      userId: req.user.userId,
      role: req.user.role,
      organizationId: req.user.organizationId || req.user.user?.organizationId?.toString(),
    };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'List participants for a survey' })
  async findAll(
    @Param('surveyId') surveyId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search: string = '',
    @Query('status') status: string = 'all',
    @Query('verificationStatus') verificationStatus: string = 'all',
    @Query('includeRejected') includeRejected: string = 'false',
    @Req() req: any,
  ) {
    const normalizedSearch = search?.trim() || undefined;
    const normalizedStatus = status && status !== 'all' ? status : undefined;
    const normalizedVerificationStatus = verificationStatus && verificationStatus !== 'all' ? verificationStatus : undefined;

    const result = await this.participantsService.findAll(surveyId, this.buildAccessContext(req), {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      search: normalizedSearch,
      status: normalizedStatus,
      verificationStatus: normalizedVerificationStatus,
      includeRejected: includeRejected === 'true',
    });
    return {
      message: 'Participants fetched successfully',
      data: result.data,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
        summary: result.summary,
      },
    };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Create a participant' })
  async create(
    @Param('surveyId') surveyId: string,
    @Body() dto: CreateSurveyParticipantDto,
    @Req() req: any,
  ) {
    console.log(`[SurveyParticipantsController] Creating participant for survey ${surveyId}:`, JSON.stringify(dto));
    const participant = await this.participantsService.create(surveyId, dto, this.buildAccessContext(req));
    return {
      message: 'Participant created successfully',
      data: participant,
    };
  }

  @Patch(':participantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Update a participant' })
  async update(
    @Param('surveyId') surveyId: string,
    @Param('participantId') participantId: string,
    @Body() dto: UpdateSurveyParticipantDto,
    @Req() req: any,
  ) {
    console.log(`[SurveyParticipantsController] Updating participant ${participantId} for survey ${surveyId}:`, JSON.stringify(dto));
    const participant = await this.participantsService.update(
      surveyId,
      participantId,
      dto,
      this.buildAccessContext(req),
    );
    return {
      message: 'Participant updated successfully',
      data: participant,
    };
  }

  @Delete(':participantId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Delete a participant' })
  async remove(@Param('surveyId') surveyId: string, @Param('participantId') participantId: string, @Req() req: any) {
    await this.participantsService.remove(surveyId, participantId, this.buildAccessContext(req));
    return {
      message: 'Participant removed successfully',
    };
  }

  @Post('upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Bulk upload participants via Excel' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({ status: 201, description: 'Participants imported successfully' })
  async upload(
    @Param('surveyId') surveyId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const result = await this.participantsService.bulkUpload(surveyId, file, this.buildAccessContext(req));
    return {
      message: 'Participants imported successfully',
      data: result,
    };
  }

  @Get('remindable')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Get participants eligible for reminders' })
  async getRemindableParticipants(@Param('surveyId') surveyId: string) {
    const participants = await this.reminderService.getReminderEligibleParticipants(surveyId);
    return {
      message: 'Reminder-eligible participants fetched',
      data: participants,
    };
  }

  @Post('send-reminders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Send bulk reminders to selected participants' })
  async sendReminders(
    @Param('surveyId') surveyId: string,
    @Body('participantIds') participantIds: string[],
    @Req() req: any,
  ) {
    const result = await this.reminderService.sendBulkReminders(
      surveyId,
      participantIds,
      this.buildAccessContext(req),
    );
    return {
      message: 'Reminders sending process completed',
      data: result,
    };
  }

  @Get('reminder-stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Get reminder statistics for the survey' })
  async getReminderStats(@Param('surveyId') surveyId: string) {
    const stats = await this.reminderService.getReminderStats(surveyId);
    return {
      message: 'Reminder statistics fetched',
      data: stats,
    };
  }

  @Patch(':participantId/verify')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Verify a nominee' })
  async verify(
    @Param('surveyId') surveyId: string,
    @Param('participantId') participantId: string,
    @Req() req: any,
  ) {
    const participant = await this.participantsService.verify(
      surveyId,
      participantId,
      this.buildAccessContext(req),
    );
    return {
      message: 'Nominee verified successfully',
      data: participant,
    };
  }

  @Patch(':participantId/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Reject a nominee' })
  async reject(
    @Param('surveyId') surveyId: string,
    @Param('participantId') participantId: string,
    @Req() req: any,
  ) {
    const participant = await this.participantsService.reject(
      surveyId,
      participantId,
      this.buildAccessContext(req),
    );
    return {
      message: 'Nominee rejected successfully',
      data: participant,
    };
  }

  @Post(':participantId/invite')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  @ApiOperation({ summary: 'Send invitation email to participant' })
  async invite(
    @Param('surveyId') surveyId: string,
    @Param('participantId') participantId: string,
    @Req() req: any,
  ) {
    const result = await this.participantsService.inviteParticipant(
      surveyId,
      participantId,
      this.buildAccessContext(req),
    );
    return {
      message: result.message,
    };
  }
}


