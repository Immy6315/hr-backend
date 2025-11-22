import { Prop, Schema } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class GridRow {
  @Prop({ required: true })
  text: string;

  @Prop({ type: String, default: '0' }) // Can be string or number as string
  uniqueOrder: string;

  // For MATRIX types - columnsId array
  @Prop({ type: [String], default: [] })
  columnsId?: string[];

  // For MATRIX types - score array
  @Prop({ type: [String], default: [] })
  score?: string[];

  // Embedded columns for grid rows (for MATRIX types)
  @Prop({ type: Array, default: [] })
  columns?: any[];
}

export const GridRowSchema = new MongooseSchema({
  text: { type: String, required: true },
  uniqueOrder: { type: String, default: '0' },
  columnsId: { type: [String], default: [] },
  score: { type: [String], default: [] },
  columns: { type: Array, default: [] },
}, { _id: false });

