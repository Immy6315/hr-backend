import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserSurvey, UserSurveyStatus } from './schemas/user-survey.schema';
import { Survey } from './schemas/survey.schema';
import { CreateUserSurveyDto } from './dto/create-user-survey.dto';
import { SurveysService } from './surveys.service';
import * as crypto from 'crypto';

@Injectable()
export class UserSurveysService {
  constructor(
    @InjectModel(UserSurvey.name) private userSurveyModel: Model<UserSurvey>,
    @InjectModel(Survey.name) private surveyModel: Model<Survey>,
    private surveysService: SurveysService,
  ) { }

  async create(
    userId: string,
    createUserSurveyDto: CreateUserSurveyDto,
  ): Promise<UserSurvey> {
    // Check if survey exists and is active
    const survey = await this.surveysService.findOne(createUserSurveyDto.surveyId);
    if (survey.status !== 'active') {
      throw new BadRequestException('Survey is not active');
    }

    // Build query - userId is optional for IP-based surveys
    const query: any = {
      surveyId: new Types.ObjectId(createUserSurveyDto.surveyId),
      isDeleted: false,
    };

    if (userId && userId.trim() !== '') {
      query.userId = userId;
    } else {
      query.userId = null; // For IP-based surveys
    }

    // Check if user already started this survey
    const existing = await this.userSurveyModel.findOne(query).exec();

    if (existing && existing.status === UserSurveyStatus.COMPLETED) {
      throw new BadRequestException('Survey already completed');
    }

    if (existing) {
      // Update existing instance
      existing.status = UserSurveyStatus.IN_PROGRESS;
      existing.lastActivityAt = new Date();
      if (!existing.startedAt) {
        existing.startedAt = new Date();
      }
      return existing.save();
    }

    // Create new instance
    const userSurveyData: any = {
      surveyId: new Types.ObjectId(createUserSurveyDto.surveyId),
      status: UserSurveyStatus.STARTED,
      ipAddress: createUserSurveyDto.ipAddress,
      surveyName: survey.name,
      surveyCategory: survey.category,
      totalPages: survey.totalPages,
      totalQuestions: survey.totalQuestions,
      currentPageIndex: 0,
      answeredQuestions: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    // Only set userId if provided
    if (userId && userId.trim() !== '') {
      userSurveyData.userId = userId;
    }

    const userSurvey = new this.userSurveyModel(userSurveyData);

    const saved = await userSurvey.save();

    // Increment survey response count
    await this.surveysService.incrementResponseCount(createUserSurveyDto.surveyId);

    return saved;
  }

  async findAll(
    userId?: string,
    surveyId?: string,
    status?: UserSurveyStatus,
  ): Promise<UserSurvey[]> {
    const query: any = { isDeleted: false };

    if (userId) {
      query.userId = userId;
    }
    if (surveyId) {
      query.surveyId = new Types.ObjectId(surveyId);
    }
    if (status) {
      query.status = status;
    }

    return this.userSurveyModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<UserSurvey> {
    const userSurvey = await this.userSurveyModel
      .findOne({ _id: id, isDeleted: false })
      .exec();
    if (!userSurvey) {
      throw new NotFoundException(`UserSurvey with ID ${id} not found`);
    }
    return userSurvey;
  }

  async findByUserAndSurvey(userId: string, surveyId: string): Promise<UserSurvey | null> {
    return this.userSurveyModel
      .findOne({
        userId: userId,
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      })
      .exec();
  }

  async findBySurvey(surveyId: string): Promise<UserSurvey[]> {
    return this.userSurveyModel
      .find({
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByIpAndSurvey(ipAddress: string, surveyId: string): Promise<UserSurvey | null> {
    return this.userSurveyModel
      .findOne({
        ipAddress,
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      })
      .sort({ createdAt: -1 }) // Get most recent one
      .exec();
  }

  async countByIpAndSurvey(ipAddress: string, surveyId: string): Promise<number> {
    return this.userSurveyModel
      .countDocuments({
        ipAddress,
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      })
      .exec();
  }

  async createByIp(
    ipAddress: string,
    createUserSurveyDto: CreateUserSurveyDto,
  ): Promise<UserSurvey> {
    // Check if survey exists and is active
    const survey = await this.surveysService.findOne(createUserSurveyDto.surveyId);
    if (survey.status !== 'active') {
      throw new BadRequestException('Survey is not active');
    }

    // Check IP limit
    const ipLimit = survey.ipResponseLimit || 1;
    const existingCount = await this.countByIpAndSurvey(ipAddress, createUserSurveyDto.surveyId);

    if (existingCount >= ipLimit) {
      // Return the most recent existing UserSurvey
      const existing = await this.findByIpAndSurvey(ipAddress, createUserSurveyDto.surveyId);
      if (existing) {
        return existing;
      }
    }

    // Create new instance
    const userSurvey = new this.userSurveyModel({
      userId: undefined, // No user for IP-based surveys
      surveyId: new Types.ObjectId(createUserSurveyDto.surveyId),
      status: UserSurveyStatus.STARTED,
      ipAddress,
      surveyName: survey.name,
      surveyCategory: survey.category,
      totalPages: survey.totalPages,
      totalQuestions: survey.totalQuestions,
      currentPageIndex: 0,
      answeredQuestions: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    });

    const saved = await userSurvey.save();

    // Increment survey response count
    await this.surveysService.incrementResponseCount(createUserSurveyDto.surveyId);

    return saved;
  }

  async updateProgress(
    id: string,
    currentPageIndex: number,
    answeredQuestions: number,
  ): Promise<UserSurvey> {
    const userSurvey = await this.findOne(id);
    userSurvey.currentPageIndex = currentPageIndex;
    userSurvey.answeredQuestions = answeredQuestions;
    userSurvey.lastActivityAt = new Date();
    return userSurvey.save();
  }

  /**
   * Generate a unique response ID (e.g., yuNR5KGC)
   */
  private generateResponseId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async complete(
    id: string,
    metadata?: {
      userAgent?: string;
      surveyUrl?: string;
      collector?: string;
      tags?: string[];
    },
  ): Promise<UserSurvey> {
    const userSurvey = await this.findOne(id);

    // Generate response ID if not already set
    if (!userSurvey.responseId) {
      let responseId = this.generateResponseId();
      // Ensure uniqueness
      let exists = await this.userSurveyModel.findOne({ responseId }).exec();
      while (exists) {
        responseId = this.generateResponseId();
        exists = await this.userSurveyModel.findOne({ responseId }).exec();
      }
      userSurvey.responseId = responseId;
    }

    // Set completion time
    const completedAt = new Date();
    userSurvey.completedAt = completedAt;
    userSurvey.status = UserSurveyStatus.COMPLETED;
    userSurvey.lastActivityAt = completedAt;

    // Calculate time taken in seconds
    if (userSurvey.startedAt) {
      const timeTaken = Math.floor((completedAt.getTime() - userSurvey.startedAt.getTime()) / 1000);
      userSurvey.timeTaken = timeTaken;
    }

    // Set metadata if provided
    if (metadata) {
      if (metadata.userAgent) {
        userSurvey.userAgent = metadata.userAgent;
      }
      if (metadata.surveyUrl) {
        userSurvey.surveyUrl = metadata.surveyUrl;
      }
      if (metadata.collector) {
        userSurvey.collector = metadata.collector;
      }
      if (metadata.tags) {
        userSurvey.tags = metadata.tags;
      }
    }

    // Generate response link
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    userSurvey.responseLink = `${baseUrl}/survey/${userSurvey.surveyId}/response/${userSurvey.responseId}`;

    return userSurvey.save();
  }

  async abandon(id: string): Promise<UserSurvey> {
    const userSurvey = await this.findOne(id);
    userSurvey.status = UserSurveyStatus.ABANDONED;
    userSurvey.lastActivityAt = new Date();
    return userSurvey.save();
  }

  async remove(id: string): Promise<void> {
    const userSurvey = await this.findOne(id);
    userSurvey.isDeleted = true;
    await userSurvey.save();
  }
}

