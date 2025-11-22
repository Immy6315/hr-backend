import { Prop, Schema } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class ValidationOptions {
  @Prop()
  maxvalue?: string;

  @Prop()
  type?: string;

  @Prop()
  minvalue?: string;

  @Prop({ type: Number })
  minlength?: number;

  @Prop({ type: Number })
  maxlength?: number;

  @Prop()
  format?: string;

  @Prop()
  scaleFrom?: string;

  @Prop()
  scaleTo?: string;

  @Prop()
  startLabel?: string; // For rating scales

  @Prop()
  endLabel?: string;
}

export const ValidationOptionsSchema = new MongooseSchema({
  maxvalue: String,
  type: String,
  minvalue: String,
  minlength: Number,
  maxlength: Number,
  format: String,
  scaleFrom: String,
  scaleTo: String,
  endLabel: String,
}, { _id: false });

