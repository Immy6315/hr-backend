import { Prop, Schema } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { SurveyQuestion, SurveyQuestionSchema } from './survey-question.schema';

@Schema({ _id: false })
export class SurveyPage {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: String, default: '0' }) // Can be string like "A", "B" or number as string
  uniqueOrder: string;

  // Embedded questions for better performance (denormalized)
  @Prop({ type: [SurveyQuestionSchema], default: [] })
  questions: SurveyQuestion[];
}

export const SurveyPageSchema = new MongooseSchema({
  title: { type: String, required: true },
  description: String,
  uniqueOrder: { type: Number, default: 0 },
  questions: { type: [SurveyQuestionSchema], default: [] },
}, { _id: false });

