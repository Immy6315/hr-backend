import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Employee extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ unique: true, sparse: true })
  employeeId?: string; // Company-specific employee ID

  @Prop()
  department?: string;

  @Prop()
  position?: string; // Job title/position

  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  managerId?: Types.ObjectId; // Self-reference for hierarchy

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId?: Types.ObjectId; // Link to User account if exists

  @Prop()
  phoneNumber?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  profileImage?: string;

  @Prop({ type: Object })
  metadata?: {
    location?: string;
    hireDate?: Date;
    [key: string]: any;
  };
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

// Indexes for performance
EmployeeSchema.index({ email: 1 }, { unique: true });
EmployeeSchema.index({ employeeId: 1 }, { unique: true, sparse: true });
EmployeeSchema.index({ managerId: 1 }); // For hierarchy queries
EmployeeSchema.index({ department: 1 });
EmployeeSchema.index({ isActive: 1 });
EmployeeSchema.index({ userId: 1 });

