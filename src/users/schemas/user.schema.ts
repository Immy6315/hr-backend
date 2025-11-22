import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserPermission, getDefaultPermissionsForRole } from '../user-permissions';
import { UserRole } from '../enums/user-role.enum';
export { UserRole };

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: false })
  password?: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.PARTICIPANT })
  role: UserRole;

  @Prop({ default: false })
  verified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  verificationOtp?: string;

  @Prop()
  otpExpiry?: Date;

  @Prop()
  profileImage?: string;

  @Prop()
  phoneNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: false })
  organizationId?: Types.ObjectId;

  @Prop()
  invitationToken?: string;

  @Prop()
  invitationTokenExpiry?: Date;

  @Prop({ default: false })
  invitationAccepted?: boolean;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetTokenExpiry?: Date;

  @Prop({
    type: [String],
    enum: UserPermission,
    default: function () {
      return getDefaultPermissionsForRole(this.role);
    },
  })
  permissions: UserPermission[];
}

export const UserSchema = SchemaFactory.createForClass(User);

