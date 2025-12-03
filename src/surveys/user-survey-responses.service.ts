import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import { UserSurveyResponse } from './schemas/user-survey-response.schema';
import { UserSurvey } from './schemas/user-survey.schema';
import { User } from '../users/schemas/user.schema';
import { Survey } from './schemas/survey.schema';
import { SurveyPageCollection } from './schemas/survey-page-collection.schema';
import { SurveyParticipant } from './schemas/survey-participant.schema';
import { CreateResponseDto } from './dto/create-response.dto';
import { UserSurveysService } from './user-surveys.service';
import { SurveysService } from './surveys.service';

@Injectable()
export class UserSurveyResponsesService {
  constructor(
    @InjectModel(UserSurveyResponse.name)
    private responseModel: Model<UserSurveyResponse>,
    @InjectModel(UserSurvey.name) private userSurveyModel: Model<UserSurvey>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(SurveyPageCollection.name) private surveyPageModel: Model<SurveyPageCollection>,
    @InjectModel(SurveyParticipant.name) private participantModel: Model<SurveyParticipant>,
    private userSurveysService: UserSurveysService,
    private surveysService: SurveysService,
  ) { }

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
        // Match by uniqueOrder (primary ID for questions without _id) or explicit questionId
        const qId = question.questionId || question.uniqueOrder;
        if (String(qId) === String(createResponseDto.questionId)) {
          questionText = question.text;
          pageIndex = pIdx;
          questionOrder = Number(question.uniqueOrder) || 0;
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
            questionOrder = Number(question.uniqueOrder) || 0;
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
      userId: userId ? userId : userSurvey.userId || undefined,
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

  async getSurveyAnalytics(surveyId: string): Promise<any> {
    // 1. Get Survey Definition (Pages & Questions)
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false })
      .sort({ pageIndex: 1 })
      .exec();

    // Flatten questions from pages
    const questions: any[] = [];
    pages.forEach(page => {
      // Ensure we are working with POJOs to avoid Mongoose document spread issues
      const pageObj = page.toObject ? page.toObject() : page;
      (pageObj.questions || []).forEach(q => {
        if (!q.isDeleted) {
          questions.push({ ...q, pageId: pageObj._id });
        }
      });
    });


    // 2. Get All Responses for this Survey
    const responses = await this.responseModel
      .find({
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      })
      .exec();

    console.log(`[getSurveyAnalytics] Found ${responses.length} responses`);



    // Build a lookup map: responseQuestionId -> question
    // Since responses may use MD5 hashes generated from page+index+text+type,
    // we need to try matching both ways
    const questionLookup = new Map<string, any>();

    questions.forEach((q, index) => {
      const qId = q.questionId || q.uniqueOrder;
      questionLookup.set(String(qId), q);

      // Also try to generate the MD5 hash that would have been created for this question
      // if it didn't have a questionId initially
      if (!q.questionId && q.uniqueOrder !== undefined) {
        try {
          const crypto = require('crypto');
          const stableId = crypto.createHash('md5')
            .update(`${q.pageId?.toString() || ''}-${index}-${q.text}-${q.type}`)
            .digest('hex');
          // Map the hash back to this question
          questionLookup.set(stableId, q);
        } catch (err) {
          // Ignore hash generation errors
        }
      }
    });

    // 3. Aggregate Responses by Question
    // Build reverse lookup: MD5 hash -> question using the questionLookup we created
    const hashToQuestion = new Map<string, any>();
    questionLookup.forEach((question, hash) => {
      hashToQuestion.set(hash, question);
    });

    // Group responses by question using the lookup
    const responsesByQuestion = new Map<any, any[]>();
    responses.forEach(r => {
      const question = hashToQuestion.get(r.questionId);
      if (question) {
        if (!responsesByQuestion.has(question)) {
          responsesByQuestion.set(question, []);
        }
        responsesByQuestion.get(question).push(r);
      }
    });

    const analytics = questions.map(q => {
      // Get responses for this question using the map
      const qResponses = responsesByQuestion.get(q) || [];

      const validAnswers = qResponses.map(r => r.response).filter(a => a !== null && a !== undefined && a !== '');

      // Calculate stats based on question type
      let chartData: any[] = [];
      let textResponses: string[] = [];
      let processedRows = [];

      const isChoice = ['multiple_choice', 'dropdown', 'radio', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'RATING_SCALE', 'boolean', 'BOOLEAN'].includes(q.type);
      const isMatrix = ['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(q.type);

      if (isChoice) {
        const counts: Record<string, number> = {};
        validAnswers.forEach(val => {
          const valStr = String(val);
          counts[valStr] = (counts[valStr] || 0) + 1;
        });
        chartData = Object.entries(counts).map(([name, value]) => ({ name, value }));
      } else if (isMatrix) {
        // Process matrix responses - aggregate by row
        const rows = q.rows || q.gridRows || [];
        const columns = q.columns || q.gridColumns || [];
        const crypto = require('crypto');

        // CRITICAL: We must use the SAME questionId that survey-collector used when generating row/column IDs
        // Survey-collector uses the MD5 hash-based questionId, not the numeric uniqueOrder
        // We need to re-generate the stable questionId hash if it doesn't exist
        let questionIdForRowCol = q.questionId;
        if (!questionIdForRowCol && q.uniqueOrder !== undefined) {
          // Generate the same MD5 hash that was used for question matching
          questionIdForRowCol = crypto.createHash('md5')
            .update(`${q.pageId?.toString() || ''}-${q.uniqueOrder}-${q.text}-${q.type}`)
            .digest('hex');
        }

        processedRows = rows.map((row: any, rowIdx: number) => {
          // Generate stable MD5 hash ID for row to match responses
          // This MUST match the ID generation in survey-collector.controller.ts line 1104
          const rowText = row.text || row.label || row.statement || `Statement ${rowIdx + 1}`;
          const rowId = row.id || crypto.createHash('md5')
            .update(`${questionIdForRowCol}-row-${rowIdx}-${rowText}`)
            .digest('hex');

          // Count responses for each column in this row
          const columnCounts: Record<string, number> = {};
          const columnScores: number[] = [];

          validAnswers.forEach(answer => {
            if (Array.isArray(answer)) {
              // Matrix response is array of {rowId, columnId} objects
              answer.forEach((item: any) => {
                if (String(item.rowId) === String(rowId)) {
                  const colId = String(item.columnId);
                  columnCounts[colId] = (columnCounts[colId] || 0) + 1;

                  // Find column by generated ID
                  const column = columns.find((c: any, colIdx: number) => {
                    const colText = c.text || c.label || c.description || '';
                    const colHash = c.id || crypto.createHash('md5')
                      .update(`${questionIdForRowCol}-column-${colIdx}-${colText}`)
                      .digest('hex');
                    return String(colHash) === colId;
                  });
                  if (column && column.weight !== undefined) {
                    columnScores.push(column.weight);
                  }
                }
              });
            }
          });

          // Convert column counts to array format
          const columnsData = columns.map((col: any, colIdx: number) => {
            const colText = col.text || col.label || col.description || '';
            const colHash = col.id || crypto.createHash('md5')
              .update(`${questionIdForRowCol}-column-${colIdx}-${colText}`)
              .digest('hex');
            return {
              ...col,
              count: columnCounts[colHash] || 0
            };
          });

          return {
            text: row.text,
            uniqueOrder: row.uniqueOrder,
            columnsId: Object.keys(columnCounts),
            score: columnScores,
            columns: columnsData
          };
        });

        // For matrix, also keep raw responses for debugging
        textResponses = validAnswers.map(a => JSON.stringify(a));
      } else {
        textResponses = validAnswers.map(String);
      }

      return {
        questionId: q.questionId || q.uniqueOrder, // Return the ID used for matching
        text: q.text,
        type: q.type,
        answeredCount: validAnswers.length,
        chartData,
        textResponses,
        rows: isMatrix ? processedRows : (q.rows || q.gridRows || []),
        columns: q.columns || q.gridColumns || q.options || []
      };
    });

    return analytics;
  }

  async getSurveyOverview(surveyId: string): Promise<any> {
    const userSurveys = await this.userSurveysService.findBySurvey(surveyId);

    const total = userSurveys.length;
    const completed = userSurveys.filter(us =>
      (us.status || '').toLowerCase() === 'completed'
    ).length;
    const inProgress = userSurveys.filter(us =>
      (us.status || '').toLowerCase() === 'in_progress' || (us.status || '').toLowerCase() === 'inprogress'
    ).length;
    const notStarted = total - completed - inProgress;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Calculate daily responses using timestamps (available at runtime)
    const responsesByDate: Record<string, number> = {};
    userSurveys.forEach(us => {
      const usWithTimestamps = us as any; // Mongoose timestamps are available at runtime
      if (usWithTimestamps.updatedAt || usWithTimestamps.createdAt) {
        const date = (usWithTimestamps.updatedAt || usWithTimestamps.createdAt).toISOString().split('T')[0];
        responsesByDate[date] = (responsesByDate[date] || 0) + 1;
      }
    });

    const timelineData = Object.entries(responsesByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      total,
      completed,
      inProgress,
      notStarted,
      completionRate,
      timelineData
    };
  }

  async getSurveyParticipants(surveyId: string): Promise<any[]> {
    const userSurveys = await this.userSurveysService.findBySurvey(surveyId);

    // Fetch all participants for this survey to handle missing links (backward compatibility)
    const allParticipants = await this.participantModel.find({ surveyId: new Types.ObjectId(surveyId) }).exec();

    return userSurveys.map(us => {
      const usWithTimestamps = us as any; // Mongoose timestamps are available at runtime
      const progress = us.totalQuestions > 0
        ? Math.round((us.answeredQuestions / us.totalQuestions) * 100)
        : 0;

      // Check if linked to a specific participant assignment (360 degree logic)
      let participantLink = us.surveyParticipantId as any;

      // Fallback: If no direct link, try to find a matching participant based on respondent email/user
      if (!participantLink) {
        const userIdStr = String(us.userId);
        // Try to find a participant where respondentEmail matches userId (if it's an email)
        // or if we can resolve the user (omitted for speed, assuming userId might be email in this context as per user's data)
        // We also check if the participant record is not already linked to another userSurvey (if possible, but here we just want to display)

        // Simple heuristic: Match respondentEmail
        participantLink = allParticipants.find(p =>
          p.respondentEmail === userIdStr ||
          (p.respondentEmail && p.respondentEmail.toLowerCase() === userIdStr.toLowerCase())
        );
      }

      let participantName = us.userId || 'Anonymous';
      let respondentName = 'Anonymous Responder';
      let respondentEmail = us.userId || '';

      if (participantLink) {
        // If linked, use the Subject's name as the main participant identifier
        participantName = participantLink.participantName;
        // And the Responder's details
        respondentName = participantLink.respondentName;
        respondentEmail = participantLink.respondentEmail;
      }

      return {
        _id: us._id,
        id: us._id,
        participantName: participantName,
        subjectEmail: participantLink ? participantLink.participantEmail : (us.userId || ''), // Subject Email
        respondentName: respondentName,
        respondentEmail: respondentEmail,
        email: respondentEmail, // Backward compatibility
        status: us.status,
        progress: progress,
        updatedAt: usWithTimestamps.updatedAt,
        createdAt: usWithTimestamps.createdAt,
        userSurveyId: us._id,
        surveyParticipantId: participantLink ? participantLink._id : undefined
      };
    });
  }
  async exportQuestionResponses(surveyId: string, questionId: string): Promise<string> {
    const survey = await this.surveysService.findOne(surveyId);
    if (!survey) throw new NotFoundException('Survey not found');

    // Get all questions to ensure we can generate the correct hash (which depends on index)
    // We replicate the logic from getSurveyAnalytics
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false })
      .sort({ pageIndex: 1 })
      .exec();

    const questions: any[] = [];
    pages.forEach(page => {
      const pageObj = page.toObject ? page.toObject() : page;
      (pageObj.questions || []).forEach(q => {
        if (!q.isDeleted) {
          questions.push({ ...q, pageId: pageObj._id });
        }
      });
    });

    let targetQuestion: any = null;
    let targetHash: string | null = null;
    let questionIdForRowCol = questionId;

    // Find the question and generate its hash
    // Find the question and generate its hash
    questions.forEach((q: any, index: number) => {
      const crypto = require('crypto');
      // Match getSurveyAnalytics logic: try both index-based (for lookup) and uniqueOrder-based (for row generation)
      const hashIndex = crypto.createHash('md5')
        .update(`${q.pageId?.toString() || ''}-${index}-${q.text}-${q.type}`)
        .digest('hex');

      let hashUnique = null;
      if (q.uniqueOrder !== undefined) {
        hashUnique = crypto.createHash('md5')
          .update(`${q.pageId?.toString() || ''}-${q.uniqueOrder}-${q.text}-${q.type}`)
          .digest('hex');
      }

      // Check for match
      if (String(q.questionId) === questionId ||
        String(q.uniqueOrder) === questionId ||
        hashIndex === questionId ||
        (hashUnique && hashUnique === questionId)) {
        targetQuestion = q;
        targetHash = hashIndex; // Use index-based for query if that's what matched, or we might need both?

        // Determine questionIdForRowCol for Matrix Row Hash Generation
        // This MUST match getSurveyAnalytics logic
        if (q.questionId) {
          questionIdForRowCol = q.questionId;
        } else if (q.uniqueOrder !== undefined) {
          questionIdForRowCol = hashUnique;
        } else {
          questionIdForRowCol = hashIndex;
        }
      }
    });

    if (!targetQuestion) {
      // Fallback: try to find by simple iteration if getSurveyQuestions didn't return it (unlikely)
      // But for now, let's assume it's found or throw
      // If not found, we might still proceed if we want to dump raw responses for that ID
    }

    // Query responses using both the input ID and the calculated Hash
    const queryIds = [questionId];
    if (targetHash && targetHash !== questionId) queryIds.push(targetHash);

    const responses = await this.responseModel.find({
      surveyId: new Types.ObjectId(surveyId),
      questionId: { $in: queryIds },
      isDeleted: false,
    }).populate('userSurveyId').exec();

    // Manually fetch users to handle mixed types in userId (ObjectId vs Email)
    const userIdsToFetch = new Set<string>();
    responses.forEach(r => {
      const us = r.userSurveyId as any;
      if (us && us.userId && Types.ObjectId.isValid(us.userId) && us.userId.length === 24) {
        userIdsToFetch.add(us.userId);
      }
    });

    const users = await this.userModel.find({ _id: { $in: Array.from(userIdsToFetch) } }).exec();
    const userMap = new Map<string, any>();
    users.forEach(u => userMap.set(String(u._id), u));

    // --- Prepare Data & Generate Excel ---
    const workbook = new ExcelJS.Workbook();
    const surveyTitle = survey.title || 'Survey Results';

    // 1. Summary Sheet
    const summaryData: any[] = [];
    let summaryColumns: any[] = [];

    // Maps for Matrix
    const rowMap = new Map<string, string>();
    const colMap = new Map<string, string>();
    const colWeightMap = new Map<string, number>();

    if (targetQuestion) {
      const crypto = require('crypto');
      const qType = targetQuestion.type;

      // --- MATRIX QUESTIONS ---
      if (['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(qType)) {
        // Build Maps
        const rows = targetQuestion.rows || targetQuestion.gridRows || [];
        const columns = targetQuestion.columns || targetQuestion.gridColumns || [];

        if (rows) {
          rows.forEach((row: any, idx: number) => {
            const rowText = row.text || row.label || `Statement ${idx + 1}`;
            const rowId = row.id || crypto.createHash('md5').update(`${questionIdForRowCol}-row-${idx}-${rowText}`).digest('hex');
            rowMap.set(rowId, rowText);
          });
        }
        if (columns) {
          columns.forEach((col: any, idx: number) => {
            const colText = col.text || col.label || `Option ${idx + 1}`;
            const colId = col.id || crypto.createHash('md5').update(`${questionIdForRowCol}-column-${idx}-${colText}`).digest('hex');
            colMap.set(colId, colText);
            if (col.weight !== undefined) colWeightMap.set(colId, Number(col.weight));
          });
        }

        // Calculate Counts
        if (rows && columns) {
          const matrixCounts: Record<string, Record<string, number>> = {};
          rows.forEach((row: any) => {
            const rowText = rowMap.get(row.id) || row.text;
            matrixCounts[rowText] = {};
            columns.forEach((col: any) => {
              const colText = colMap.get(col.id) || col.text;
              matrixCounts[rowText][colText] = 0;
            });
          });

          responses.forEach(r => {
            const answers = Array.isArray(r.response) ? r.response : [r.response];
            answers.forEach((ans: any) => {
              if (typeof ans === 'object' && ans !== null) {
                const rowText = rowMap.get(ans.rowId) || ans.rowId;
                const colText = colMap.get(ans.columnId) || ans.columnId;
                if (matrixCounts[rowText] && matrixCounts[rowText][colText] !== undefined) {
                  matrixCounts[rowText][colText]++;
                }
              }
            });
          });

          Object.entries(matrixCounts).forEach(([statement, counts]) => {
            const rowObj: any = { 'Statement': statement };
            let totalScore = 0;
            let responseCount = 0;

            Object.entries(counts).forEach(([option, count]) => {
              // Find column to get weight for header display logic later
              const col = columns.find((c: any) => (colMap.get(c.id) || c.text) === option);
              // Key for data object
              const key = col && col.weight !== undefined ? `${option} (${col.weight})` : option;
              rowObj[key] = count;

              if (col && col.weight !== undefined) {
                totalScore += count * Number(col.weight);
                responseCount += count;
              }
            });

            const maxWeight = Math.max(...columns.map((c: any) => Number(c.weight || 0)));
            if (maxWeight > 0) {
              rowObj['Total Score'] = `${totalScore}/${responseCount * maxWeight}`;
            }
            summaryData.push(rowObj);
          });

          // Define Columns for Matrix
          if (summaryData.length > 0) {
            summaryColumns = Object.keys(summaryData[0]).map(key => ({
              header: key,
              key: key,
              width: key === 'Statement' ? 50 : 15,
            }));
          }
        }
      }
      // --- CHOICE QUESTIONS (Radio, Checkbox, Dropdown) ---
      else if (['radio', 'checkbox', 'dropdown', 'RADIO_BOX', 'CHECK_BOX', 'DROPDOWN'].includes(qType)) {
        const counts: Record<string, number> = {};
        let totalResponses = 0;

        responses.forEach(r => {
          const answers = Array.isArray(r.response) ? r.response : [r.response];
          answers.forEach((ans: any) => {
            if (ans) {
              const text = String(ans);
              counts[text] = (counts[text] || 0) + 1;
              totalResponses++;
            }
          });
        });

        Object.entries(counts).forEach(([option, count]) => {
          summaryData.push({
            'Option': option,
            'Count': count,
            'Percentage': totalResponses > 0 ? `${((count / totalResponses) * 100).toFixed(1)}%` : '0%'
          });
        });

        summaryColumns = [
          { header: 'Option', key: 'Option', width: 40 },
          { header: 'Count', key: 'Count', width: 15 },
          { header: 'Percentage', key: 'Percentage', width: 15 },
        ];
      }
      // --- TEXT QUESTIONS ---
      else {
        responses.forEach(r => {
          const answers = Array.isArray(r.response) ? r.response : [r.response];
          answers.forEach((ans: any) => {
            if (ans) {
              summaryData.push({
                'Response': String(ans),
                // 'Date': r.answeredAt ? new Date(r.answeredAt).toISOString().split('T')[0] : '' // Removed as per user request
              });
            }
          });
        });

        summaryColumns = [
          { header: 'Response', key: 'Response', width: 100 },
          // { header: 'Date', key: 'Date', width: 15 }, // Removed as per user request
        ];
      }
    }

    // --- GENERATE SUMMARY SHEET ---
    // Always create the sheet to avoid "invalid file format"
    const worksheet = workbook.addWorksheet('Summary');

    // 1. Survey Name Header (Row 1)
    // Determine number of columns - default to 2 if no data
    const colCount = summaryColumns.length > 0 ? summaryColumns.length : 2;
    const lastColLetter = String.fromCharCode(64 + colCount);

    worksheet.mergeCells('A1', `${lastColLetter}1`); // A1 to LastCol1
    const titleCell = worksheet.getCell('A1');
    titleCell.value = surveyTitle;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF065F46' } }; // Dark Green
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light Green
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // 2. Question Text (Row 2)
    worksheet.mergeCells('A2', `${lastColLetter}2`);
    const qCell = worksheet.getCell('A2');
    qCell.value = targetQuestion?.text || 'Question Analysis';
    qCell.font = { italic: true, color: { argb: 'FF4B5563' } }; // Gray
    qCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 25;

    if (summaryData.length > 0) {
      // 3. Table Headers (Row 3)
      worksheet.getRow(3).values = summaryColumns.map(c => c.header);
      worksheet.columns = summaryColumns; // Set keys

      const headerRow = worksheet.getRow(3);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } }; // Green
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 30;

      // 4. Data Rows (Row 4+)
      summaryData.forEach(data => {
        worksheet.addRow(data);
      });

      // Styling Data Cells
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 3) { // Skip Title, Question, Header
          // Statement/Option Column (A)
          const firstCell = row.getCell(1);
          firstCell.font = { bold: true };
          firstCell.alignment = { wrapText: true, vertical: 'middle' };

          // Data Cells
          row.eachCell((cell, colNumber) => {
            if (colNumber > 1) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };

              // Matrix Bubble Logic
              const headerKey = summaryColumns[colNumber - 1].key;
              if (headerKey !== 'Total Score' && headerKey !== 'Percentage' && headerKey !== 'Date') {
                if (typeof cell.value === 'number' && cell.value > 0) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light Green
                  cell.font = { color: { argb: 'FF065F46' }, bold: true }; // Dark Green
                } else if (typeof cell.value === 'number' && cell.value === 0) {
                  cell.value = '-'; // Replace 0 with -
                  cell.font = { color: { argb: 'FF9CA3AF' } }; // Gray
                }
              }
              // Total Score Bold
              if (headerKey === 'Total Score') {
                cell.font = { bold: true };
              }
            }
          });
        }
      });
    } else {
      // No Data Message
      worksheet.mergeCells('A3', `${lastColLetter}3`);
      const noDataCell = worksheet.getCell('A3');
      noDataCell.value = 'No data available for this question.';
      noDataCell.alignment = { vertical: 'middle', horizontal: 'center' };
      noDataCell.font = { italic: true, color: { argb: 'FF6B7280' } };
    }

    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tempDir = os.tmpdir();
    const fileName = `responses-${questionId}-${Date.now()}.xlsx`;
    const filePath = path.join(tempDir, fileName);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async exportIndividualResponses(userSurveyId: string): Promise<string> {
    // 1. Get User Survey & User Info
    const userSurvey = await this.userSurveysService.findOne(userSurveyId);
    if (!userSurvey) throw new NotFoundException('User Survey not found');

    const survey = await this.surveysService.findOne(userSurvey.surveyId.toString());

    let participantName = 'Anonymous';
    let participantEmail = '';
    let respondentName = 'Anonymous Responder';

    // Check for linked participant (360 degree logic)
    if (userSurvey.surveyParticipantId) {
      const participant = await this.participantModel.findById(userSurvey.surveyParticipantId).exec();
      if (participant) {
        participantName = participant.participantName; // Subject
        respondentName = participant.respondentName;   // Responder
        participantEmail = participant.respondentEmail;
      }
    } else if (userSurvey.userId) {
      // Try to find user
      try {
        const user = await this.userModel.findById(userSurvey.userId).exec();
        if (user) {
          participantName = user.name || user.email;
          participantEmail = user.email;
        } else {
          participantName = String(userSurvey.userId);
        }
      } catch (e) {
        participantName = String(userSurvey.userId);
      }
    }

    // 2. Get All Responses for this User Survey
    const responses = await this.responseModel.find({
      userSurveyId: new Types.ObjectId(userSurveyId),
      isDeleted: false
    }).exec();

    // 3. Get Survey Structure (Pages & Questions)
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(userSurvey.surveyId), isDeleted: false })
      .sort({ pageIndex: 1 })
      .exec();

    // 4. Generate Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Individual Responses');

    // --- Header Section ---
    worksheet.mergeCells('A1:D1'); // Merged across 4 columns now
    const titleCell = worksheet.getCell('A1');
    titleCell.value = survey.title || 'Survey Responses';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF065F46' } };
    titleCell.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:D2');
    const subTitleCell = worksheet.getCell('A2');
    subTitleCell.value = `Subject: ${participantName} | Responder: ${respondentName} ${participantEmail ? `(${participantEmail})` : ''}`;
    subTitleCell.font = { italic: true, size: 12 };
    subTitleCell.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:D3');
    const dateCell = worksheet.getCell('A3');
    dateCell.value = `Exported on: ${new Date().toLocaleDateString()}`;
    dateCell.alignment = { horizontal: 'center' };

    // --- Table Headers ---
    worksheet.getRow(5).values = ['#', 'Question', 'Response', 'Weight'];
    worksheet.columns = [
      { key: 'index', width: 10 },
      { key: 'question', width: 60 },
      { key: 'response', width: 40 },
      { key: 'weight', width: 15 },
    ];

    const headerRow = worksheet.getRow(5);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // --- Data Rows ---
    let rowIndex = 6;
    let qCounter = 1;

    pages.forEach(page => {
      const pageObj = page.toObject ? page.toObject() : page;
      (pageObj.questions || []).forEach((q: any) => {
        if (q.isDeleted) return;

        // Find response
        const response = responses.find(r => String(r.questionId) === String(q.questionId || q.uniqueOrder) || String(r.questionId) === String(q._id));
        const qType = q.type;

        if (['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(qType)) {
          // --- MATRIX QUESTION HANDLING ---
          // 1. Add Main Question Row
          const mainRow = worksheet.addRow({
            index: qCounter++,
            question: q.text,
            response: '',
            weight: ''
          });
          mainRow.font = { bold: true };
          mainRow.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
          mainRow.getCell(2).alignment = { vertical: 'top', wrapText: true };
          mainRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // Light Gray

          rowIndex++;

          // 2. Add Rows for each Statement
          const rows = q.rows || q.gridRows || [];
          const columns = q.columns || q.gridColumns || [];
          const crypto = require('crypto');

          // Calculate Max Weight for this question
          const maxWeight = Math.max(...columns.map((c: any) => Number(c.weight || 0)));

          // Generate stable questionId for hashing
          let questionIdForRowCol = q.questionId;
          if (!questionIdForRowCol && q.uniqueOrder !== undefined) {
            questionIdForRowCol = crypto.createHash('md5')
              .update(`${pageObj._id?.toString() || ''}-${q.uniqueOrder}-${q.text}-${q.type}`)
              .digest('hex');
          }

          const ansArray = (response && response.response && Array.isArray(response.response)) ? response.response : [];

          rows.forEach((r: any, rIdx: number) => {
            const rText = r.text || r.label || r.statement || `Statement ${rIdx + 1}`;
            const rHash = r.id || crypto.createHash('md5').update(`${questionIdForRowCol}-row-${rIdx}-${rText}`).digest('hex');

            // Find answer for this row
            const answerItem = ansArray.find((item: any) =>
              String(rHash) === String(item.rowId) || String(r.id || r._id) === String(item.rowId)
            );

            let answerText = '-';
            let weightText = '-';

            if (answerItem) {
              // Find Column Text & Weight
              const col = columns.find((c: any, cIdx: number) => {
                const cText = c.text || c.label || c.description || '';
                const cHash = c.id || crypto.createHash('md5').update(`${questionIdForRowCol}-column-${cIdx}-${cText}`).digest('hex');
                return String(cHash) === String(answerItem.columnId) || String(c.id || c._id) === String(answerItem.columnId);
              });

              if (col) {
                answerText = col.text || col.label;
                if (col.weight !== undefined && col.weight !== null && maxWeight > 0) {
                  weightText = `${col.weight}/${maxWeight}`;
                } else if (col.weight !== undefined) {
                  weightText = String(col.weight);
                }
              } else {
                answerText = answerItem.columnId;
              }
            }

            const subRow = worksheet.addRow({
              index: '',
              question: `  • ${rText}`, // Bullet point and indent
              response: answerText,
              weight: weightText
            });

            subRow.getCell(2).alignment = { vertical: 'top', wrapText: true };
            subRow.getCell(3).alignment = { vertical: 'top', wrapText: true };
            subRow.getCell(4).alignment = { vertical: 'top', horizontal: 'center' };

            if (rowIndex % 2 === 0) {
              subRow.eachCell((cell) => cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } });
            }
            rowIndex++;
          });

        } else {
          // --- STANDARD QUESTION HANDLING ---
          let answerText = '-';
          if (response && response.response) {
            const ans = response.response;
            if (Array.isArray(ans)) {
              answerText = ans.join(', ');
            } else if (typeof ans === 'object') {
              answerText = JSON.stringify(ans);
            } else {
              answerText = String(ans);
            }
          }

          const row = worksheet.addRow({
            index: qCounter++,
            question: q.text,
            response: answerText,
            weight: '-'
          });

          // Styling
          row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
          row.getCell(2).alignment = { vertical: 'top', wrapText: true };
          row.getCell(3).alignment = { vertical: 'top', wrapText: true };
          row.getCell(4).alignment = { vertical: 'top', horizontal: 'center' };

          if (rowIndex % 2 === 0) {
            row.eachCell((cell) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
            });
          }
          rowIndex++;
        }
      });
    });

    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tempDir = os.tmpdir();
    const fileName = `individual-${userSurveyId}-${Date.now()}.xlsx`;
    const filePath = path.join(tempDir, fileName);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async exportIndividualResponsesPdf(userSurveyId: string): Promise<string> {
    const PdfPrinter = require('pdfmake');

    // Define fonts
    const fonts = {
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };
    const printer = new PdfPrinter(fonts);

    // 1. Get User Survey & User Info
    const userSurvey = await this.userSurveysService.findOne(userSurveyId);
    if (!userSurvey) throw new NotFoundException('User Survey not found');

    const survey = await this.surveysService.findOne(userSurvey.surveyId.toString());

    let participantName = 'Anonymous';
    let participantEmail = '';
    let respondentName = 'Anonymous Responder';

    // Check for linked participant (360 degree logic)
    if (userSurvey.surveyParticipantId) {
      const participant = await this.participantModel.findById(userSurvey.surveyParticipantId).exec();
      if (participant) {
        participantName = participant.participantName; // Subject
        respondentName = participant.respondentName;   // Responder
        participantEmail = participant.respondentEmail;
      }
    } else if (userSurvey.userId) {
      try {
        const user = await this.userModel.findById(userSurvey.userId).exec();
        if (user) {
          participantName = user.name || user.email;
          participantEmail = user.email;
        } else {
          participantName = String(userSurvey.userId);
        }
      } catch (e) {
        participantName = String(userSurvey.userId);
      }
    }

    // 2. Get All Responses
    const responses = await this.responseModel.find({
      userSurveyId: new Types.ObjectId(userSurveyId),
      isDeleted: false
    }).exec();

    // 3. Get Survey Structure
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(userSurvey.surveyId), isDeleted: false })
      .sort({ pageIndex: 1 })
      .exec();

    // 4. Build PDF Content
    const body: any[] = [];

    // Table Header
    body.push([
      { text: '#', style: 'tableHeader', alignment: 'center' },
      { text: 'Question', style: 'tableHeader', alignment: 'center' },
      { text: 'Response', style: 'tableHeader', alignment: 'center' },
      { text: 'Weight', style: 'tableHeader', alignment: 'center' }
    ]);

    let qCounter = 1;

    pages.forEach(page => {
      const pageObj = page.toObject ? page.toObject() : page;
      (pageObj.questions || []).forEach((q: any) => {
        if (q.isDeleted) return;

        const response = responses.find(r => String(r.questionId) === String(q.questionId || q.uniqueOrder) || String(r.questionId) === String(q._id));
        const qType = q.type;

        if (['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(qType)) {
          // Matrix Question Header Row
          body.push([
            { text: qCounter++, alignment: 'center', bold: true, fillColor: '#f3f4f6' },
            { text: q.text, colSpan: 3, bold: true, fillColor: '#f3f4f6' },
            {}, {}
          ]);

          const rows = q.rows || q.gridRows || [];
          const columns = q.columns || q.gridColumns || [];
          const crypto = require('crypto');
          const maxWeight = Math.max(...columns.map((c: any) => Number(c.weight || 0)));

          let questionIdForRowCol = q.questionId;
          if (!questionIdForRowCol && q.uniqueOrder !== undefined) {
            questionIdForRowCol = crypto.createHash('md5')
              .update(`${pageObj._id?.toString() || ''}-${q.uniqueOrder}-${q.text}-${q.type}`)
              .digest('hex');
          }

          const ansArray = (response && response.response && Array.isArray(response.response)) ? response.response : [];

          rows.forEach((r: any, rIdx: number) => {
            const rText = r.text || r.label || r.statement || `Statement ${rIdx + 1}`;
            const rHash = r.id || crypto.createHash('md5').update(`${questionIdForRowCol}-row-${rIdx}-${rText}`).digest('hex');

            const answerItem = ansArray.find((item: any) =>
              String(rHash) === String(item.rowId) || String(r.id || r._id) === String(item.rowId)
            );

            let answerText = '-';
            let weightText = '-';

            if (answerItem) {
              const col = columns.find((c: any, cIdx: number) => {
                const cText = c.text || c.label || c.description || '';
                const cHash = c.id || crypto.createHash('md5').update(`${questionIdForRowCol}-column-${cIdx}-${cText}`).digest('hex');
                return String(cHash) === String(answerItem.columnId) || String(c.id || c._id) === String(answerItem.columnId);
              });

              if (col) {
                answerText = col.text || col.label;
                if (col.weight !== undefined && col.weight !== null && maxWeight > 0) {
                  weightText = `${col.weight}/${maxWeight}`;
                } else if (col.weight !== undefined) {
                  weightText = String(col.weight);
                }
              } else {
                answerText = answerItem.columnId;
              }
            }

            body.push([
              { text: '', alignment: 'center' },
              { text: `• ${rText}`, margin: [10, 0, 0, 0] }, // Indent
              { text: answerText },
              { text: weightText, alignment: 'center' }
            ]);
          });

        } else {
          // Standard Question
          let answerText = '-';
          if (response && response.response) {
            const ans = response.response;
            if (Array.isArray(ans)) {
              answerText = ans.join(', ');
            } else if (typeof ans === 'object') {
              answerText = JSON.stringify(ans);
            } else {
              answerText = String(ans);
            }
          }

          body.push([
            { text: qCounter++, alignment: 'center' },
            { text: q.text },
            { text: answerText },
            { text: '-', alignment: 'center' }
          ]);
        }
      });
    });

    const docDefinition = {
      content: [
        { text: survey.title || 'Survey Responses', style: 'header' },
        { text: `Subject: ${participantName}`, style: 'subheader' },
        { text: `Responder: ${respondentName} ${participantEmail ? `(${participantEmail})` : ''}`, style: 'subheader' },
        { text: `Exported on: ${new Date().toLocaleDateString()}`, style: 'small', margin: [0, 0, 0, 20] },
        {
          table: {
            headerRows: 1,
            widths: [30, '*', 150, 60],
            body: body
          },
          layout: 'lightHorizontalLines' // or 'noBorders', 'headerLineOnly', etc.
        }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          alignment: 'center',
          margin: [0, 0, 0, 5],
          color: '#065F46'
        },
        subheader: {
          fontSize: 12,
          italics: true,
          alignment: 'center',
          margin: [0, 0, 0, 5]
        },
        small: {
          fontSize: 10,
          alignment: 'center',
          color: 'gray'
        },
        tableHeader: {
          bold: true,
          fontSize: 12,
          color: 'white',
          fillColor: '#10B981',
          margin: [0, 5, 0, 5]
        }
      },
      defaultStyle: {
        fontSize: 10
      }
    };

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tempDir = os.tmpdir();
    const fileName = `individual-${userSurveyId}-${Date.now()}.pdf`;
    const filePath = path.join(tempDir, fileName);

    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const stream = fs.createWriteStream(filePath);
      pdfDoc.pipe(stream);
      pdfDoc.end();
      stream.on('finish', () => resolve(filePath));
      stream.on('error', (err: any) => reject(err));
    });
  }

  async exportParticipantResponses(surveyId: string, participantEmail: string): Promise<string> {
    const ExcelJS = require('exceljs');
    const crypto = require('crypto');
    const survey = await this.surveysService.findOne(surveyId);
    if (!survey) throw new NotFoundException('Survey not found');

    // 1. Fetch all Assignments and UserSurveys for the survey
    const [allAssignments, allUserSurveys] = await Promise.all([
      this.participantModel.find({ surveyId: new Types.ObjectId(surveyId) }).exec(),
      this.userSurveyModel.find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false }).populate('surveyParticipantId').exec()
    ]);

    // 2. Fetch Users for email resolution
    const userIds = allUserSurveys
      .map(us => us.userId)
      .filter(uid => uid && Types.ObjectId.isValid(uid));

    const users = await this.userModel.find({ _id: { $in: userIds } }).exec();
    const userMap = new Map<string, string>();
    users.forEach(u => userMap.set(String(u._id), u.email));

    // 3. Link Responses to Assignments (Match UI Logic)
    const targetResponses: any[] = [];

    allUserSurveys.forEach(us => {
      let assignment: any = us.surveyParticipantId;

      if (!assignment) {
        // Fallback: Find first matching assignment based on respondent email
        const uid = String(us.userId);
        const userEmail = userMap.get(uid) || uid;

        assignment = allAssignments.find(a =>
          (a.respondentEmail || '').toLowerCase() === userEmail.toLowerCase()
        );
      }

      // 4. Filter: Keep only if linked to our Target Participant
      if (assignment && assignment.participantEmail && assignment.participantEmail.toLowerCase() === participantEmail.toLowerCase()) {
        targetResponses.push(us);
      }
    });

    // 5. Fetch Answers for the filtered responses
    const responseIds = targetResponses.map(r => r._id);
    const allAnswers = await this.responseModel.find({
      userSurveyId: { $in: responseIds },
      isDeleted: false
    }).exec();
    // 5. Get Survey Structure (Questions)
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false })
      .sort({ pageIndex: 1 })
      .exec();

    const questions: any[] = [];
    pages.forEach(page => {
      const pageObj = page.toObject ? page.toObject() : page;
      (pageObj.questions || []).forEach((q: any) => {
        if (!q.isDeleted) {
          questions.push({ ...q, pageId: pageObj._id });
        }
      });
    });

    // 6. Generate Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Summary');
    const surveyTitle = survey.title || 'Survey Results';

    // --- Survey Title (Top of Sheet) ---
    worksheet.mergeCells('A1:E1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${surveyTitle} - ${participantEmail}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF065F46' } }; // Dark Green
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light Green
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    let currentRow = 3; // Start after title

    // --- Iterate Questions ---
    questions.forEach((question: any) => {
      const qType = question.type;
      const summaryData: any[] = [];
      let summaryColumns: any[] = [];

      // Filter answers for this question
      // We need to match by questionId OR uniqueOrder OR hash (similar to exportQuestionResponses logic)
      // For simplicity here, we assume questionId or uniqueOrder match. 
      // If hashes are needed, we'd replicate the hash generation logic.
      // Let's stick to direct ID matching first as it covers most cases.
      const questionAnswers = allAnswers.filter(a =>
        String(a.questionId) === String(question.questionId || question.uniqueOrder) ||
        String(a.questionId) === String(question._id)
      );

      // --- MATRIX QUESTIONS ---
      if (['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(qType)) {
        const rowMap = new Map<string, string>();
        const colMap = new Map<string, string>();
        const colWeightMap = new Map<string, number>();

        const rows = question.rows || question.gridRows || [];
        const columns = question.columns || question.gridColumns || [];

        if (rows) {
          rows.forEach((row: any, idx: number) => {
            const rowText = row.text || row.label || `Statement ${idx + 1}`;
            const rowId = row.id || crypto.createHash('md5').update(`${question.questionId}-row-${idx}-${rowText}`).digest('hex');
            rowMap.set(rowId, rowText);
          });
        }
        if (columns) {
          columns.forEach((col: any, idx: number) => {
            const colText = col.text || col.label || `Option ${idx + 1}`;
            const colId = col.id || crypto.createHash('md5').update(`${question.questionId}-column-${idx}-${colText}`).digest('hex');
            colMap.set(colId, colText);
            if (col.weight !== undefined) colWeightMap.set(colId, Number(col.weight));
          });
        }

        if (rows && columns) {
          const matrixCounts: Record<string, Record<string, number>> = {};
          rows.forEach((row: any) => {
            const rowText = rowMap.get(row.id) || row.text;
            matrixCounts[rowText] = {};
            columns.forEach((col: any) => {
              const colText = colMap.get(col.id) || col.text;
              matrixCounts[rowText][colText] = 0;
            });
          });

          questionAnswers.forEach(r => {
            const answers = Array.isArray(r.response) ? r.response : [r.response];
            answers.forEach((ans: any) => {
              if (typeof ans === 'object' && ans !== null) {
                const rowText = rowMap.get(ans.rowId) || ans.rowId;
                const colText = colMap.get(ans.columnId) || ans.columnId;
                if (matrixCounts[rowText] && matrixCounts[rowText][colText] !== undefined) {
                  matrixCounts[rowText][colText]++;
                }
              }
            });
          });

          Object.entries(matrixCounts).forEach(([statement, counts]) => {
            const rowObj: any = { 'Statement': statement };
            let totalScore = 0;
            let responseCount = 0;

            Object.entries(counts).forEach(([option, count]) => {
              const col = columns.find((c: any) => (colMap.get(c.id) || c.text) === option);
              const key = col && col.weight !== undefined ? `${option} (${col.weight})` : option;
              rowObj[key] = count;

              if (col && col.weight !== undefined) {
                totalScore += count * Number(col.weight);
                responseCount += count;
              }
            });

            const maxWeight = Math.max(...columns.map((c: any) => Number(c.weight || 0)));
            if (maxWeight > 0) {
              rowObj['Total Score'] = `${totalScore}/${responseCount * maxWeight}`;
            }
            summaryData.push(rowObj);
          });

          if (summaryData.length > 0) {
            summaryColumns = Object.keys(summaryData[0]).map(key => ({
              header: key,
              key: key,
              width: key === 'Statement' ? 50 : 15,
            }));
          }
        }
      }
      // --- CHOICE QUESTIONS ---
      else if (['radio', 'checkbox', 'dropdown', 'RADIO_BOX', 'CHECK_BOX', 'DROPDOWN'].includes(qType)) {
        const counts: Record<string, number> = {};
        let totalResponses = 0;

        questionAnswers.forEach(r => {
          const answers = Array.isArray(r.response) ? r.response : [r.response];
          answers.forEach((ans: any) => {
            if (ans) {
              const text = String(ans);
              counts[text] = (counts[text] || 0) + 1;
              totalResponses++;
            }
          });
        });

        Object.entries(counts).forEach(([option, count]) => {
          summaryData.push({
            'Option': option,
            'Count': count,
            'Percentage': totalResponses > 0 ? `${((count / totalResponses) * 100).toFixed(1)}%` : '0%'
          });
        });

        summaryColumns = [
          { header: 'Option', key: 'Option', width: 40 },
          { header: 'Count', key: 'Count', width: 15 },
          { header: 'Percentage', key: 'Percentage', width: 15 },
        ];
      }
      // --- TEXT QUESTIONS ---
      else {
        questionAnswers.forEach(r => {
          const answers = Array.isArray(r.response) ? r.response : [r.response];
          answers.forEach((ans: any) => {
            if (ans) {
              summaryData.push({ 'Response': String(ans) });
            }
          });
        });

        summaryColumns = [
          { header: 'Response', key: 'Response', width: 100 }
        ];
      }

      // --- RENDER TABLE FOR THIS QUESTION ---

      // 1. Question Header
      const colCount = summaryColumns.length > 0 ? summaryColumns.length : 2;
      const lastColLetter = String.fromCharCode(64 + colCount); // Simple A-Z, might break for >26 cols but sufficient for now

      // Merge cells for Question Text
      // Calculate merge range manually or just use first few columns
      // For safety with unknown col count, let's just merge A to E (default) or dynamic
      // ExcelJS mergeCells takes 'A1:B1' format

      // Question Text Row
      const qRow = worksheet.getRow(currentRow);
      // Merge based on summaryColumns length, min 5
      const mergeEndCol = Math.max(summaryColumns.length, 5);
      // Convert col index to letter (1=A, 26=Z, 27=AA...)
      // Simple helper for column letter
      const getColLetter = (n: number) => {
        let s = "";
        while (n >= 0) {
          s = String.fromCharCode(n % 26 + 65) + s;
          n = Math.floor(n / 26) - 1;
        }
        return s;
      };
      // ExcelJS uses 1-based index for columns
      const endLetter = getColLetter(mergeEndCol - 1);

      worksheet.mergeCells(`A${currentRow}:${endLetter}${currentRow}`);
      const qCell = qRow.getCell(1);
      qCell.value = question.text;
      qCell.font = { italic: true, color: { argb: 'FF4B5563' }, size: 12 }; // Gray
      qCell.alignment = { vertical: 'middle', horizontal: 'left' };
      qRow.height = 25;
      currentRow++;

      if (summaryData.length > 0) {
        // Table Headers
        const headerRow = worksheet.getRow(currentRow);
        headerRow.values = summaryColumns.map(c => c.header);

        // Apply Header Style
        for (let i = 1; i <= summaryColumns.length; i++) {
          const cell = headerRow.getCell(i);
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } }; // Green
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          // Set width
          worksheet.getColumn(i).width = summaryColumns[i - 1].width;
        }
        headerRow.height = 25;
        currentRow++;

        // Data Rows
        summaryData.forEach(data => {
          const row = worksheet.getRow(currentRow);
          // Map data object to array based on columns
          const rowValues: any[] = [];
          summaryColumns.forEach(c => {
            rowValues.push(data[c.key]);
          });
          row.values = rowValues;

          // Styling Data Cells
          row.eachCell((cell, colNumber) => {
            if (colNumber === 1) {
              cell.font = { bold: true };
              cell.alignment = { wrapText: true, vertical: 'middle' };
            } else {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
              // Matrix Bubble Logic
              const headerKey = summaryColumns[colNumber - 1].key;
              if (headerKey !== 'Total Score' && headerKey !== 'Percentage') {
                if (typeof cell.value === 'number' && cell.value > 0) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light Green
                  cell.font = { color: { argb: 'FF065F46' }, bold: true }; // Dark Green
                } else if (typeof cell.value === 'number' && cell.value === 0) {
                  cell.value = '-';
                }
              }
            }
          });
          currentRow++;
        });
      } else {
        // No responses for this question
        const noRespRow = worksheet.getRow(currentRow);
        noRespRow.getCell(1).value = "No responses";
        noRespRow.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } };
        currentRow++;
      }

      // Add spacing between questions
      currentRow += 2;
    });

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tempDir = os.tmpdir();
    const fileName = `participant-${participantEmail}-${Date.now()}.xlsx`;
    const filePath = path.join(tempDir, fileName);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async exportParticipantResponsesPdf(surveyId: string, participantEmail: string): Promise<string> {
    const PdfPrinter = require('pdfmake');
    const crypto = require('crypto');
    const fonts = {
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };
    const printer = new PdfPrinter(fonts);

    const survey = await this.surveysService.findOne(surveyId);
    if (!survey) throw new NotFoundException('Survey not found');

    // --- 1. Data Linking (Same as Excel) ---
    const [allAssignments, allUserSurveys] = await Promise.all([
      this.participantModel.find({ surveyId: new Types.ObjectId(surveyId) }).exec(),
      this.userSurveyModel.find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false }).populate('surveyParticipantId').exec()
    ]);

    const userIds = allUserSurveys
      .map(us => us.userId)
      .filter(uid => uid && Types.ObjectId.isValid(uid));

    const users = await this.userModel.find({ _id: { $in: userIds } }).exec();
    const userMap = new Map<string, string>();
    users.forEach(u => userMap.set(String(u._id), u.email));

    const targetResponses: any[] = [];

    allUserSurveys.forEach(us => {
      let assignment: any = us.surveyParticipantId;

      if (!assignment) {
        const uid = String(us.userId);
        const userEmail = userMap.get(uid) || uid;

        assignment = allAssignments.find(a =>
          (a.respondentEmail || '').toLowerCase() === userEmail.toLowerCase()
        );
      }

      if (assignment && assignment.participantEmail && assignment.participantEmail.toLowerCase() === participantEmail.toLowerCase()) {
        targetResponses.push(us);
      }
    });

    const responseIds = targetResponses.map(r => r._id);
    const allAnswers = await this.responseModel.find({
      userSurveyId: { $in: responseIds },
      isDeleted: false
    }).exec();

    // --- 2. Survey Structure ---
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false })
      .sort({ pageIndex: 1 })
      .exec();

    const questions: any[] = [];
    pages.forEach(page => {
      const pageObj = page.toObject ? page.toObject() : page;
      (pageObj.questions || []).forEach((q: any) => {
        if (!q.isDeleted) {
          questions.push({ ...q, pageId: pageObj._id });
        }
      });
    });

    // --- 3. Generate PDF Content ---
    const content: any[] = [
      { text: `Subject: ${participantEmail}`, style: 'header' },
      { text: survey.title || 'Survey Results', style: 'subheader' },
      { text: '\n' }
    ];

    questions.forEach((question: any, index: number) => {
      const qType = question.type;
      content.push({ text: `${index + 1}. ${question.text}`, style: 'questionHeader' });

      const questionAnswers = allAnswers.filter(a =>
        String(a.questionId) === String(question.questionId || question.uniqueOrder) ||
        String(a.questionId) === String(question._id)
      );

      let summaryData: any[] = [];
      let summaryColumns: any[] = [];

      // --- MATRIX QUESTIONS ---
      if (['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(qType)) {
        const rowMap = new Map<string, string>();
        const colMap = new Map<string, string>();
        const colWeightMap = new Map<string, number>();

        const rows = question.rows || question.gridRows || [];
        const columns = question.columns || question.gridColumns || [];

        if (rows) {
          rows.forEach((row: any, idx: number) => {
            const rowText = row.text || row.label || `Statement ${idx + 1}`;
            const rowId = row.id || crypto.createHash('md5').update(`${question.questionId}-row-${idx}-${rowText}`).digest('hex');
            rowMap.set(rowId, rowText);
          });
        }
        if (columns) {
          columns.forEach((col: any, idx: number) => {
            const colText = col.text || col.label || `Option ${idx + 1}`;
            const colId = col.id || crypto.createHash('md5').update(`${question.questionId}-column-${idx}-${colText}`).digest('hex');
            colMap.set(colId, colText);
            if (col.weight !== undefined) colWeightMap.set(colId, Number(col.weight));
          });
        }

        if (rows && columns) {
          const matrixCounts: Record<string, Record<string, number>> = {};
          rows.forEach((row: any) => {
            const rowText = rowMap.get(row.id) || row.text;
            matrixCounts[rowText] = {};
            columns.forEach((col: any) => {
              const colText = colMap.get(col.id) || col.text;
              matrixCounts[rowText][colText] = 0;
            });
          });

          questionAnswers.forEach(r => {
            const answers = Array.isArray(r.response) ? r.response : [r.response];
            answers.forEach((ans: any) => {
              if (typeof ans === 'object' && ans !== null) {
                const rowText = rowMap.get(ans.rowId) || ans.rowId;
                const colText = colMap.get(ans.columnId) || ans.columnId;
                if (matrixCounts[rowText] && matrixCounts[rowText][colText] !== undefined) {
                  matrixCounts[rowText][colText]++;
                }
              }
            });
          });

          Object.entries(matrixCounts).forEach(([statement, counts]) => {
            const rowObj: any = { 'Statement': statement };
            let totalScore = 0;
            let responseCount = 0;

            Object.entries(counts).forEach(([option, count]) => {
              const col = columns.find((c: any) => (colMap.get(c.id) || c.text) === option);
              const key = col && col.weight !== undefined ? `${option} (${col.weight})` : option;
              rowObj[key] = count;

              if (col && col.weight !== undefined) {
                totalScore += count * Number(col.weight);
                responseCount += count;
              }
            });

            const maxWeight = Math.max(...columns.map((c: any) => Number(c.weight || 0)));
            if (maxWeight > 0) {
              rowObj['Total Score'] = `${totalScore}/${responseCount * maxWeight}`;
            }
            summaryData.push(rowObj);
          });

          if (summaryData.length > 0) {
            summaryColumns = Object.keys(summaryData[0]).map(key => ({
              header: key,
              key: key
            }));
          }
        }
      }
      // --- CHOICE QUESTIONS ---
      else if (['radio', 'checkbox', 'dropdown', 'RADIO_BOX', 'CHECK_BOX', 'DROPDOWN'].includes(qType)) {
        const counts: Record<string, number> = {};
        let totalResponses = 0;

        questionAnswers.forEach(r => {
          const answers = Array.isArray(r.response) ? r.response : [r.response];
          answers.forEach((ans: any) => {
            if (ans) {
              const text = String(ans);
              counts[text] = (counts[text] || 0) + 1;
              totalResponses++;
            }
          });
        });

        Object.entries(counts).forEach(([option, count]) => {
          summaryData.push({
            'Option': option,
            'Count': count,
            'Percentage': totalResponses > 0 ? `${((count / totalResponses) * 100).toFixed(1)}%` : '0%'
          });
        });

        summaryColumns = [
          { header: 'Option', key: 'Option' },
          { header: 'Count', key: 'Count' },
          { header: 'Percentage', key: 'Percentage' },
        ];
      }
      // --- TEXT QUESTIONS ---
      else {
        questionAnswers.forEach(r => {
          const answers = Array.isArray(r.response) ? r.response : [r.response];
          answers.forEach((ans: any) => {
            if (ans) {
              summaryData.push({ 'Response': String(ans) });
            }
          });
        });
        summaryColumns = [{ header: 'Response', key: 'Response' }];
      }

      // --- RENDER PDF TABLE ---
      if (summaryData.length > 0) {
        const tableBody: any[] = [];

        // Header Row
        tableBody.push(summaryColumns.map(c => ({ text: c.header, style: 'tableHeader' })));

        // Data Rows
        summaryData.forEach(row => {
          const rowValues = summaryColumns.map(c => {
            const val = row[c.key];
            return val !== undefined ? String(val) : '-';
          });
          tableBody.push(rowValues);
        });

        // Widths: First col '*', others 'auto'
        const widths = summaryColumns.map((_, i) => i === 0 ? '*' : 'auto');

        content.push({
          table: {
            headerRows: 1,
            widths: widths,
            body: tableBody
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 15]
        });
      } else {
        content.push({ text: 'No responses', italics: true, color: 'gray', margin: [0, 0, 0, 15] });
      }
    });

    const docDefinition = {
      content: content,
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 5] },
        subheader: { fontSize: 14, italics: true, margin: [0, 0, 0, 10] },
        questionHeader: { fontSize: 12, bold: true, margin: [0, 10, 0, 5], color: '#065F46' },
        tableHeader: { bold: true, fontSize: 10, color: 'black', fillColor: '#f3f4f6' }
      },
      defaultStyle: { fontSize: 10 }
    };

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tempDir = os.tmpdir();
    const fileName = `participant-${participantEmail}-${Date.now()}.pdf`;
    const filePath = path.join(tempDir, fileName);

    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const stream = fs.createWriteStream(filePath);
      pdfDoc.pipe(stream);
      pdfDoc.end();
      stream.on('finish', () => resolve(filePath));
      stream.on('error', (err: any) => reject(err));
    });
  }
  async exportQuestionResponsesPdf(surveyId: string, questionId: string): Promise<string> {
    const PdfPrinter = require('pdfmake');
    const crypto = require('crypto');
    const fonts = {
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };
    const printer = new PdfPrinter(fonts);

    const survey = await this.surveysService.findOne(surveyId);
    if (!survey) throw new NotFoundException('Survey not found');

    // 1. Find Question
    const pages = await this.surveyPageModel
      .find({ surveyId: new Types.ObjectId(surveyId), isDeleted: false })
      .exec();

    let targetQuestion: any = null;
    for (const page of pages) {
      const pageObj = page.toObject ? page.toObject() : page;
      const found = (pageObj.questions || []).find((q: any) =>
        String(q.questionId) === questionId || String(q._id) === questionId
      );
      if (found) {
        targetQuestion = found;
        break;
      }
    }

    if (!targetQuestion) throw new NotFoundException('Question not found');

    // 2. Fetch Responses
    const allUserSurveys = await this.userSurveyModel.find({
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false
    }).exec();

    const responseIds = allUserSurveys.map(r => r._id);
    const allAnswers = await this.responseModel.find({
      userSurveyId: { $in: responseIds },
      isDeleted: false,
      $or: [
        { questionId: targetQuestion.questionId },
        { questionId: targetQuestion._id },
        { questionId: targetQuestion.uniqueOrder }
      ]
    }).exec();

    // 3. Generate PDF Content
    const content: any[] = [
      { text: survey.title || 'Survey Results', style: 'header' },
      { text: `Question Analysis: ${targetQuestion.text}`, style: 'subheader' },
      { text: '\n' }
    ];

    const qType = targetQuestion.type;
    let summaryData: any[] = [];
    let summaryColumns: any[] = [];

    // --- MATRIX QUESTIONS ---
    if (['matrix_radio', 'matrix_checkbox', 'MATRIX_RADIO_BOX', 'MATRIX_CHECK_BOX'].includes(qType)) {
      const rowMap = new Map<string, string>();
      const colMap = new Map<string, string>();
      const colWeightMap = new Map<string, number>();

      const rows = targetQuestion.rows || targetQuestion.gridRows || [];
      const columns = targetQuestion.columns || targetQuestion.gridColumns || [];

      if (rows) {
        rows.forEach((row: any, idx: number) => {
          const rowText = row.text || row.label || `Statement ${idx + 1}`;
          const rowId = row.id || crypto.createHash('md5').update(`${targetQuestion.questionId}-row-${idx}-${rowText}`).digest('hex');
          rowMap.set(rowId, rowText);
        });
      }
      if (columns) {
        columns.forEach((col: any, idx: number) => {
          const colText = col.text || col.label || `Option ${idx + 1}`;
          const colId = col.id || crypto.createHash('md5').update(`${targetQuestion.questionId}-column-${idx}-${colText}`).digest('hex');
          colMap.set(colId, colText);
          if (col.weight !== undefined) colWeightMap.set(colId, Number(col.weight));
        });
      }

      if (rows && columns) {
        const matrixCounts: Record<string, Record<string, number>> = {};
        rows.forEach((row: any) => {
          const rowText = rowMap.get(row.id) || row.text;
          matrixCounts[rowText] = {};
          columns.forEach((col: any) => {
            const colText = colMap.get(col.id) || col.text;
            matrixCounts[rowText][colText] = 0;
          });
        });

        allAnswers.forEach(r => {
          const answers = Array.isArray(r.response) ? r.response : [r.response];
          answers.forEach((ans: any) => {
            if (typeof ans === 'object' && ans !== null) {
              const rowText = rowMap.get(ans.rowId) || ans.rowId;
              const colText = colMap.get(ans.columnId) || ans.columnId;
              if (matrixCounts[rowText] && matrixCounts[rowText][colText] !== undefined) {
                matrixCounts[rowText][colText]++;
              }
            }
          });
        });

        Object.entries(matrixCounts).forEach(([statement, counts]) => {
          const rowObj: any = { 'Statement': statement };
          let totalScore = 0;
          let responseCount = 0;

          Object.entries(counts).forEach(([option, count]) => {
            const col = columns.find((c: any) => (colMap.get(c.id) || c.text) === option);
            const key = col && col.weight !== undefined ? `${option} (${col.weight})` : option;
            rowObj[key] = count;

            if (col && col.weight !== undefined) {
              totalScore += count * Number(col.weight);
              responseCount += count;
            }
          });

          const maxWeight = Math.max(...columns.map((c: any) => Number(c.weight || 0)));
          if (maxWeight > 0) {
            rowObj['Total Score'] = `${totalScore}/${responseCount * maxWeight}`;
          }
          summaryData.push(rowObj);
        });

        if (summaryData.length > 0) {
          summaryColumns = Object.keys(summaryData[0]).map(key => ({
            header: key,
            key: key
          }));
        }
      }
    }
    // --- CHOICE QUESTIONS ---
    else if (['radio', 'checkbox', 'dropdown', 'RADIO_BOX', 'CHECK_BOX', 'DROPDOWN'].includes(qType)) {
      const counts: Record<string, number> = {};
      let totalResponses = 0;

      allAnswers.forEach(r => {
        const answers = Array.isArray(r.response) ? r.response : [r.response];
        answers.forEach((ans: any) => {
          if (ans) {
            const text = String(ans);
            counts[text] = (counts[text] || 0) + 1;
            totalResponses++;
          }
        });
      });

      Object.entries(counts).forEach(([option, count]) => {
        summaryData.push({
          'Option': option,
          'Count': count,
          'Percentage': totalResponses > 0 ? `${((count / totalResponses) * 100).toFixed(1)}%` : '0%'
        });
      });

      summaryColumns = [
        { header: 'Option', key: 'Option' },
        { header: 'Count', key: 'Count' },
        { header: 'Percentage', key: 'Percentage' },
      ];
    }
    // --- TEXT QUESTIONS ---
    else {
      allAnswers.forEach(r => {
        const answers = Array.isArray(r.response) ? r.response : [r.response];
        answers.forEach((ans: any) => {
          if (ans) {
            summaryData.push({ 'Response': String(ans) });
          }
        });
      });
      summaryColumns = [{ header: 'Response', key: 'Response' }];
    }

    // --- RENDER PDF TABLE ---
    if (summaryData.length > 0) {
      const tableBody: any[] = [];

      // Header Row
      tableBody.push(summaryColumns.map(c => ({ text: c.header, style: 'tableHeader' })));

      // Data Rows
      summaryData.forEach(row => {
        const rowValues = summaryColumns.map(c => {
          const val = row[c.key];
          return val !== undefined ? String(val) : '-';
        });
        tableBody.push(rowValues);
      });

      // Widths: First col '*', others 'auto'
      const widths = summaryColumns.map((_, i) => i === 0 ? '*' : 'auto');

      content.push({
        table: {
          headerRows: 1,
          widths: widths,
          body: tableBody
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 15]
      });
    } else {
      content.push({ text: 'No responses', italics: true, color: 'gray', margin: [0, 0, 0, 15] });
    }

    const docDefinition = {
      content: content,
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 5] },
        subheader: { fontSize: 14, italics: true, margin: [0, 0, 0, 10] },
        tableHeader: { bold: true, fontSize: 10, color: 'black', fillColor: '#f3f4f6' }
      },
      defaultStyle: { fontSize: 10 }
    };

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tempDir = os.tmpdir();
    const fileName = `question-${questionId}-${Date.now()}.pdf`;
    const filePath = path.join(tempDir, fileName);

    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const stream = fs.createWriteStream(filePath);
      pdfDoc.pipe(stream);
      pdfDoc.end();
      stream.on('finish', () => resolve(filePath));
      stream.on('error', (err: any) => reject(err));
    });
  }
}

