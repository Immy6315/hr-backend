import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum AuditLogAction {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
  PUBLISHED = 'published',
  RESPONSE_COLLECTED = 'response_collected',
}

export enum AuditLogEntityType {
  SURVEY = 'survey',
  PAGE = 'page',
  QUESTION = 'question',
  RESPONSE = 'response',
}

@Schema({ timestamps: true })
export class SurveyAuditLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Survey', required: true, index: true })
  surveyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: AuditLogAction, required: true })
  action: AuditLogAction;

  @Prop({ type: String, enum: AuditLogEntityType, required: true })
  entityType: AuditLogEntityType;

  @Prop()
  entityId?: string; // ID of the entity (page ID, question ID, etc.)

  @Prop()
  entityName?: string; // Name/title of the entity for display

  @Prop({ type: Object })
  oldValue?: any; // Old values before change

  @Prop({ type: Object })
  newValue?: any; // New values after change

  @Prop()
  description?: string; // Human-readable description

  @Prop({ type: Boolean, default: false })
  hasChanges: boolean; // Whether there are actual changes to show

  // Timestamps are automatically added by Mongoose when timestamps: true
  createdAt?: Date;
  updatedAt?: Date;
}

export const SurveyAuditLogSchema = SchemaFactory.createForClass(SurveyAuditLog);

// Indexes for efficient querying
SurveyAuditLogSchema.index({ surveyId: 1, createdAt: -1 });
SurveyAuditLogSchema.index({ userId: 1, createdAt: -1 });
SurveyAuditLogSchema.index({ surveyId: 1, entityType: 1, createdAt: -1 });

