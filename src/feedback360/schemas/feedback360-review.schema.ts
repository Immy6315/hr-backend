import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReviewStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum FeedbackStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DECLINED = 'declined',
}

@Schema({ timestamps: true })
export class Feedback360Review extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId; // Employee being reviewed

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  managerId: Types.ObjectId; // Manager providing feedback

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId; // User who created the review

  @Prop({ required: true })
  reviewCycle: string; // e.g., "Q4 2024 Performance Review"

  @Prop({ type: String, enum: ReviewStatus, default: ReviewStatus.DRAFT })
  status: ReviewStatus;

  @Prop({ type: [Types.ObjectId], ref: 'Employee', default: [] })
  peerIds: Types.ObjectId[]; // Peers providing feedback

  @Prop({ type: [Types.ObjectId], ref: 'Employee', default: [] })
  directReportIds: Types.ObjectId[]; // Direct reports providing feedback

  @Prop({ type: [String], default: [] })
  competencies: string[]; // Competencies to assess

  @Prop()
  customInstructions?: string;

  @Prop({ type: Boolean, default: false })
  anonymousFeedback: boolean; // Anonymous feedback for peers and direct reports

  // Survey integration
  @Prop({ type: Types.ObjectId, ref: 'Survey' })
  surveyId?: Types.ObjectId; // Linked survey for feedback collection

  // Feedback tracking
  @Prop({
    type: {
      manager: {
        status: { type: String, enum: Object.values(FeedbackStatus), default: FeedbackStatus.PENDING },
        completedAt: Date,
        userSurveyId: Types.ObjectId,
      },
      peers: [{
        employeeId: Types.ObjectId,
        status: { type: String, enum: Object.values(FeedbackStatus), default: FeedbackStatus.PENDING },
        completedAt: Date,
        userSurveyId: Types.ObjectId,
      }],
      directReports: [{
        employeeId: Types.ObjectId,
        status: { type: String, enum: Object.values(FeedbackStatus), default: FeedbackStatus.PENDING },
        completedAt: Date,
        userSurveyId: Types.ObjectId,
      }],
    },
    default: {},
  })
  feedbackStatus: {
    manager?: {
      status: FeedbackStatus;
      completedAt?: Date;
      userSurveyId?: Types.ObjectId;
    };
    peers?: Array<{
      employeeId: Types.ObjectId;
      status: FeedbackStatus;
      completedAt?: Date;
      userSurveyId?: Types.ObjectId;
    }>;
    directReports?: Array<{
      employeeId: Types.ObjectId;
      status: FeedbackStatus;
      completedAt?: Date;
      userSurveyId?: Types.ObjectId;
    }>;
  };

  // Dates
  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  // Metadata
  @Prop({ type: Number, default: 0 })
  totalFeedbackRequests: number;

  @Prop({ type: Number, default: 0 })
  completedFeedbackCount: number;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const Feedback360ReviewSchema = SchemaFactory.createForClass(Feedback360Review);

// Indexes
Feedback360ReviewSchema.index({ employeeId: 1, status: 1 });
Feedback360ReviewSchema.index({ createdBy: 1 });
Feedback360ReviewSchema.index({ reviewCycle: 1 });
Feedback360ReviewSchema.index({ status: 1 });

