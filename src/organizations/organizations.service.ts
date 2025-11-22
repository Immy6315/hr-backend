import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Organization } from './schemas/organization.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<Organization>,
  ) {}

  async create(createDto: CreateOrganizationDto, createdByUserId?: string): Promise<Organization> {
    const organization = new this.organizationModel({
      ...createDto,
      createdBy: createdByUserId ? new Types.ObjectId(createdByUserId) : undefined,
    });
    return organization.save();
  }

  async findAll(): Promise<Organization[]> {
    return this.organizationModel.find({ isDeleted: false }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Organization> {
    const organization = await this.organizationModel
      .findOne({ _id: id, isDeleted: false })
      .exec();

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async update(id: string, updateDto: UpdateOrganizationDto): Promise<Organization> {
    const organization = await this.organizationModel
      .findOneAndUpdate({ _id: id, isDeleted: false }, updateDto, { new: true })
      .exec();

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.organizationModel
      .findOneAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true, isActive: false })
      .exec();

    if (!result) {
      throw new NotFoundException('Organization not found');
    }
  }
}



