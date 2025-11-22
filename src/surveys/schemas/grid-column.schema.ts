import { Prop, Schema } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class GridColumn {
  @Prop({ required: true })
  text: string;

  @Prop({ type: String, default: '0' }) // Can be string or number as string
  uniqueOrder: string;

  @Prop({ type: Number })
  weight?: number;

  @Prop({ type: Number })
  seqNo?: number;

  @Prop({ type: String })
  value?: string;

  @Prop({ type: Boolean, default: false })
  mandatoryEnabled: boolean;

  @Prop({ type: String })
  rowId?: string; // Reference to GridRow uniqueOrder or ID

  @Prop({ type: String })
  questionId?: string; // For nested questions in grid

  // For nested question in column (like FULL_NAME, MULTIPLE_CHOICE_GRID)
  @Prop({ type: Object })
  question?: any;
}

export const GridColumnSchema = new MongooseSchema({
  text: { type: String, required: true },
  uniqueOrder: { type: String, default: '0' },
  weight: { type: Number },
  seqNo: { type: Number },
  value: { type: String },
  mandatoryEnabled: { type: Boolean, default: false },
  rowId: String,
  questionId: String,
  question: Object,
}, { _id: false });

