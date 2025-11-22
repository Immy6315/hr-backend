import { Prop, Schema } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class QuestionOption {
  @Prop({ required: true })
  text: string;

  @Prop({ type: Number, default: 0 })
  seqNo: number;

  @Prop({ type: String, default: '0' }) // Can be string like "A", "B" or number as string
  uniqueOrder: string;

  @Prop()
  value?: string;

  @Prop({ type: Boolean, default: false })
  mandatoryEnabled: boolean;

  @Prop({ type: Boolean, default: false })
  preSelected: boolean;

  @Prop()
  type?: string;

  @Prop()
  imageUrl?: string;

  @Prop()
  score?: string;

  @Prop({ type: Number })
  weight?: number;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const QuestionOptionSchema = new MongooseSchema({
  text: { type: String, required: true },
  seqNo: { type: Number, default: 0 },
  uniqueOrder: { type: String, default: '0' },
  value: { type: String },
  mandatoryEnabled: { type: Boolean, default: false },
  preSelected: { type: Boolean, default: false },
  type: String,
  imageUrl: String,
  score: String,
  weight: Number,
  isDeleted: { type: Boolean, default: false },
}, { _id: false });

