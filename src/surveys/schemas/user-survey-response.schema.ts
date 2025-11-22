import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class UserSurveyResponse extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId; // Optional for IP-based surveys

  @Prop({ type: Types.ObjectId, ref: 'Survey', required: true, index: true })
  surveyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'UserSurvey', required: true, index: true })
  userSurveyId: Types.ObjectId;

  // Question reference - using string ID for flexibility
  @Prop({ required: true, index: true })
  questionId: string; // Reference to question's unique identifier in Survey

  @Prop({ required: true })
  questionType: string;

  @Prop({ type: Object }) // Can be string, number, array, object
  response: any;

  // Denormalized data for faster queries
  @Prop()
  questionText?: string; // Denormalized from SurveyQuestion

  @Prop({ type: Number })
  pageIndex?: number; // Which page this question belongs to

  @Prop({ type: Number })
  questionOrder?: number; // Order within the page

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  // Metadata
  @Prop()
  comment?: string; // If commentEnabled was true

  @Prop({ type: Number })
  score?: number; // If scoreEnabled was true

  @Prop({ type: Date })
  answeredAt?: Date;
}

export const UserSurveyResponseSchema = SchemaFactory.createForClass(UserSurveyResponse);

// Compound indexes for performance
UserSurveyResponseSchema.index({ userSurveyId: 1, questionId: 1 }, { unique: true }); // One response per question per survey instance
UserSurveyResponseSchema.index({ surveyId: 1, questionId: 1 }); // For question-level analytics
UserSurveyResponseSchema.index({ userId: 1, surveyId: 1 }); // For user's responses
UserSurveyResponseSchema.index({ surveyId: 1, createdAt: -1 }); // For response timeline
UserSurveyResponseSchema.index({ questionId: 1, createdAt: -1 }); // For question analytics

