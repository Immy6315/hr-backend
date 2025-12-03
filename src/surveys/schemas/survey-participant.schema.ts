import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SurveyParticipant extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Survey', required: true })
  surveyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'UserSurvey', required: false })
  userSurveyId?: Types.ObjectId; // Link to the actual response

  @Prop({ required: true })
  participantName: string;

  @Prop()
  participantEmail?: string;

  @Prop({ required: true })
  respondentName: string;

  @Prop({ required: true })
  respondentEmail: string;

  @Prop()
  relationship?: string;

  // Credential fields for participant/respondent login
  @Prop()
  username?: string; // Auto-generated from email or custom

  @Prop()
  password?: string; // Hashed password for login

  @Prop({ default: false })
  hasLoggedIn: boolean; // Track if they've logged in at least once

  // Reminder tracking
  @Prop({ default: 0 })
  remindersSent: number; // Count of reminder emails sent

  @Prop()
  lastReminderDate?: Date; // Date of last reminder sent

  // Survey progress tracking
  @Prop()
  surveyStartedAt?: Date; // When they first answered a question

  @Prop()
  surveyCompletedAt?: Date; // When they submitted the survey

  @Prop({ default: false })
  isLocked: boolean; // Prevent re-submission after completion

  // Status: 'Yet To Start' | 'Pending' | 'In Progress' | 'Completed'
  @Prop({ default: 'Yet To Start' })
  completionStatus?: string;

  @Prop()
  completionDate?: Date;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const SurveyParticipantSchema = SchemaFactory.createForClass(SurveyParticipant);
SurveyParticipantSchema.index({ surveyId: 1, isDeleted: 1 });


