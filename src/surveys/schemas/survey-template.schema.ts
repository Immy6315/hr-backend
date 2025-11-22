import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SurveyTemplate extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Survey', required: true, index: true })
  surveyId: Types.ObjectId;

  @Prop()
  description?: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  // Denormalized counts
  @Prop({ type: Number, default: 0 })
  totalQuestions: number;

  @Prop({ type: Number, default: 0 })
  totalPages: number;
}

export const SurveyTemplateSchema = SchemaFactory.createForClass(SurveyTemplate);

// Indexes
SurveyTemplateSchema.index({ surveyId: 1, isDeleted: 1 });
SurveyTemplateSchema.index({ isDeleted: 1 });

