import { Prop, Schema } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { QuestionOption, QuestionOptionSchema } from './question-option.schema';
import { ValidationOptions, ValidationOptionsSchema } from './validation-options.schema';
import { GridRow, GridRowSchema } from './grid-row.schema';
import { GridColumn, GridColumnSchema } from './grid-column.schema';

@Schema({ _id: false })
export class SurveyQuestion {
  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  type: string; // 'text', 'multiple-choice', 'grid', 'rating', etc.

  @Prop({ type: Boolean, default: false })
  validationEnabled: boolean;

  @Prop({ type: Boolean, default: false })
  mandatoryEnabled: boolean;

  @Prop()
  mandatoryMsg?: string;

  @Prop({ type: Boolean, default: false })
  hintEnabled: boolean;

  @Prop()
  hintMsg?: string;

  @Prop({ type: Boolean, default: false })
  randomEnabled: boolean;

  @Prop()
  randomizationType?: string;

  @Prop()
  randomizeType?: string;

  @Prop({ type: Boolean, default: false })
  noneOptionEnabled: boolean;

  @Prop({ type: Boolean, default: false })
  otherOptionEnabled: boolean;

  @Prop()
  otherOptionMsg?: string;

  @Prop({ type: Boolean, default: false })
  commentEnabled: boolean;

  @Prop()
  commentMsg?: string;

  @Prop({ type: Boolean, default: false })
  notApplicableEnabled: boolean;

  @Prop()
  notApplicableMsg?: string;

  @Prop({ type: Boolean, default: false })
  scoreEnabled: boolean;

  @Prop({ type: String, default: '0' }) // Can be string like "A", "B" or number as string
  uniqueOrder: string;

  // Question ID for reference (generated on creation)
  @Prop({ type: String })
  questionId?: string;

  @Prop()
  answerWidth?: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop()
  initialMsg?: string;

  // Embedded documents for better performance
  @Prop({ type: [QuestionOptionSchema], default: [] })
  options: QuestionOption[];

  @Prop({ type: ValidationOptionsSchema })
  validation?: ValidationOptions;

  // Grid-specific fields (embedded for performance)
  @Prop({ type: [GridRowSchema], default: [] })
  gridRows: GridRow[];

  @Prop({ type: [GridColumnSchema], default: [] })
  gridColumns: GridColumn[];

  // For MATRIX types - columns at question level
  @Prop({ type: [GridColumnSchema], default: [] })
  columns?: GridColumn[];

  // Additional fields for matrix types
  @Prop({ type: Boolean, default: false })
  columnRandomEnabled?: boolean;

  @Prop()
  columnRandomizationType?: string;

  @Prop({ type: Boolean, default: false })
  weightageEnabled?: boolean;

  @Prop({ type: Boolean, default: false })
  showWeightage?: boolean;

  @Prop()
  displayFormat?: string;

  // Display Logic fields
  @Prop({ type: Boolean, default: false })
  displayLogicEnabled?: boolean;

  @Prop({ type: String, default: 'always' }) // 'always', 'conditional', 'never'
  displayLogicType?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  displayLogicConditions?: any; // Array of conditions: [{ questionId, operator, value }]
}

export const SurveyQuestionSchema = new MongooseSchema({
  text: { type: String, required: true },
  type: { type: String, required: true },
  validationEnabled: { type: Boolean, default: false },
  mandatoryEnabled: { type: Boolean, default: false },
  mandatoryMsg: String,
  hintEnabled: { type: Boolean, default: false },
  hintMsg: String,
  randomEnabled: { type: Boolean, default: false },
  randomizationType: String,
  randomizeType: String,
  noneOptionEnabled: { type: Boolean, default: false },
  otherOptionEnabled: { type: Boolean, default: false },
  otherOptionMsg: String,
  commentEnabled: { type: Boolean, default: false },
  commentMsg: String,
  notApplicableEnabled: { type: Boolean, default: false },
  notApplicableMsg: String,
  scoreEnabled: { type: Boolean, default: false },
  uniqueOrder: { type: String, default: '0' },
  answerWidth: String,
  isDeleted: { type: Boolean, default: false },
  initialMsg: String,
  options: { type: [QuestionOptionSchema], default: [] },
  validation: ValidationOptionsSchema,
  gridRows: { type: [GridRowSchema], default: [] },
  gridColumns: { type: [GridColumnSchema], default: [] },
  columnRandomEnabled: { type: Boolean, default: false },
  columnRandomizationType: String,
  weightageEnabled: { type: Boolean, default: false },
  showWeightage: { type: Boolean, default: false },
  displayFormat: String,
  displayLogicEnabled: { type: Boolean, default: false },
  displayLogicType: { type: String, default: 'always' },
  displayLogicConditions: { type: MongooseSchema.Types.Mixed },
}, { _id: false });

