import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SurveyParticipant extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Survey', required: true })
  surveyId: Types.ObjectId;

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

  @Prop({ default: 'pending' })
  completionStatus?: string;

  @Prop()
  completionDate?: Date;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const SurveyParticipantSchema = SchemaFactory.createForClass(SurveyParticipant);
SurveyParticipantSchema.index({ surveyId: 1, isDeleted: 1 });


