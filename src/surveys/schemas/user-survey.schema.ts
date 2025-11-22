import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum UserSurveyStatus {
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

@Schema({ timestamps: true })
export class UserSurvey extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId; // Optional for IP-based surveys

  @Prop({ type: Types.ObjectId, ref: 'Survey', required: true, index: true })
  surveyId: Types.ObjectId;

  @Prop({ type: String, enum: UserSurveyStatus, default: UserSurveyStatus.STARTED })
  status: UserSurveyStatus;

  @Prop()
  ipAddress?: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  // Denormalized data for faster access
  @Prop()
  surveyName?: string; // Denormalized from Survey

  @Prop()
  surveyCategory?: string; // Denormalized from Survey

  // Progress tracking
  @Prop({ type: Number, default: 0 })
  currentPageIndex: number;

  @Prop({ type: Number, default: 0 })
  totalPages: number;

  @Prop({ type: Number, default: 0 })
  answeredQuestions: number;

  @Prop({ type: Number, default: 0 })
  totalQuestions: number;

  // Timestamps
  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  lastActivityAt?: Date;

  // Response metadata
  @Prop({ unique: true, sparse: true })
  responseId?: string; // Unique response ID (e.g., yuNR5KGC)

  @Prop()
  userAgent?: string; // Browser user agent

  @Prop()
  responseLink?: string; // Link to view this response

  @Prop()
  surveyUrl?: string; // URL that was accessed by respondent

  @Prop({ type: Number })
  timeTaken?: number; // Time taken in seconds

  @Prop()
  collector?: string; // Collector name/type (e.g., "360 Degree Employee Evaluation")

  @Prop({ type: [String], default: [] })
  tags?: string[]; // Tags for categorization
}

export const UserSurveySchema = SchemaFactory.createForClass(UserSurvey);

// Compound indexes for performance
UserSurveySchema.index({ userId: 1, surveyId: 1 }); // For user's specific survey lookup
UserSurveySchema.index({ ipAddress: 1, surveyId: 1 }); // For IP-based survey lookup
UserSurveySchema.index({ surveyId: 1, status: 1 }); // For survey responses filtering
UserSurveySchema.index({ userId: 1, status: 1, createdAt: -1 }); // For user's survey history
UserSurveySchema.index({ surveyId: 1, createdAt: -1 }); // For survey responses timeline
UserSurveySchema.index({ lastActivityAt: -1 }); // For active surveys

