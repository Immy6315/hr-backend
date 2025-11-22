import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SurveyQuestion, SurveyQuestionSchema } from './survey-question.schema';

@Schema({ timestamps: true })
export class SurveyPageCollection extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Survey', required: true, index: true })
  surveyId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: String, default: '0' }) // Can be string like "A", "B", "a", "b" or number
  uniqueOrder: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  // Embedded questions for better performance
  @Prop({ type: [SurveyQuestionSchema], default: [] })
  questions: SurveyQuestion[];
}

export const SurveyPageCollectionSchema = SchemaFactory.createForClass(SurveyPageCollection);

// Indexes for performance
SurveyPageCollectionSchema.index({ surveyId: 1, uniqueOrder: 1 });
SurveyPageCollectionSchema.index({ surveyId: 1, isDeleted: 1 });

