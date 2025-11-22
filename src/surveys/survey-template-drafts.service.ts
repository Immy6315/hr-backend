import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyTemplateDraft } from './schemas/survey-template-draft.schema';

@Injectable()
export class SurveyTemplateDraftsService {
  constructor(
    @InjectModel(SurveyTemplateDraft.name)
    private readonly draftModel: Model<SurveyTemplateDraft>,
  ) {}

  async createDraft(params: {
    organizationId: string;
    createdBy: string;
    payload: Record<string, any>;
  }): Promise<SurveyTemplateDraft> {
    const draft = new this.draftModel({
      organizationId: new Types.ObjectId(params.organizationId),
      createdBy: new Types.ObjectId(params.createdBy),
      payload: params.payload,
    });
    return draft.save();
  }

  async findByOrganization(organizationId: string): Promise<SurveyTemplateDraft[]> {
    return this.draftModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getDraft(id: string): Promise<SurveyTemplateDraft> {
    const draft = await this.draftModel.findById(id).exec();
    if (!draft) {
      throw new NotFoundException('Survey template draft not found');
    }
    return draft;
  }

  async deleteDraft(id: string, organizationId: string): Promise<void> {
    await this.draftModel
      .deleteOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      })
      .exec();
  }

  async markAsPublished(id: string): Promise<void> {
    await this.draftModel
      .findByIdAndUpdate(id, { status: 'published', publishedAt: new Date() })
      .exec();
  }
}

