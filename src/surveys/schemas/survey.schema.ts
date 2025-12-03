import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SurveyPage, SurveyPageSchema } from './survey-page.schema';

export enum SurveyStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

@Schema({ timestamps: true })
export class Survey extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  category?: string;

  @Prop({ type: String, enum: SurveyStatus, default: SurveyStatus.DRAFT })
  status: SurveyStatus;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  // Embedded pages for better read performance (denormalized)
  // This allows fetching entire survey with one query
  @Prop({ type: [SurveyPageSchema], default: [] })
  pages: SurveyPage[];

  // Denormalized counts for faster queries (updated via triggers/aggregation)
  @Prop({ type: Number, default: 0 })
  totalPages: number;

  @Prop({ type: Number, default: 0 })
  totalQuestions: number;

  @Prop({ type: Number, default: 0 })
  totalResponses: number; // Count of UserSurvey instances

  @Prop({ type: Number, default: 0 })
  totalVisits: number; // Count of survey visits/opens

  // Metadata for analytics
  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop()
  description?: string;

  @Prop({ type: String })
  createdBy?: string; // User ID who created the survey

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: false })
  organizationId?: Types.ObjectId;

  @Prop()
  publicUrl?: string; // Public URL for survey access

  @Prop()
  privateUrl?: string; // Private URL for survey access

  @Prop({ type: Number, default: 1 })
  ipResponseLimit?: number; // Number of responses allowed per IP (default: 1)

  @Prop({
    type: [
      {
        type: { type: String },
        subject: String,
        body: String,
        schedule: String,
      },
    ],
    default: [],
  })
  reminderTemplates?: Array<{
    type: string;
    subject: string;
    body: string;
    schedule?: string;
  }>;

  @Prop({ type: Object })
  communicationTemplates?: {
    participantInvite?: {
      subject: string;
      html: string;
      text: string;
    };
    respondentInvite?: {
      subject: string;
      html: string;
      text: string;
    };
    respondentReminder?: {
      subject: string;
      html: string;
      text: string;
    };
    respondentCancellation?: {
      subject: string;
      html: string;
      text: string;
    };
  };

  @Prop({ type: Object })
  reminderSettings?: {
    waitBeforeReminderHours?: number;
    reminderFrequency?: string;
    completionStatusDashboard?: Record<string, any>;
  };

  @Prop({ type: Object })
  projectDetails?: Record<string, any>;

  @Prop({
    type: [
      {
        weight: Number,
        label: String,
        description: String,
      },
    ],
    default: [],
  })
  ratingScale?: Array<{ weight: number; label: string; description?: string }>;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const SurveySchema = SchemaFactory.createForClass(Survey);

// Indexes for performance optimization
SurveySchema.index({ status: 1, isDeleted: 1 }); // For filtering active surveys
SurveySchema.index({ category: 1, status: 1 }); // For category-based queries
SurveySchema.index({ createdAt: -1 }); // For recent surveys
SurveySchema.index({ createdBy: 1 }); // For user's surveys
SurveySchema.index({ organizationId: 1 }); // For organization-scoped queries
SurveySchema.index({ name: 'text', description: 'text' }); // Text search index

