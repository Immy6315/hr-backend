import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserSurveyResponse } from './schemas/user-survey-response.schema';
import { UserSurvey } from './schemas/user-survey.schema';
import { Survey } from './schemas/survey.schema';
import { SurveyPageCollection } from './schemas/survey-page-collection.schema';
import { CreateResponseDto } from './dto/create-response.dto';
import { UserSurveysService } from './user-surveys.service';
import { SurveysService } from './surveys.service';

@Injectable()
export class UserSurveyResponsesService {
  constructor(
    @InjectModel(UserSurveyResponse.name)
    private responseModel: Model<UserSurveyResponse>,
    @InjectModel(UserSurvey.name) private userSurveyModel: Model<UserSurvey>,
    @InjectModel(SurveyPageCollection.name) private surveyPageModel: Model<SurveyPageCollection>,
    private userSurveysService: UserSurveysService,
    private surveysService: SurveysService,
  ) {}

  async create(userId: string | undefined, createResponseDto: CreateResponseDto): Promise<UserSurveyResponse> {
    // Verify userSurvey exists
    const userSurvey = await this.userSurveysService.findOne(createResponseDto.userSurveyId);
    
    // Check if userSurvey belongs to user (only if userId is provided and userSurvey has userId)
    if (userId && userSurvey.userId) {
      if (userSurvey.userId.toString() !== userId) {
        throw new BadRequestException('UserSurvey does not belong to this user');
      }
    }

    // Get survey to find question details
    const survey = await this.surveysService.findOne(userSurvey.surveyId.toString());

    // Find question in survey structure - now using questionId field
    let questionText: string | undefined;
    let pageIndex: number | undefined;
    let questionOrder: number | undefined;

    // Get pages from SurveyPageCollection
    const pages = await this.surveyPageModel
      .find({
        surveyId: userSurvey.surveyId,
        isDeleted: false,
      })
      .exec();

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      for (const question of page.questions || []) {
        const qId = question.questionId || (question as any)._id?.toString();
        if (qId === createResponseDto.questionId) {
          questionText = question.text;
          pageIndex = pIdx;
          questionOrder = question.uniqueOrder as any;
          break;
        }
      }
      if (questionText) break;
    }

    // Fallback: if still not found, try to get from survey.pages (legacy)
    if (!questionText && survey.pages) {
      for (let pIdx = 0; pIdx < survey.pages.length; pIdx++) {
        const page = survey.pages[pIdx];
        for (let qIdx = 0; qIdx < page.questions.length; qIdx++) {
          const question = page.questions[qIdx];
          const qId = question.questionId || question._id?.toString() || `${pIdx}_${question.uniqueOrder}`;
          if (qId === createResponseDto.questionId || question.uniqueOrder.toString() === createResponseDto.questionId) {
            questionText = question.text;
            pageIndex = pIdx;
            questionOrder = question.uniqueOrder;
            break;
          }
        }
        if (questionText) break;
      }
    }

    if (!questionText) {
      // Allow response creation even if question not found (for flexibility)
      questionText = 'Unknown Question';
    }

    // Check if response already exists
    const existing = await this.responseModel
      .findOne({
        userSurveyId: new Types.ObjectId(createResponseDto.userSurveyId),
        questionId: createResponseDto.questionId,
        isDeleted: false,
      })
      .exec();

    if (existing) {
      // Update existing response
      existing.response = createResponseDto.response;
      existing.comment = createResponseDto.comment;
      existing.score = createResponseDto.score;
      existing.answeredAt = new Date();
      return existing.save();
    }

    // Create new response
    const response = new this.responseModel({
      userId: userId ? new Types.ObjectId(userId) : userSurvey.userId || undefined,
      surveyId: userSurvey.surveyId,
      userSurveyId: new Types.ObjectId(createResponseDto.userSurveyId),
      questionId: createResponseDto.questionId,
      questionType: createResponseDto.questionType,
      response: createResponseDto.response,
      questionText,
      pageIndex,
      questionOrder,
      comment: createResponseDto.comment,
      score: createResponseDto.score,
      answeredAt: new Date(),
    });

    const saved = await response.save();

    // Update userSurvey progress
    const totalResponses = await this.responseModel
      .countDocuments({
        userSurveyId: new Types.ObjectId(createResponseDto.userSurveyId),
        isDeleted: false,
      })
      .exec();

    await this.userSurveysService.updateProgress(
      createResponseDto.userSurveyId,
      pageIndex || 0,
      totalResponses,
    );

    return saved;
  }

  async findAll(
    userSurveyId?: string,
    surveyId?: string,
    questionId?: string,
  ): Promise<UserSurveyResponse[]> {
    const query: any = { isDeleted: false };

    if (userSurveyId) {
      query.userSurveyId = new Types.ObjectId(userSurveyId);
    }
    if (surveyId) {
      query.surveyId = new Types.ObjectId(surveyId);
    }
    if (questionId) {
      query.questionId = questionId;
    }

    return this.responseModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<UserSurveyResponse> {
    const response = await this.responseModel
      .findOne({ _id: id, isDeleted: false })
      .exec();
    if (!response) {
      throw new NotFoundException(`Response with ID ${id} not found`);
    }
    return response;
  }

  async findByUserSurvey(userSurveyId: string): Promise<UserSurveyResponse[]> {
    return this.responseModel
      .find({
        userSurveyId: new Types.ObjectId(userSurveyId),
        isDeleted: false,
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async remove(id: string): Promise<void> {
    const response = await this.findOne(id);
    response.isDeleted = true;
    await response.save();
  }

  async getQuestionAnalytics(surveyId: string, questionId: string): Promise<any> {
    const responses = await this.responseModel
      .find({
        surveyId: new Types.ObjectId(surveyId),
        questionId,
        isDeleted: false,
      })
      .exec();

    return {
      questionId,
      totalResponses: responses.length,
      responses: responses.map((r) => ({
        response: r.response,
        answeredAt: r.answeredAt,
      })),
    };
  }
}

