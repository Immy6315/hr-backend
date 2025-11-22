import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyTemplate } from './schemas/survey-template.schema';
import { Survey } from './schemas/survey.schema';
import { SurveyPageCollection } from './schemas/survey-page-collection.schema';
import { SurveysService } from './surveys.service';
import { SurveyPagesService } from './survey-pages.service';

@Injectable()
export class SurveyTemplatesService {
  constructor(
    @InjectModel(SurveyTemplate.name) private templateModel: Model<SurveyTemplate>,
    @InjectModel(Survey.name) private surveyModel: Model<Survey>,
    @InjectModel(SurveyPageCollection.name) private surveyPageModel: Model<SurveyPageCollection>,
    private surveysService: SurveysService,
    private surveyPagesService: SurveyPagesService,
  ) {}

  async create(name: string, surveyId: string, description?: string): Promise<SurveyTemplate> {
    // Verify survey exists
    const survey = await this.surveyModel.findOne({ _id: surveyId, isDeleted: false }).exec();
    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    // Get page and question counts
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false })
      .exec();

    let totalQuestions = 0;
    for (const page of pages) {
      totalQuestions += page.questions.filter((q: any) => !q.isDeleted).length;
    }

    const template = new this.templateModel({
      name,
      surveyId: new Types.ObjectId(surveyId),
      description,
      totalPages: pages.length,
      totalQuestions,
    });

    return template.save();
  }

  async findAll(): Promise<any[]> {
    const templates = await this.templateModel
      .find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .exec();

    return templates.map((t) => ({
      id: t._id.toString(),
      name: t.name,
      description: t.description || null,
      surveyId: t.surveyId.toString(),
      isDeleted: t.isDeleted,
      createdAt: (t as any).createdAt || new Date(),
      updatedAt: (t as any).updatedAt || new Date(),
      totalQuestions: t.totalQuestions,
      totalPages: t.totalPages,
    }));
  }

  async findOne(id: string): Promise<SurveyTemplate> {
    const template = await this.templateModel
      .findOne({ _id: id, isDeleted: false })
      .exec();
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async createSurveyFromTemplate(templateId: string, userId: string): Promise<any> {
    const template = await this.findOne(templateId);
    const originalSurvey = await this.surveysService.findOne(template.surveyId.toString());

    // Create new survey from template
    const newSurvey = await this.surveyModel.create({
      name: originalSurvey.name,
      category: originalSurvey.category,
      status: 'draft',
      description: originalSurvey.description,
      createdBy: userId,
      totalPages: 0,
      totalQuestions: 0,
      totalResponses: 0,
    });

    // Copy pages and questions
    const originalPages = await this.surveyPageModel
      .find({ surveyId: template.surveyId, isDeleted: false })
      .sort({ uniqueOrder: 1 })
      .exec();

    let totalQuestions = 0;
    for (const originalPage of originalPages) {
      const newPage = await this.surveyPageModel.create({
        surveyId: newSurvey._id,
        title: originalPage.title,
        description: originalPage.description,
        uniqueOrder: originalPage.uniqueOrder,
        questions: originalPage.questions.map((q: any) => {
          if (!q.isDeleted) {
            totalQuestions++;
          }
          return {
            ...q.toObject(),
            questionId: require('crypto').randomBytes(16).toString('hex'),
          };
        }),
        totalQuestions: originalPage.questions.filter((q: any) => !q.isDeleted).length,
      });
    }

    // Update survey counts
    await this.surveyModel.findByIdAndUpdate(newSurvey._id, {
      totalPages: originalPages.length,
      totalQuestions,
    }).exec();

    return {
      statusCode: 200,
      message: 'Survey created from template',
      data: {
        id: newSurvey._id.toString(),
        name: newSurvey.name,
        category: newSurvey.category,
        status: newSurvey.status,
      },
    };
  }
}

