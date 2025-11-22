import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyPageCollection } from './schemas/survey-page-collection.schema';
import { Survey } from './schemas/survey.schema';
import { SurveysService } from './surveys.service';
import { SurveyAuditLogService } from './survey-audit-log.service';
import { AuditLogAction, AuditLogEntityType } from './schemas/survey-audit-log.schema';

@Injectable()
export class SurveyPagesService {
  constructor(
    @InjectModel(SurveyPageCollection.name)
    private surveyPageModel: Model<SurveyPageCollection>,
    @InjectModel(Survey.name) private surveyModel: Model<Survey>,
    private surveysService: SurveysService,
    @Inject(forwardRef(() => SurveyAuditLogService))
    private auditLogService: SurveyAuditLogService,
  ) {}

  async create(surveyId: string, pageData: { title: string; description?: string; uniqueOrder?: string; isDeleted?: boolean }, userId?: string): Promise<SurveyPageCollection> {
    // Verify survey exists
    await this.surveysService.findOne(surveyId);

    const page = new this.surveyPageModel({
      surveyId: new Types.ObjectId(surveyId),
      title: pageData.title,
      description: pageData.description,
      uniqueOrder: pageData.uniqueOrder || '0',
      isDeleted: pageData.isDeleted || false,
      questions: [],
    });

    const saved = await page.save();

    // Update survey's totalPages count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalPages: 1 },
    }).exec();

    // Log page creation
    if (userId) {
      await this.auditLogService.logActivity(
        surveyId,
        userId,
        AuditLogAction.CREATED,
        AuditLogEntityType.PAGE,
        {
          entityId: saved._id.toString(),
          entityName: saved.title,
          newValue: {
            title: saved.title,
            description: saved.description,
          },
        },
      );
    }

    return saved;
  }

  async findOne(surveyId: string, pageId: string): Promise<SurveyPageCollection> {
    const page = await this.surveyPageModel
      .findOne({
        _id: pageId,
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      })
      .exec();

    if (!page) {
      throw new NotFoundException('Survey Page not found');
    }

    return page;
  }

  async findAll(surveyId: string): Promise<SurveyPageCollection[]> {
    return this.surveyPageModel
      .find({
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      })
      .sort({ uniqueOrder: 1 })
      .exec();
  }

  async update(
    surveyId: string,
    pageId: string,
    updateData: { title?: string; description?: string; uniqueOrder?: string; isDeleted?: boolean },
    userId?: string,
  ): Promise<SurveyPageCollection> {
    const page = await this.findOne(surveyId, pageId);

    // Store old values for audit log
    const oldValue = {
      title: page.title,
      description: page.description,
      uniqueOrder: page.uniqueOrder,
    };

    if (updateData.title !== undefined) page.title = updateData.title;
    if (updateData.description !== undefined) page.description = updateData.description;
    if (updateData.uniqueOrder !== undefined) page.uniqueOrder = updateData.uniqueOrder;
    if (updateData.isDeleted !== undefined) page.isDeleted = updateData.isDeleted;

    const saved = await page.save();

    // Log page update
    if (userId) {
      await this.auditLogService.logActivity(
        surveyId,
        userId,
        AuditLogAction.UPDATED,
        AuditLogEntityType.PAGE,
        {
          entityId: pageId,
          entityName: saved.title,
          oldValue,
          newValue: {
            title: saved.title,
            description: saved.description,
            uniqueOrder: saved.uniqueOrder,
          },
        },
      );
    }

    return saved;
  }

  async delete(surveyId: string, pageId: string, userId?: string): Promise<void> {
    const page = await this.findOne(surveyId, pageId);
    
    // Count non-deleted questions in this page before deleting
    const nonDeletedQuestionsCount = page.questions.filter((q: any) => !q.isDeleted).length;
    
    page.isDeleted = true;
    await page.save();

    // Update survey's totalPages count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalPages: -1 },
    }).exec();

    // Update survey's totalQuestions count by subtracting non-deleted questions from deleted page
    if (nonDeletedQuestionsCount > 0) {
      await this.surveyModel.findByIdAndUpdate(surveyId, {
        $inc: { totalQuestions: -nonDeletedQuestionsCount },
      }).exec();
    }

    // Log page deletion
    if (userId) {
      await this.auditLogService.logActivity(
        surveyId,
        userId,
        AuditLogAction.DELETED,
        AuditLogEntityType.PAGE,
        {
          entityId: pageId,
          entityName: page.title,
        },
      );
    }
  }

  async addQuestion(
    surveyId: string,
    pageId: string,
    questionData: any,
  ): Promise<SurveyPageCollection> {
    const page = await this.findOne(surveyId, pageId);

    // Add question to page
    page.questions.push(questionData);

    await page.save();

    // Update survey's totalQuestions count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalQuestions: 1 },
    }).exec();

    return page;
  }

  async updateQuestion(
    surveyId: string,
    pageId: string,
    questionIndex: number,
    questionData: any,
  ): Promise<SurveyPageCollection> {
    const page = await this.findOne(surveyId, pageId);

    if (questionIndex < 0 || questionIndex >= page.questions.length) {
      throw new NotFoundException('Question not found');
    }

    // Update question
    Object.assign(page.questions[questionIndex], questionData);
    await page.save();

    return page;
  }

  async deleteQuestion(surveyId: string, pageId: string, questionIndex: number): Promise<void> {
    const page = await this.findOne(surveyId, pageId);

    if (questionIndex < 0 || questionIndex >= page.questions.length) {
      throw new NotFoundException('Question not found');
    }

    page.questions[questionIndex].isDeleted = true;
    await page.save();

    // Update survey's totalQuestions count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalQuestions: -1 },
    }).exec();
  }

  async restoreQuestion(surveyId: string, pageId: string, questionIndex: number): Promise<void> {
    const page = await this.findOne(surveyId, pageId);

    if (questionIndex < 0 || questionIndex >= page.questions.length) {
      throw new NotFoundException('Question not found');
    }

    page.questions[questionIndex].isDeleted = false;
    await page.save();

    // Update survey's totalQuestions count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalQuestions: 1 },
    }).exec();
  }

  async searchQuestions(searchText: string): Promise<SurveyPageCollection[]> {
    // Search across all pages for questions matching the text
    const allPages = await this.surveyPageModel
      .find({ isDeleted: false })
      .exec();

    // Filter pages that have questions matching the search text
    return allPages.filter((page) =>
      page.questions.some(
        (q: any) =>
          !q.isDeleted && q.text && q.text.toLowerCase().includes(searchText.toLowerCase()),
      ),
    );
  }
}

