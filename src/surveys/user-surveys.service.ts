import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserSurvey, UserSurveyStatus } from './schemas/user-survey.schema';
import { Survey } from './schemas/survey.schema';
import { SurveyParticipant } from './schemas/survey-participant.schema';
import { UserSurveyResponse } from './schemas/user-survey-response.schema';
import { CreateUserSurveyDto } from './dto/create-user-survey.dto';
import { SurveysService } from './surveys.service';
import { SurveyAuditLogService } from './survey-audit-log.service';
import { AuditLogAction, AuditLogEntityType } from './schemas/survey-audit-log.schema';
import * as crypto from 'crypto';

@Injectable()
export class UserSurveysService {
  constructor(
    @InjectModel(UserSurvey.name) private userSurveyModel: Model<UserSurvey>,
    @InjectModel(Survey.name) private surveyModel: Model<Survey>,
    @InjectModel(SurveyParticipant.name) private participantModel: Model<SurveyParticipant>,
    @InjectModel(UserSurveyResponse.name) private responseModel: Model<UserSurveyResponse>,
    private surveysService: SurveysService,
    private auditLogService: SurveyAuditLogService,
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

    if (createUserSurveyDto.surveyParticipantId) {
      // If participant ID provided, check for existing response for this specific participant assignment
      query.surveyParticipantId = new Types.ObjectId(createUserSurveyDto.surveyParticipantId);
    } else if (userId && userId.trim() !== '') {
      query.userId = userId;
      // Ensure we don't pick up a response that is linked to a specific participant if we are looking for a generic user response
      // (Though in 360 logic, usually all responses are linked to a participant)
      query.surveyParticipantId = { $exists: false };
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

    if (createUserSurveyDto.surveyParticipantId) {
      userSurveyData.surveyParticipantId = new Types.ObjectId(createUserSurveyDto.surveyParticipantId);
    }

    const userSurvey = new this.userSurveyModel(userSurveyData);

    const saved = await userSurvey.save();

    // Link back to SurveyParticipant if applicable
    if (createUserSurveyDto.surveyParticipantId) {
      await this.participantModel.updateOne(
        { _id: createUserSurveyDto.surveyParticipantId },
        { $set: { userSurveyId: saved._id } }
      );
    }

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
      .populate('surveyParticipantId')
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

  async addNominee(
    surveyId: string,
    participantEmail: string,
    dto: { respondentName: string; respondentEmail: string; relationship: string },
  ): Promise<SurveyParticipant> {
    const survey = await this.surveysService.findOne(surveyId);
    if (!survey) throw new NotFoundException('Survey not found');

    // Find the participant (nominator) to check if they're invited
    const participant = await this.participantModel.findOne({
      surveyId: new Types.ObjectId(surveyId),
      participantEmail: participantEmail.toLowerCase(),
      isDeleted: false,
    });

    if (!participant) {
      throw new NotFoundException('You are not a participant of this survey');
    }

    // Check if nominations are allowed for this participant
    // Allow if:
    // 1. Nominations are generally open (isOpen=true), OR
    // 2. Participant was explicitly invited (has nominationStatus set by admin)
    const isInvitedParticipant = participant.nominationStatus !== undefined &&
      participant.nominationStatus !== null;

    if (!survey.nominationConfig?.isOpen && !isInvitedParticipant) {
      throw new BadRequestException('Nominations are closed for this survey');
    }

    // Check allowed relationships
    if (
      survey.nominationConfig.allowedRelationships &&
      !survey.nominationConfig.allowedRelationships.includes(dto.relationship)
    ) {
      throw new BadRequestException(`Relationship '${dto.relationship}' is not allowed`);
    }

    // Check for duplicate nominee
    const existing = await this.participantModel.findOne({
      surveyId: new Types.ObjectId(surveyId),
      participantEmail: participantEmail,
      respondentEmail: dto.respondentEmail,
    });

    if (existing) {
      throw new BadRequestException('This respondent has already been nominated');
    }

    // Create new nominee
    const nominee = new this.participantModel({
      surveyId: new Types.ObjectId(surveyId),
      participantName: participant.participantName || 'Self',
      participantEmail: participantEmail,
      respondentName: dto.respondentName,
      respondentEmail: dto.respondentEmail,
      relationship: dto.relationship,
      verificationStatus: 'pending',
      addedBy: 'participant',
      nominatedBy: participantEmail,
    });

    const saved = await nominee.save();

    await this.auditLogService.logActivity(
      surveyId,
      { performedBy: participantEmail },
      AuditLogAction.CREATED,
      AuditLogEntityType.NOMINATION,
      {
        entityId: saved._id.toString(),
        entityName: saved.respondentName,
        description: `nominated ${saved.respondentName} (${saved.relationship})`,
        newValue: {
          name: saved.respondentName,
          email: saved.respondentEmail,
          relationship: saved.relationship,
        },
      },
    );

    return saved;
  }

  async getNominees(surveyId: string, participantEmail: string): Promise<SurveyParticipant[]> {
    return this.participantModel.find({
      surveyId: new Types.ObjectId(surveyId),
      nominatedBy: participantEmail,
    }).exec();
  }

  async removeNominee(nomineeId: string, participantEmail: string): Promise<void> {
    const nominee = await this.participantModel.findOne({
      _id: nomineeId,
      nominatedBy: participantEmail,
    });

    if (!nominee) {
      throw new NotFoundException('Nominee not found');
    }

    if (nominee.verificationStatus === 'verified') {
      throw new BadRequestException('Cannot remove a verified nominee');
    }

    await this.participantModel.deleteOne({ _id: nomineeId }).exec();

    await this.auditLogService.logActivity(
      nominee.surveyId.toString(),
      { performedBy: participantEmail },
      AuditLogAction.DELETED,
      AuditLogEntityType.NOMINATION,
      {
        entityId: nomineeId,
        entityName: nominee.respondentName,
        description: `removed nomination for ${nominee.respondentName}`,
      },
    );
  }

  async getParticipantResponseCounts(surveyId: string, participantEmail: string): Promise<{ total: number; byRelationship: Record<string, number> }> {
    // 1. Find the subject's assignments (nominees)
    const nominees = await this.participantModel.find({
      surveyId: new Types.ObjectId(surveyId),
      participantEmail: { $regex: new RegExp(`^${participantEmail}$`, 'i') },
      isDeleted: false
    }).exec();

    const nomineeIds = nominees.map(n => n._id);
    const nomineeEmails = nominees.map(n => n.respondentEmail).filter(Boolean);

    // 2. Count completed surveys linked to these nominees (by ID or Email)
    const responses = await this.userSurveyModel.find({
      surveyId: new Types.ObjectId(surveyId),
      $or: [
        { surveyParticipantId: { $in: nomineeIds } },
        { userId: { $in: nomineeEmails } }
      ],
      status: UserSurveyStatus.COMPLETED,
      isDeleted: false
    }).populate('surveyParticipantId').exec();

    const byRelationship: Record<string, number> = {};

    // Create lookup maps
    const nomineeMapById = new Map(nominees.map(n => [n._id.toString(), n]));
    const nomineeMapByEmail = new Map(nominees.map(n => [n.respondentEmail.toLowerCase(), n]));

    responses.forEach(r => {
      let relationship = '';

      // Try to get relationship from populated field
      const p = r.surveyParticipantId as any;
      if (p && p.relationship) {
        relationship = p.relationship;
      }
      // Fallback: try to match by ID
      else if (r.surveyParticipantId && nomineeMapById.has(r.surveyParticipantId.toString())) {
        relationship = nomineeMapById.get(r.surveyParticipantId.toString()).relationship;
      }
      // Fallback: try to match by Email (userId)
      else if (r.userId && nomineeMapByEmail.has(r.userId.toLowerCase())) {
        relationship = nomineeMapByEmail.get(r.userId.toLowerCase()).relationship;
      }

      if (relationship) {
        byRelationship[relationship] = (byRelationship[relationship] || 0) + 1;
      }
    });

    return {
      total: responses.length,
      byRelationship
    };
  }

  async getParticipantReportOverview(surveyId: string, participantEmail: string) {
    const counts = await this.getParticipantResponseCounts(surveyId, participantEmail);

    // Get timeline data
    const nominees = await this.participantModel.find({
      surveyId: new Types.ObjectId(surveyId),
      participantEmail: { $regex: new RegExp(`^${participantEmail}$`, 'i') },
      isDeleted: false
    }).exec();
    const nomineeIds = nominees.map(n => n._id);
    const nomineeEmails = nominees.map(n => n.respondentEmail).filter(Boolean);

    const responses = await this.userSurveyModel.find({
      surveyId: new Types.ObjectId(surveyId),
      $or: [
        { surveyParticipantId: { $in: nomineeIds } },
        { userId: { $in: nomineeEmails } }
      ],
      status: UserSurveyStatus.COMPLETED,
      isDeleted: false
    }).sort({ completedAt: 1 }).exec();

    // Group by date
    const timelineMap = new Map<string, number>();
    responses.forEach(r => {
      if (r.completedAt) {
        const date = r.completedAt.toISOString().split('T')[0];
        timelineMap.set(date, (timelineMap.get(date) || 0) + 1);
      }
    });

    const timelineData = Array.from(timelineMap.entries()).map(([date, count]) => ({ date, count }));

    return {
      total: counts.total,
      completed: counts.total,
      inProgress: 0,
      notStarted: nominees.length - counts.total,
      completionRate: nominees.length > 0 ? Math.round((counts.total / nominees.length) * 100) : 0,
      timelineData
    };
  }

  async getParticipantReportRespondents(surveyId: string, participantEmail: string) {
    const nominees = await this.participantModel.find({
      surveyId: new Types.ObjectId(surveyId),
      participantEmail: { $regex: new RegExp(`^${participantEmail}$`, 'i') },
      isDeleted: false
    }).exec();



    const nomineeIds = nominees.map(n => n._id);
    const nomineeEmails = nominees.map(n => n.respondentEmail).filter(Boolean);

    const responses = await this.userSurveyModel.find({
      surveyId: new Types.ObjectId(surveyId),
      $or: [
        { surveyParticipantId: { $in: nomineeIds } },
        { userId: { $in: nomineeEmails } }
      ],
      isDeleted: false
    }).exec();

    // Create maps for quick lookup
    const responseMapById = new Map(responses.map(r => [r.surveyParticipantId?.toString(), r]));
    const responseMapByEmail = new Map(responses.map(r => [r.userId?.toLowerCase(), r]));

    return nominees.map(n => {
      // Try to find response by ID first, then by Email
      let response = responseMapById.get(n._id.toString()) as any;
      if (!response && n.respondentEmail) {
        response = responseMapByEmail.get(n.respondentEmail.toLowerCase());
      }
      return {
        id: n._id,
        name: n.respondentName,
        email: n.respondentEmail,
        relationship: n.relationship,
        status: response?.status || 'not_started',
        progress: response?.answeredQuestions && response.totalQuestions ? Math.round((response.answeredQuestions / response.totalQuestions) * 100) : 0,
        updatedAt: response?.updatedAt || n.updatedAt
      };
    });
  }

  async getParticipantReportAnalytics(surveyId: string, participantEmail: string) {
    // 1. Get relevant UserSurvey IDs
    const nominees = await this.participantModel.find({
      surveyId: new Types.ObjectId(surveyId),
      participantEmail: { $regex: new RegExp(`^${participantEmail}$`, 'i') },
      isDeleted: false
    }).exec();
    const nomineeIds = nominees.map(n => n._id);
    const nomineeEmails = nominees.map(n => n.respondentEmail).filter(Boolean);

    const responses = await this.userSurveyModel.find({
      surveyId: new Types.ObjectId(surveyId),
      $or: [
        { surveyParticipantId: { $in: nomineeIds } },
        { userId: { $in: nomineeEmails } }
      ],
      status: UserSurveyStatus.COMPLETED,
      isDeleted: false
    }).exec();

    const userSurveyIds = responses.map(r => r._id);

    if (userSurveyIds.length === 0) {
      return [];
    }

    // 2. Fetch all answers for these responses
    const allAnswers = await this.responseModel.find({
      userSurveyId: { $in: userSurveyIds },
      isDeleted: false
    }).sort({ createdAt: 1 }).exec(); // Sort by creation time for sequential matching

    // 3. Get Survey Structure (Questions)
    const survey = await this.surveysService.findOne(surveyId);
    const questions: any[] = [];

    (survey.pages || []).forEach((page: any) => {
      (page.questions || []).forEach((q: any) => {
        if (!q.isDeleted) {
          // Ensure we work with a plain object to avoid Mongoose property access issues
          const qObj = typeof q.toObject === 'function' ? q.toObject() : JSON.parse(JSON.stringify(q));

          // CRITICAL: Ensure rows/columns are populated from gridRows/gridColumns/row immediately
          // SurveysService.formatQuestionForResponse returns 'row' (singular), so we must check that too.
          if (!qObj.rows || qObj.rows.length === 0) {
            if (qObj.row && qObj.row.length > 0) {
              qObj.rows = qObj.row;
            } else if (qObj.gridRows && qObj.gridRows.length > 0) {
              qObj.rows = qObj.gridRows;
            }
          }

          if ((!qObj.columns || qObj.columns.length === 0) && qObj.gridColumns && qObj.gridColumns.length > 0) {
            qObj.columns = qObj.gridColumns;
          }

          questions.push({ ...qObj, pageId: page.id || page._id });
        }
      });
    });

    // --- PRE-PROCESSING: Map Answers to Questions ---
    // We need to handle unmatched answers by mapping them sequentially based on type
    const answersByQuestionId = new Map<string, any[]>();

    // Group answers by UserSurvey to process each participant's session individually
    const answersByUserSurvey = new Map<string, any[]>();
    allAnswers.forEach(a => {
      const key = a.userSurveyId.toString();
      if (!answersByUserSurvey.has(key)) answersByUserSurvey.set(key, []);
      answersByUserSurvey.get(key).push(a);
    });

    answersByUserSurvey.forEach((userAnswers, usId) => {
      const matchedAnswers = new Set<string>(); // Keep track of matched answer IDs
      const matchedQuestions = new Set<string>(); // Keep track of questions answered by this user

      // Pass 1: Strong Matches (ID, Text, Order)
      userAnswers.forEach(a => {
        let matchedQ: any = null;

        // 1. Direct ID Match
        matchedQ = questions.find(q => String(q.questionId || q.id || q._id) === String(a.questionId));

        // 2. Text Match
        if (!matchedQ && a.questionText && a.questionText !== 'Unknown Question') {
          matchedQ = questions.find(q => q.text && q.text.trim().toLowerCase() === a.questionText.trim().toLowerCase());
        }

        // 3. Order Match
        if (!matchedQ && a.pageIndex !== undefined && a.questionOrder !== undefined) {
          matchedQ = questions.find(q => {
            const pIndex = (survey.pages || []).findIndex((p: any) => String(p.id || p._id) === String(q.pageId));
            return pIndex === a.pageIndex && Number(q.uniqueOrder) === a.questionOrder;
          });
        }

        if (matchedQ) {
          const qKey = String(matchedQ.questionId || matchedQ.id || matchedQ._id);
          if (!answersByQuestionId.has(qKey)) answersByQuestionId.set(qKey, []);
          answersByQuestionId.get(qKey).push(a);

          matchedAnswers.add(String(a._id));
          matchedQuestions.add(qKey);
        }
      });

      // Pass 2: Sequential Type Matching for Unmatched Answers
      const unmatchedAnswers = userAnswers.filter(a => !matchedAnswers.has(String(a._id)));

      if (unmatchedAnswers.length > 0) {
        // Iterate through questions in order
        questions.forEach(q => {
          const qKey = String(q.questionId || q.id || q._id);

          // If this question wasn't matched in Pass 1 for this user
          if (!matchedQuestions.has(qKey)) {
            // Find the first unmatched answer with the same type
            const candidateIdx = unmatchedAnswers.findIndex(a =>
              a.questionType === q.type ||
              (a.questionType === 'matrix_radio' && q.type === 'MATRIX_RADIO_BOX') ||
              (a.questionType === 'matrix_checkbox' && q.type === 'MATRIX_CHECK_BOX') ||
              (a.questionType === 'radio' && q.type === 'RADIO_BOX') ||
              (a.questionType === 'checkbox' && q.type === 'CHECK_BOX')
            );

            if (candidateIdx !== -1) {
              const a = unmatchedAnswers[candidateIdx];
              // Link it!
              if (!answersByQuestionId.has(qKey)) answersByQuestionId.set(qKey, []);
              answersByQuestionId.get(qKey).push(a);

              // Remove from unmatched list so it's not reused
              unmatchedAnswers.splice(candidateIdx, 1);
            }
          }
        });
      }
    });

    // 4. Aggregate Data
    return questions.map((question, index) => {
      const qType = question.type;
      const qKey = String(question.questionId || question.id || question._id);

      // Get mapped answers
      const questionAnswers = answersByQuestionId.get(qKey) || [];

      const answeredCount = questionAnswers.length;

      // Basic aggregation based on type
      let chartData: any[] = [];
      let textResponses: string[] = [];

      if (['single_choice', 'multiple_choice', 'dropdown', 'rating', 'nps', 'opinion_scale', 'RADIO_BOX', 'CHECK_BOX', 'DROPDOWN'].includes(qType)) {
        const counts: Record<string, number> = {};
        questionAnswers.forEach(a => {
          const values = Array.isArray(a.response) ? a.response : [a.response];
          values.forEach((v: any) => {
            const key = String(v);
            counts[key] = (counts[key] || 0) + 1;
          });
        });

        if (question.options) {
          chartData = question.options.map((opt: any) => ({
            name: opt.text,
            value: counts[String(opt.text)] || counts[String(opt.value)] || counts[String(opt.id)] || 0
          }));
        } else {
          chartData = Object.entries(counts).map(([name, value]) => ({ name, value }));
        }
      } else if (['short_text', 'long_text', 'LONG_ANSWER', 'SHORT_ANSWER'].includes(qType)) {
        textResponses = questionAnswers.map(a => String(a.response)).filter(Boolean);
      } else if (['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(qType)) {
        // Handle Matrix
        const crypto = require('crypto');

        // Determine questionIdForRowCol for Matrix Row Hash Generation
        let questionIdForRowCol = question.questionId;

        // Fix for SurveysService returning random ephemeral questionIds:
        // If the questionId is missing or created by randomBytes (32 chars hex), prefer the stable MD5 hash.
        const isRandomId = !question.questionId || (typeof question.questionId === 'string' && question.questionId.length === 32 && /^[0-9a-f]+$/i.test(question.questionId));

        // Generate stable hash based on pageId, uniqueOrder, text, type.
        // NOTE: We use 'index' from the map loop as a fallback if uniqueOrder is missing,
        // mirroring the Admin logic 'hashIndex'.
        const hashIndexInput = `${question.pageId?.toString() || ''}-${index}-${question.text}-${question.type}`;
        const hashIndex = crypto.createHash('md5')
          .update(hashIndexInput)
          .digest('hex');

        let hashUnique: string | null = null;
        if (question.uniqueOrder !== undefined) {
          hashUnique = crypto.createHash('md5')
            .update(`${question.pageId?.toString() || ''}-${question.uniqueOrder}-${question.text}-${question.type}`)
            .digest('hex');
        }

        // Prefer hashUnique if available (most stable, often from survey-collector)
        // Otherwise, use hashIndex if question.questionId is random or missing
        if (isRandomId || !questionIdForRowCol) {
          questionIdForRowCol = hashUnique || hashIndex;
        }

        // CRITICAL FIX: Update the question's ID to be the stable hash so the frontend uses it.
        // This ensures export/analytics calls use the consistent ID.
        question.questionId = questionIdForRowCol;
        question.id = questionIdForRowCol; // Also update alias just in case


        // Ensure we use gridRows if rows is missing (common alias in our DB)
        if ((!question.rows || question.rows.length === 0) && question.gridRows && question.gridRows.length > 0) {
          try {
            question.rows = JSON.parse(JSON.stringify(question.gridRows));
          } catch (e) {
            console.error('Error copying gridRows to rows', e);
            question.rows = question.gridRows;
          }
        }

        if ((!question.columns || question.columns.length === 0) && question.gridColumns && question.gridColumns.length > 0) {
          try {
            question.columns = JSON.parse(JSON.stringify(question.gridColumns));
          } catch (e) {
            console.error('Error copying gridColumns to columns', e);
            question.columns = question.gridColumns;
          }
        }


        // Fallback: If rows are missing in survey definition, reconstruct them from responses
        if ((!question.rows || question.rows.length === 0) && answeredCount > 0) {
          const rowIds = new Set<string>();
          questionAnswers.forEach(a => {
            const val = a.response;
            if (Array.isArray(val)) {
              val.forEach((v: any) => { if (v && v.rowId) rowIds.add(String(v.rowId)); });
            } else if (typeof val === 'object' && val !== null) {
              if (val.rowId) rowIds.add(String(val.rowId));
              else {
                // Map format { rowId: colId }
                Object.keys(val).forEach(k => rowIds.add(k));
              }
            }
          });
          if (rowIds.size > 0) {
            question.rows = Array.from(rowIds).map((rId, idx) => ({
              id: rId,
              text: `Statement ${idx + 1}`, // Generic label as text is lost
              uniqueOrder: idx,
              columns: []
            }));
          }
        }

        // Fallback: Check for orphaned columns (IDs in response not matching survey columns)
        if (question.columns && answeredCount > 0) {
          const validColIds = new Set(question.columns.map((c: any) => String(c.id || c._id)));
          // Also add uniqueOrder and value to valid set just in case
          question.columns.forEach((c: any) => {
            if (c.uniqueOrder) validColIds.add(String(c.uniqueOrder));
            if (c.value) validColIds.add(String(c.value));

            // Also check against generated hash if we have a stable ID
            if (questionIdForRowCol) {
              const colText = c.text || c.label || c.description || '';
              // Try to match against what the hash WOULD be
              // Note: We don't know the index easily here without iterating, but let's assume standard order
              // This part is tricky for validation, but for recovery we focus on what's IN the response
            }
          });

          const orphanedColIds = new Set<string>();
          questionAnswers.forEach(a => {
            const val = a.response;
            if (Array.isArray(val)) {
              val.forEach((v: any) => {
                const cId = String(v.columnId || v.value);
                if (cId && !validColIds.has(cId)) orphanedColIds.add(cId);
              });
            } else if (typeof val === 'object' && val !== null) {
              if (val.columnId) {
                const cId = String(val.columnId);
                if (cId && !validColIds.has(cId)) orphanedColIds.add(cId);
              } else {
                Object.values(val).forEach((v: any) => {
                  const cId = String(v);
                  if (cId && !validColIds.has(cId)) orphanedColIds.add(cId);
                });
              }
            }
          });

          if (orphanedColIds.size > 0) {
            // Append recovered columns
            const recoveredCols = Array.from(orphanedColIds).map((cId, idx) => ({
              id: cId,
              text: `Recovered Option ${idx + 1}`,
              value: cId,
              uniqueOrder: question.columns.length + idx,
              count: 0
            }));
            question.columns = [...question.columns, ...recoveredCols];
          }
        }

        if (question.rows && question.columns) {
          // Deep copy rows to avoid mutating the original survey object
          question.rows = question.rows.map((r: any) => ({ ...r }));

          question.rows.forEach((row: any, rowIdx: number) => {
            // Initialize columns with counts for this row
            row.columns = question.columns.map((col: any) => ({ ...col, count: 0 }));
            row.score = []; // Initialize score array

            // Generate stable MD5 hash ID for row to match responses
            const rowText = row.text || row.label || row.statement || `Statement ${rowIdx + 1}`;
            const rowHash = crypto.createHash('md5')
              .update(`${questionIdForRowCol}-row-${rowIdx}-${rowText}`)
              .digest('hex');

            // Iterate through all answers to count selections for this specific row
            questionAnswers.forEach(a => {
              // Matrix response is typically an array of {rowId, columnId} objects
              const responses = Array.isArray(a.response) ? a.response : (typeof a.response === 'object' && a.response !== null ? [a.response] : []);

              // Find the specific answer entry for this row (matching by ID or Hash)
              const matchedEntry = responses.find((r: any) =>
                (r.rowId && (String(r.rowId) === String(row.id) || String(r.rowId) === String(row._id))) ||
                (r.rowId && String(r.rowId) === rowHash)
              );

              if (matchedEntry) {
                const colId = String(matchedEntry.columnId || matchedEntry.value);

                // Find the corresponding column in our initialized columns list and increment count
                const col = row.columns.find((c: any, cIdx: number) => {
                  // Direct ID/Value match
                  if (String(c.id) === colId || String(c._id) === colId || String(c.value) === colId) return true;
                  if (c.uniqueOrder !== undefined && String(c.uniqueOrder) === colId) return true;

                  // Hash-based match for consistency with stable ID generation
                  const colText = c.text || c.label || c.description || '';
                  const colHash = crypto.createHash('md5')
                    .update(`${questionIdForRowCol}-column-${cIdx}-${colText}`)
                    .digest('hex');

                  return colHash === colId;
                });

                if (col) {
                  col.count = (col.count || 0) + 1;
                  if (col.weight !== undefined) {
                    row.score.push(col.weight);
                  }
                }
              }
            });


          });
        }
      }

      return {
        questionId: question.questionId,
        text: question.text,
        type: question.type,
        answeredCount,
        chartData,
        textResponses,
        rows: question.rows, // Include processed rows for Matrix
        columns: question.columns // Include columns for reference
      };
    });
  }
}
