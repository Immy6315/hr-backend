import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SurveyAuditLogService } from './survey-audit-log.service';
import { SurveysService } from './surveys.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('survey-audit-logs')
@Controller('survey-builder/surveys/:surveyId/audit-logs')
export class SurveyAuditLogController {
  constructor(
    private readonly auditLogService: SurveyAuditLogService,
    private readonly surveysService: SurveysService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get audit logs for a survey' })
  @ApiResponse({ status: 200, description: 'List of audit logs' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your survey' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
  async getAuditLogs(@Param('surveyId') surveyId: string, @Req() req: any) {
    // Verify survey ownership first
    await this.surveysService.findOne(surveyId, {
      userId: req.user.userId,
      role: req.user.role,
      organizationId: req.user.organizationId || req.user.user?.organizationId?.toString(),
    });
    
    const logs = await this.auditLogService.getAuditLogs(surveyId);
    return {
      statusCode: 200,
      message: 'Audit logs retrieved successfully',
      data: logs.map((log) => ({
        id: log._id.toString(),
        surveyId: log.surveyId.toString(),
        userId: log.userId ? log.userId.toString() : null,
        userName: (log.userId as any)?.name || 'Unknown',
        userEmail: (log.userId as any)?.email || '',
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        entityName: log.entityName,
        oldValue: log.oldValue,
        newValue: log.newValue,
        description: log.description,
        hasChanges: log.hasChanges,
        createdAt: log.createdAt,
      })),
    };
  }
}


