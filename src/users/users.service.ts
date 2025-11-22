import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserRole } from './schemas/user.schema';
import { UserPermission, ensureMandatoryPermissions, getDefaultPermissionsForRole } from './user-permissions';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  private resolvePermissions(role: UserRole = UserRole.PARTICIPANT, permissions?: UserPermission[]) {
    if (permissions && permissions.length > 0) {
      return permissions;
    }
    return ensureMandatoryPermissions(role, getDefaultPermissionsForRole(role));
  }

  async create(userData: Partial<User>): Promise<User> {
    const role = userData.role || UserRole.PARTICIPANT;
    const user = new this.userModel({
      ...userData,
      role,
      permissions: ensureMandatoryPermissions(role, this.resolvePermissions(role, userData.permissions)),
    });
    return user.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async update(id: string, updateData: Partial<User>): Promise<User> {
    const existingUser = await this.userModel.findById(id).exec();
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const targetRole = (updateData.role as UserRole) || existingUser.role;
    let targetPermissions: UserPermission[] | undefined;

    if (updateData.permissions) {
      targetPermissions = ensureMandatoryPermissions(targetRole, updateData.permissions as UserPermission[]);
    } else if (updateData.role) {
      targetPermissions = this.resolvePermissions(targetRole, existingUser.permissions as UserPermission[]);
    }

    const payload: Partial<User> = {
      ...updateData,
    };

    if (payload.email) {
      payload.email = payload.email.toLowerCase();
    }

    if (targetPermissions) {
      payload.permissions = targetPermissions;
    }

    const user = await this.userModel.findByIdAndUpdate(id, payload, { new: true }).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async remove(id: string): Promise<void> {
    await this.userModel.findByIdAndDelete(id).exec();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async findByInvitationToken(token: string): Promise<User | null> {
    return this.userModel.findOne({ invitationToken: token }).exec();
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    return this.userModel.findOne({ passwordResetToken: token }).exec();
  }

  async findByOrganization(organizationId: string): Promise<User[]> {
    return this.userModel
      .find({ organizationId: new Types.ObjectId(organizationId), isActive: true })
      .sort({ createdAt: -1 })
      .select(
        '-password -verificationOtp -otpExpiry -invitationToken -invitationTokenExpiry -passwordResetToken -passwordResetTokenExpiry',
      )
      .exec();
  }
}

