import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyPageCollection } from './schemas/survey-page-collection.schema';
import { Survey } from './schemas/survey.schema';
import { SurveyPagesService } from './survey-pages.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import * as crypto from 'crypto';

// Simple UUID-like generator
function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}

@Injectable()
export class SurveyQuestionsService {
  constructor(
    @InjectModel(SurveyPageCollection.name)
    private surveyPageModel: Model<SurveyPageCollection>,
    @InjectModel(Survey.name) private surveyModel: Model<Survey>,
    private surveyPagesService: SurveyPagesService,
  ) {}

  async createQuestion(
    surveyId: string,
    pageId: string,
    questionDto: CreateQuestionDto,
  ): Promise<any> {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);

    // Generate questionId
    const questionId = generateId();

    // Prepare question data based on type
    const questionData: any = {
      questionId,
      text: questionDto.text,
      type: questionDto.type,
      uniqueOrder: questionDto.uniqueOrder || this.getNextUniqueOrder(page.questions),
      validationEnabled: questionDto.validationEnabled || false,
      mandatoryEnabled: questionDto.mandatoryEnabled || false,
      mandatoryMsg: questionDto.mandatoryMsg,
      hintEnabled: questionDto.hintEnabled || false,
      hintMsg: questionDto.hintMsg,
      randomEnabled: questionDto.randomEnabled || false,
      randomizationType: questionDto.randomizationType,
      randomizeType: questionDto.randomizeType,
      noneOptionEnabled: questionDto.noneOptionEnabled || false,
      otherOptionEnabled: questionDto.otherOptionEnabled || false,
      otherOptionMsg: questionDto.otherOptionMsg,
      commentEnabled: questionDto.commentEnabled || false,
      commentMsg: questionDto.commentMsg,
      notApplicableEnabled: questionDto.notApplicableEnabled || false,
      notApplicableMsg: questionDto.notApplicableMsg,
      scoreEnabled: questionDto.scoreEnabled || false,
      answerWidth: questionDto.answerWidth || (questionDto.width ? questionDto.width.toString() : undefined),
      initialMsg: questionDto.initialMsg,
      weightageEnabled: questionDto.weightageEnabled || false,
      showWeightage: questionDto.showWeightage || false,
      displayFormat: questionDto.displayFormat,
      isDeleted: false,
    };

    // Handle options for choice-based questions
    if (questionDto.options && questionDto.options.length > 0) {
      questionData.options = questionDto.options.map((opt, index) => ({
        text: opt.text,
        seqNo: opt.seqNo || index + 1,
        uniqueOrder: opt.uniqueOrder || this.getNextUniqueOrderForOptions(page.questions, index),
        value: opt.value || (opt.seqNo ? opt.seqNo.toString() : (index + 1).toString()),
        weight: typeof opt.weight === 'number' ? opt.weight : undefined,
        mandatoryEnabled: opt.mandatoryEnabled || false,
        preSelected: opt.preSelected || false,
        type: opt.type,
        imageUrl: opt.imageUrl,
        score: opt.score,
        isDeleted: false,
      }));
    }

    // Handle validation
    const validation = questionDto.validation || questionDto.validations;
    if (validation) {
      questionData.validation = {
        maxvalue: validation.maxvalue,
        type: validation.type,
        minvalue: validation.minvalue,
        minlength: validation.minlength,
        maxlength: validation.maxlength,
        format: validation.format,
        scaleFrom: validation.scaleFrom,
        scaleTo: validation.scaleTo,
        startLabel: validation.startLabel,
        endLabel: validation.endLabel,
      };
      questionData.validationEnabled = true;
    }

    // Handle grid rows and columns
    const rows = questionDto.row || questionDto.gridRows;
    const columns = questionDto.columns || questionDto.gridColumns;

    if (rows && rows.length > 0) {
      questionData.gridRows = rows.map((row, index) => ({
        text: row.text,
        uniqueOrder: row.uniqueOrder || index.toString(),
        columnsId: [],
        score: [],
        columns: [],
      }));
    }

    if (columns && columns.length > 0) {
      // For MATRIX types, columns are at question level
      if (questionDto.type === 'MATRIX_CHECK_BOX' || questionDto.type === 'MATRIX_RADIO_BOX') {
        questionData.columns = columns.map((col, index) => ({
          text: col.text,
          uniqueOrder: col.uniqueOrder || index.toString(),
          mandatoryEnabled: col.mandatoryEnabled || false,
        }));

        // Link columns to rows
        if (questionData.gridRows) {
          questionData.gridRows = questionData.gridRows.map((row: any, rowIndex: number) => {
            const rowData = rows?.[rowIndex];
            return {
              ...row,
              columnsId: questionData.columns.map((c: any, i: number) => generateId()),
              score: rowData?.score || [],
              columns: questionData.columns.map((col: any) => ({
                text: col.text,
                uniqueOrder: col.uniqueOrder,
                mandatoryEnabled: col.mandatoryEnabled || false,
                questionId: null,
                rowId: null,
              })),
            };
          });
        }
      } else {
        // For other grid types, columns are nested in rows
        questionData.gridColumns = columns.map((col, index) => ({
          text: col.text,
          uniqueOrder: col.uniqueOrder || index.toString(),
          mandatoryEnabled: col.mandatoryEnabled || false,
          rowId: col.rowId,
          questionId: col.questionId,
          question: col.question,
        }));
      }
    }

    // Handle MATRIX-specific fields
    if (questionDto.type === 'MATRIX_CHECK_BOX' || questionDto.type === 'MATRIX_RADIO_BOX') {
      questionData.columnRandomEnabled = questionDto.columnRandomEnabled || false;
      questionData.columnRandomizationType = questionDto.columnRandomizationType;
    }

    // Add question to page
    page.questions.push(questionData);
    await page.save();

    // Update survey's totalQuestions count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalQuestions: 1 },
    }).exec();

    // Return formatted response matching API structure
    const createdQuestion = page.questions[page.questions.length - 1];
    const formatted = this.formatQuestionResponse(createdQuestion, page._id.toString());
    
    // Add timestamps
    formatted.createdAt = new Date();
    formatted.updatedAt = new Date();
    
    return formatted;
  }

  async getQuestion(
    surveyId: string,
    pageId: string,
    questionIndex: number,
  ): Promise<any> {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);

    if (questionIndex < 0 || questionIndex >= page.questions.length) {
      throw new NotFoundException('Question not found');
    }

    const question = page.questions[questionIndex];
    if (question.isDeleted) {
      throw new NotFoundException('Question not found');
    }

    return this.formatQuestionResponse(question, page._id.toString());
  }

  async getQuestionById(
    surveyId: string,
    pageId: string,
    questionId: string,
  ): Promise<any> {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);
    const crypto = require('crypto');
    
    // Migrate questions that don't have questionId
    let needsSave = false;
    const nonDeletedQuestions = page.questions.filter((q: any) => !q.isDeleted);
    nonDeletedQuestions.forEach((q: any, index: number) => {
      if (!q.questionId) {
        // Generate a stable ID based on page and question index
        const stableId = crypto.createHash('md5')
          .update(`${page._id.toString()}-${index}-${q.text}-${q.type}`)
          .digest('hex');
        q.questionId = stableId;
        needsSave = true;
      }
    });
    
    // Save if any questionId was added
    if (needsSave) {
      await page.save();
    }

    const questionIndex = this.findQuestionIndexByQuestionId(page, questionId, undefined);
    if (questionIndex === -1) {
      throw new NotFoundException('Question not found');
    }
    
    const question = page.questions[questionIndex];

    const formatted = this.formatQuestionResponse(question, page._id.toString());
    return {
      statusCode: 200,
      message: 'Survey Question Found',
      questionData: formatted,
    };
  }

  findQuestionIndexByQuestionId(page: any, questionId: string, questionText?: string): number {
    // First try exact match on questionId
    let index = page.questions.findIndex(
      (q: any) => q.questionId === questionId && !q.isDeleted,
    );
    
    // If not found, try matching by id field (in case questionId wasn't set but id was)
    if (index === -1) {
      index = page.questions.findIndex(
        (q: any) => {
          const qObj = q.toObject ? q.toObject() : q;
          return (qObj.id === questionId || qObj.questionId === questionId) && !qObj.isDeleted;
        },
      );
    }
    
    // If still not found, try _id (shouldn't happen for embedded docs, but just in case)
    if (index === -1) {
      index = page.questions.findIndex(
        (q: any) => q._id?.toString() === questionId && !q.isDeleted,
      );
    }
    
    // Last resort: if questionText is provided and questionId looks like a hash,
    // try to find by matching the generated hash for each question
    if (index === -1 && questionText) {
      const crypto = require('crypto');
      const nonDeletedQuestions = page.questions.filter((q: any) => !q.isDeleted);
      index = nonDeletedQuestions.findIndex((q: any, idx: number) => {
        const generatedId = crypto.createHash('md5')
          .update(`${page._id.toString()}-${idx}-${q.text}-${q.type}`)
          .digest('hex');
        return generatedId === questionId;
      });
      // Convert back to original index if found
      if (index !== -1) {
        const actualIndex = page.questions.findIndex((q: any) => 
          q === nonDeletedQuestions[index] && !q.isDeleted
        );
        index = actualIndex;
      }
    }
    
    return index;
  }

  async updateQuestion(
    surveyId: string,
    pageId: string,
    questionIndex: number,
    questionDto: Partial<CreateQuestionDto>,
  ): Promise<any> {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);

    if (questionIndex < 0 || questionIndex >= page.questions.length) {
      throw new NotFoundException('Question not found');
    }

    const question = page.questions[questionIndex];
    Object.assign(question, questionDto);

    await page.save();

    return this.formatQuestionResponse(question, page._id.toString());
  }

  async updateQuestionById(
    surveyId: string,
    pageId: string,
    questionId: string,
    questionDto: Partial<CreateQuestionDto>,
  ): Promise<any> {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);
    const crypto = require('crypto');
    
    // Migrate questions that don't have questionId
    let needsSave = false;
    const nonDeletedQuestions = page.questions.filter((q: any) => !q.isDeleted);
    nonDeletedQuestions.forEach((q: any, index: number) => {
      if (!q.questionId) {
        // Generate a stable ID based on page and question index
        const stableId = crypto.createHash('md5')
          .update(`${page._id.toString()}-${index}-${q.text}-${q.type}`)
          .digest('hex');
        q.questionId = stableId;
        needsSave = true;
      }
    });
    
    // Save if any questionId was added
    if (needsSave) {
      await page.save();
    }

    // Try to find question by ID, with fallback using question text from DTO
    const questionIndex = this.findQuestionIndexByQuestionId(page, questionId, questionDto.text);
    if (questionIndex === -1) {
      // Log available questionIds for debugging
      const availableIds = page.questions
        .filter((q: any) => !q.isDeleted)
        .map((q: any, idx: number) => {
          const qObj = q.toObject ? q.toObject() : q;
          return {
            index: idx,
            questionId: q.questionId || qObj.questionId || 'MISSING',
            id: qObj.id || 'MISSING',
            text: q.text || qObj.text,
          };
        });
      console.error(`Question not found. Looking for: ${questionId}`);
      console.error('Available questions:', JSON.stringify(availableIds, null, 2));
      throw new NotFoundException(`Question not found with ID: ${questionId}`);
    }

    const question = page.questions[questionIndex];

    // Ensure questionId is set (for old questions that might not have it)
    if (!question.questionId) {
      question.questionId = questionId;
    }

    // Handle options update
    if (questionDto.options) {
      question.options = questionDto.options.map((opt: any, index: number) => ({
        text: opt.text,
        seqNo: opt.seqNo || index + 1,
        uniqueOrder: opt.uniqueOrder || this.getNextUniqueOrderForOptions([], index),
        mandatoryEnabled: opt.mandatoryEnabled || false,
        preSelected: opt.preSelected || false,
        type: opt.type,
        imageUrl: opt.imageUrl,
        score: opt.score,
        isDeleted: false,
      }));
    }

    // Handle validation update
    const validation = questionDto.validation || questionDto.validations;
    if (validation) {
      question.validation = {
        maxvalue: validation.maxvalue,
        type: validation.type,
        minvalue: validation.minvalue,
        minlength: validation.minlength,
        maxlength: validation.maxlength,
        format: validation.format,
        scaleFrom: validation.scaleFrom,
        scaleTo: validation.scaleTo,
        startLabel: validation.startLabel,
        endLabel: validation.endLabel,
      };
      question.validationEnabled = true;
    }

    // Handle grid rows/columns update
    const rows = questionDto.row || questionDto.gridRows;
    const columns = questionDto.columns || questionDto.gridColumns;

    if (rows) {
      question.gridRows = rows.map((row: any, index: number) => ({
        text: row.text,
        uniqueOrder: row.uniqueOrder || index.toString(),
        columnsId: row.columnsId || [],
        score: row.score || [],
        columns: row.columns || [],
      }));
    }

    if (columns && (question.type === 'MATRIX_CHECK_BOX' || question.type === 'MATRIX_RADIO_BOX')) {
      const normalizedColumns = columns.map((col: any, index: number) => {
        const seqNo = col.seqNo ?? index + 1;
        const rawWeight =
          col.weight ?? col.value ?? col.score ?? col.seqNo ?? index + 1;
        const numericWeight =
          rawWeight === '' || rawWeight === null || rawWeight === undefined
            ? null
            : Number(rawWeight);

        return {
        text: col.text,
          uniqueOrder: (col.uniqueOrder ?? index).toString(),
          mandatoryEnabled: col.mandatoryEnabled ?? false,
          questionId: col.questionId ?? question.questionId ?? questionId,
          rowId: col.rowId ?? null,
          weight: Number.isFinite(numericWeight) ? numericWeight : null,
          seqNo,
          value:
            col.value ??
            (Number.isFinite(numericWeight) ? numericWeight.toString() : seqNo.toString()),
          createdAt: col.createdAt || new Date(),
          updatedAt: new Date(),
        };
      });

      question.columns = normalizedColumns;
      question.gridColumns = normalizedColumns;
    }

    // Update other fields
    if (questionDto.text !== undefined) question.text = questionDto.text;
    if (questionDto.type !== undefined) question.type = questionDto.type;
    if (questionDto.uniqueOrder !== undefined) question.uniqueOrder = questionDto.uniqueOrder;
    if (questionDto.validationEnabled !== undefined) question.validationEnabled = questionDto.validationEnabled;
    if (questionDto.mandatoryEnabled !== undefined) question.mandatoryEnabled = questionDto.mandatoryEnabled;
    if (questionDto.mandatoryMsg !== undefined) question.mandatoryMsg = questionDto.mandatoryMsg;
    if (questionDto.hintEnabled !== undefined) question.hintEnabled = questionDto.hintEnabled;
    if (questionDto.hintMsg !== undefined) question.hintMsg = questionDto.hintMsg;
    if (questionDto.randomEnabled !== undefined) question.randomEnabled = questionDto.randomEnabled;
    if (questionDto.randomizationType !== undefined) question.randomizationType = questionDto.randomizationType;
    if (questionDto.noneOptionEnabled !== undefined) question.noneOptionEnabled = questionDto.noneOptionEnabled;
    if (questionDto.otherOptionEnabled !== undefined) question.otherOptionEnabled = questionDto.otherOptionEnabled;
    if (questionDto.otherOptionMsg !== undefined) question.otherOptionMsg = questionDto.otherOptionMsg;
    if (questionDto.commentEnabled !== undefined) question.commentEnabled = questionDto.commentEnabled;
    if (questionDto.commentMsg !== undefined) question.commentMsg = questionDto.commentMsg;
    if (questionDto.notApplicableEnabled !== undefined) question.notApplicableEnabled = questionDto.notApplicableEnabled;
    if (questionDto.notApplicableMsg !== undefined) question.notApplicableMsg = questionDto.notApplicableMsg;
    if (questionDto.answerWidth !== undefined) question.answerWidth = questionDto.answerWidth;
    if (questionDto.initialMsg !== undefined) question.initialMsg = questionDto.initialMsg;

    await page.save();

    return {
      statusCode: 200,
      message: 'Question Updated',
    };
  }

  async deleteQuestionById(surveyId: string, pageId: string, questionId: string): Promise<void> {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);
    const crypto = require('crypto');
    
    // Migrate questions that don't have questionId
    let needsSave = false;
    const nonDeletedQuestions = page.questions.filter((q: any) => !q.isDeleted);
    nonDeletedQuestions.forEach((q: any, index: number) => {
      if (!q.questionId) {
        // Generate a stable ID based on page and question index
        const stableId = crypto.createHash('md5')
          .update(`${page._id.toString()}-${index}-${q.text}-${q.type}`)
          .digest('hex');
        q.questionId = stableId;
        needsSave = true;
      }
    });
    
    // Save if any questionId was added
    if (needsSave) {
      await page.save();
    }

    const questionIndex = this.findQuestionIndexByQuestionId(page, questionId, undefined);
    if (questionIndex === -1) {
      // Log available questionIds for debugging
      const availableIds = page.questions
        .filter((q: any) => !q.isDeleted)
        .map((q: any, idx: number) => {
          const qObj = q.toObject ? q.toObject() : q;
          return {
            index: idx,
            questionId: q.questionId || qObj.questionId || 'MISSING',
            id: qObj.id || 'MISSING',
            text: q.text || qObj.text,
          };
        });
      console.error(`Question not found for deletion. Looking for: ${questionId}`);
      console.error('Available questions:', JSON.stringify(availableIds, null, 2));
      throw new NotFoundException(`Question not found with ID: ${questionId}`);
    }

    page.questions[questionIndex].isDeleted = true;
    await page.save();

    // Update survey's totalQuestions count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalQuestions: -1 },
    }).exec();
  }

  async restoreQuestionById(surveyId: string, pageId: string, questionId: string): Promise<void> {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);
    const crypto = require('crypto');
    
    // Migrate questions that don't have questionId (including deleted ones)
    let needsSave = false;
    page.questions.forEach((q: any, index: number) => {
      if (!q.questionId) {
        // Generate a stable ID based on page and question index
        const stableId = crypto.createHash('md5')
          .update(`${page._id.toString()}-${index}-${q.text}-${q.type}`)
          .digest('hex');
        q.questionId = stableId;
        needsSave = true;
      }
    });
    
    // Save if any questionId was added
    if (needsSave) {
      await page.save();
    }

    const questionIndex = page.questions.findIndex(
      (q: any) => (q.questionId === questionId || q._id?.toString() === questionId) && q.isDeleted,
    );

    if (questionIndex === -1) {
      throw new NotFoundException('Deleted question not found');
    }
    
    const question = page.questions[questionIndex];
    question.isDeleted = false;
    await page.save();

    // Update survey's totalQuestions count
    await this.surveyModel.findByIdAndUpdate(surveyId, {
      $inc: { totalQuestions: 1 },
    }).exec();
  }

  async deleteQuestion(surveyId: string, pageId: string, questionIndex: number): Promise<void> {
    await this.surveyPagesService.deleteQuestion(surveyId, pageId, questionIndex);
  }

  async restoreQuestion(surveyId: string, pageId: string, questionIndex: number): Promise<void> {
    await this.surveyPagesService.restoreQuestion(surveyId, pageId, questionIndex);
  }

  private getNextUniqueOrder(questions: any[]): string {
    if (questions.length === 0) return 'A';
    const lastOrder = questions[questions.length - 1].uniqueOrder;
    if (typeof lastOrder === 'string' && lastOrder.match(/^[A-Z]$/)) {
      const nextChar = String.fromCharCode(lastOrder.charCodeAt(0) + 1);
      return nextChar > 'Z' ? 'AA' : nextChar;
    }
    return String(questions.length + 1);
  }

  private getNextUniqueOrderForOptions(questions: any[], index: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return chars[index % chars.length];
  }

  private formatQuestionResponse(question: any, surveyPageId: string): any {
    const response: any = {
      id: question.questionId || question._id?.toString() || generateId(),
      surveyPageId,
      text: question.text,
      type: question.type,
      uniqueOrder: question.uniqueOrder,
      validationEnabled: question.validationEnabled || false,
      mandatoryEnabled: question.mandatoryEnabled || false,
      mandatoryMsg: question.mandatoryMsg || null,
      hintEnabled: question.hintEnabled || false,
      hintMsg: question.hintMsg || null,
      randomEnabled: question.randomEnabled || false,
      randomizationType: question.randomizationType || null,
      noneOptionEnabled: question.noneOptionEnabled || false,
      otherOptionEnabled: question.otherOptionEnabled || false,
      otherOptionMsg: question.otherOptionMsg || null,
      commentEnabled: question.commentEnabled || false,
      commentMsg: question.commentMsg || null,
      notApplicableEnabled: question.notApplicableEnabled || false,
      notApplicableMsg: question.notApplicableMsg || null,
      answerWidth: question.answerWidth || null,
      initialMsg: question.initialMsg || null,
      weightageEnabled: question.weightageEnabled || false,
      showWeightage: question.showWeightage || false,
      displayFormat: question.displayFormat || null,
      isDeleted: question.isDeleted || false,
      createdAt: question.createdAt || new Date(),
      updatedAt: question.updatedAt || new Date(),
    };

    // Add options if present
    if (question.options && question.options.length > 0) {
      response.options = question.options
        .filter((opt: any) => !opt.isDeleted)
        .map((opt: any) => ({
          questionId: question._id || generateId(),
          text: opt.text,
          seqNo: opt.seqNo,
          uniqueOrder: opt.uniqueOrder,
          value: opt.value || null,
          weight: typeof opt.weight === 'number' ? opt.weight : null,
          mandatoryEnabled: opt.mandatoryEnabled || false,
          preSelected: opt.preSelected || false,
          imageUrl: opt.imageUrl || null,
          type: opt.type || null,
          score: opt.score || null,
          startLabel: null,
          endLabel: null,
          scaleFrom: null,
          scaleTo: null,
          id: generateId(),
          isDeleted: opt.isDeleted || false,
          createdAt: opt.createdAt || new Date(),
          updatedAt: opt.updatedAt || new Date(),
        }));
    }

    // Add validation if present
    if (question.validation) {
      response.validations = {
        questionId: question._id || generateId(),
        maxLength: question.validation.maxlength || null,
        minLength: question.validation.minlength || null,
        maxValue: question.validation.maxvalue || null,
        minValue: question.validation.minvalue || null,
        format: question.validation.format || null,
        scaleFrom: question.validation.scaleFrom || null,
        scaleTo: question.validation.scaleTo || null,
        startLabel: question.validation.startLabel || null,
        endLabel: question.validation.endLabel || null,
        type: question.validation.type || null,
        id: generateId(),
        createdAt: question.validation.createdAt || new Date(),
        updatedAt: question.validation.updatedAt || new Date(),
      };
    }

    // Add grid rows if present
    if (question.gridRows && question.gridRows.length > 0) {
      response.row = question.gridRows.map((row: any) => ({
        questionId: question._id || generateId(),
        text: row.text,
        uniqueOrder: row.uniqueOrder,
        columnsId: row.columnsId || [],
        score: row.score || [],
        id: generateId(),
        columns: row.columns || [],
        createdAt: row.createdAt || new Date(),
        updatedAt: row.updatedAt || new Date(),
      }));
    }

    // Add columns if present (for MATRIX types)
    if (question.columns && question.columns.length > 0) {
      response.columns = question.columns.map((col: any) => ({
        text: col.text,
        uniqueOrder: col.uniqueOrder,
        mandatoryEnabled: col.mandatoryEnabled || false,
        questionId: col.questionId || null,
        rowId: col.rowId || null,
        id: generateId(),
        createdAt: col.createdAt || new Date(),
        updatedAt: col.updatedAt || new Date(),
      }));
    }

    return response;
  }
}

