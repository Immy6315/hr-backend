import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyAuditLog, AuditLogAction, AuditLogEntityType } from './schemas/survey-audit-log.schema';

@Injectable()
export class SurveyAuditLogService {
  constructor(
    @InjectModel(SurveyAuditLog.name)
    private auditLogModel: Model<SurveyAuditLog>,
  ) { }

  async logActivity(
    surveyId: string,
    user: { userId?: string; performedBy?: string },
    action: AuditLogAction,
    entityType: AuditLogEntityType,
    options?: {
      entityId?: string;
      entityName?: string;
      oldValue?: any;
      newValue?: any;
      description?: string;
    },
  ): Promise<void> {
    const { entityId, entityName, oldValue, newValue, description } = options || {};

    // Check if there are actual changes
    const hasChanges = this.hasActualChanges(oldValue, newValue);

    // Generate description if not provided
    let finalDescription = description;
    if (!finalDescription) {
      finalDescription = this.generateDescription(action, entityType, entityName);
    }

    const auditLog = new this.auditLogModel({
      surveyId: new Types.ObjectId(surveyId),
      userId: user.userId ? new Types.ObjectId(user.userId) : undefined,
      performedBy: user.performedBy,
      action,
      entityType,
      entityId,
      entityName,
      oldValue: hasChanges ? oldValue : undefined,
      newValue: hasChanges ? newValue : undefined,
      description: finalDescription,
      hasChanges,
    });

    await auditLog.save();
  }

  async getAuditLogs(surveyId: string, limit: number = 100): Promise<SurveyAuditLog[]> {
    return this.auditLogModel
      .find({ surveyId: new Types.ObjectId(surveyId) })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  private hasActualChanges(oldValue: any, newValue: any): boolean {
    if (!oldValue && !newValue) return false;
    if (!oldValue || !newValue) return true;

    // Deep comparison for objects
    return JSON.stringify(oldValue) !== JSON.stringify(newValue);
  }

  private generateDescription(
    action: AuditLogAction,
    entityType: AuditLogEntityType,
    entityName?: string,
  ): string {
    const entityDisplay = entityName || entityType;

    switch (action) {
      case AuditLogAction.CREATED:
        if (entityType === AuditLogEntityType.SURVEY) {
          return `created a survey - "${entityDisplay}"`;
        } else if (entityType === AuditLogEntityType.PAGE) {
          return `created a page "${entityDisplay}"`;
        } else if (entityType === AuditLogEntityType.QUESTION) {
          return `created a question`;
        } else if (entityType === AuditLogEntityType.PARTICIPANT) {
          return `added participant "${entityDisplay}"`;
        }
        return `created ${entityType}`;

      case AuditLogAction.UPDATED:
        if (entityType === AuditLogEntityType.SURVEY) {
          return `updated the survey`;
        } else if (entityType === AuditLogEntityType.PAGE) {
          return `updated the page "${entityDisplay}"`;
        } else if (entityType === AuditLogEntityType.QUESTION) {
          return `updated a question`;
        } else if (entityType === AuditLogEntityType.PARTICIPANT) {
          return `updated participant "${entityDisplay}"`;
        }
        return `updated ${entityType}`;

      case AuditLogAction.DELETED:
        if (entityType === AuditLogEntityType.PAGE) {
          return `deleted the page "${entityDisplay}"`;
        } else if (entityType === AuditLogEntityType.QUESTION) {
          return `deleted a question`;
        } else if (entityType === AuditLogEntityType.PARTICIPANT) {
          return `removed participant "${entityDisplay}"`;
        }
        return `deleted ${entityType}`;

      case AuditLogAction.PUBLISHED:
        return `published the survey`;

      case AuditLogAction.RESPONSE_COLLECTED:
        return `A new response has been collected from an anonymous user`;

      case AuditLogAction.INVITE_SENT:
        return `sent an invitation to "${entityDisplay}"`;

      case AuditLogAction.NOMINATION_SUBMITTED:
        return `submitted nominations for "${entityDisplay}"`;

      case AuditLogAction.NOMINATION_VERIFIED:
        return `verified nominations for "${entityDisplay}"`;

      case AuditLogAction.NOMINATION_REJECTED:
        return `rejected nominations for "${entityDisplay}"`;

      default:
        return `${action} ${entityType}`;
    }
  }
}






