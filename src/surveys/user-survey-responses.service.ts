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

    return userSurveys.map(us => {
      const usWithTimestamps = us as any; // Mongoose timestamps are available at runtime
      const progress = us.totalQuestions > 0
        ? Math.round((us.answeredQuestions / us.totalQuestions) * 100)
        : 0;

      return {
        _id: us._id,
        id: us._id,
        participantName: us.userId || 'Anonymous', // UserSurvey uses userId field
        email: us.userId || '', // userId can be email for participant-based surveys
        status: us.status,
        progress: progress,
        updatedAt: usWithTimestamps.updatedAt,
        createdAt: usWithTimestamps.createdAt,
        userSurveyId: us._id
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
        if (targetQuestion.rows) {
          targetQuestion.rows.forEach((row: any, idx: number) => {
            const rowText = row.text || row.label || `Statement ${idx + 1}`;
            const rowId = row.id || crypto.createHash('md5').update(`${questionIdForRowCol}-row-${idx}-${rowText}`).digest('hex');
            rowMap.set(rowId, rowText);
          });
        }
        if (targetQuestion.columns) {
          targetQuestion.columns.forEach((col: any, idx: number) => {
            const colText = col.text || col.label || `Option ${idx + 1}`;
            const colId = col.id || crypto.createHash('md5').update(`${questionIdForRowCol}-column-${idx}-${colText}`).digest('hex');
            colMap.set(colId, colText);
            if (col.weight !== undefined) colWeightMap.set(colId, Number(col.weight));
          });
        }

        // Calculate Counts
        if (targetQuestion.rows && targetQuestion.columns) {
          const matrixCounts: Record<string, Record<string, number>> = {};
          targetQuestion.rows.forEach((row: any) => {
            const rowText = rowMap.get(row.id) || row.text;
            matrixCounts[rowText] = {};
            targetQuestion.columns.forEach((col: any) => {
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
              const col = targetQuestion.columns.find((c: any) => (colMap.get(c.id) || c.text) === option);
              // Key for data object
              const key = col && col.weight !== undefined ? `${option} (${col.weight})` : option;
              rowObj[key] = count;

              if (col && col.weight !== undefined) {
                totalScore += count * Number(col.weight);
                responseCount += count;
              }
            });

            const maxWeight = Math.max(...targetQuestion.columns.map((c: any) => Number(c.weight || 0)));
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
                'Date': r.answeredAt ? new Date(r.answeredAt).toISOString().split('T')[0] : ''
              });
            }
          });
        });

        summaryColumns = [
          { header: 'Response', key: 'Response', width: 60 },
          { header: 'Date', key: 'Date', width: 15 },
        ];
      }
    }

    // --- GENERATE SUMMARY SHEET ---
    if (summaryData.length > 0) {
      const worksheet = workbook.addWorksheet('Summary');

      // 1. Survey Name Header (Row 1)
      worksheet.mergeCells('A1', `${String.fromCharCode(64 + summaryColumns.length)}1`); // A1 to LastCol1
      const titleCell = worksheet.getCell('A1');
      titleCell.value = surveyTitle;
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF065F46' } }; // Dark Green
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light Green
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 30;

      // 2. Question Text (Row 2)
      worksheet.mergeCells('A2', `${String.fromCharCode(64 + summaryColumns.length)}2`);
      const qCell = worksheet.getCell('A2');
      qCell.value = targetQuestion?.text || 'Question Analysis';
      qCell.font = { italic: true, color: { argb: 'FF4B5563' } }; // Gray
      qCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(2).height = 25;

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
}
