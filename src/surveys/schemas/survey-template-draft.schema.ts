import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SurveyTemplateDraft extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ type: String, enum: ['draft', 'published'], default: 'draft' })
  status: 'draft' | 'published';

  @Prop()
  publishedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SurveyTemplateDraftSchema = SchemaFactory.createForClass(SurveyTemplateDraft);

