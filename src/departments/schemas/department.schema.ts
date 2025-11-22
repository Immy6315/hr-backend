import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Department extends Document {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ trim: true })
  code?: string; // Department code (e.g., HR, IT, FIN)

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  parentDepartmentId?: Types.ObjectId; // For department hierarchy

  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  departmentHeadId?: Types.ObjectId; // Department head/manager

  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  hrManagerId?: Types.ObjectId; // HR contact for this department

  @Prop({ type: String })
  location?: string; // Physical location/office

  @Prop({ type: String })
  costCenter?: string; // Financial cost center code

  @Prop({ type: Number, default: 0 })
  budget?: number; // Department budget

  @Prop({ type: String, enum: ['active', 'inactive', 'archived'], default: 'active' })
  status: string;

  @Prop({ type: Number, default: 0 })
  employeeCount: number; // Cached count of employees

  @Prop({ type: Number, default: 0 })
  maxCapacity?: number; // Maximum employees allowed

  @Prop({ type: [String], default: [] })
  tags?: string[]; // For categorization

  @Prop({ type: Object })
  metadata?: {
    establishedDate?: Date;
    reportingStructure?: string;
    businessUnit?: string;
    division?: string;
    [key: string]: any;
  };

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

// Indexes for performance
DepartmentSchema.index({ name: 1 }, { unique: true });
DepartmentSchema.index({ code: 1 }, { unique: true, sparse: true });
DepartmentSchema.index({ parentDepartmentId: 1 });
DepartmentSchema.index({ departmentHeadId: 1 });
DepartmentSchema.index({ status: 1, isActive: 1 });
DepartmentSchema.index({ location: 1 });
DepartmentSchema.index({ costCenter: 1 });
