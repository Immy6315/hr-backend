import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Survey, SurveyStatus } from './schemas/survey.schema';
import { SurveyPage } from './schemas/survey-page.schema';
import { SurveyPageCollection } from './schemas/survey-page-collection.schema';
import { UserSurvey, UserSurveyStatus } from './schemas/user-survey.schema';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { SurveyAuditLogService } from './survey-audit-log.service';
import { ReminderService } from './reminder.service';
import { AuditLogAction, AuditLogEntityType } from './schemas/survey-audit-log.schema';
import * as XLSX from 'xlsx';

@Injectable()
export class SurveysService {
  constructor(
    @InjectModel(Survey.name) private surveyModel: Model<Survey>,
    @InjectModel(SurveyPageCollection.name) private surveyPageModel: Model<SurveyPageCollection>,
    @InjectModel(UserSurvey.name) private userSurveyModel: Model<UserSurvey>,
    @Inject(forwardRef(() => SurveyAuditLogService))
    private auditLogService: SurveyAuditLogService,
    @Inject(forwardRef(() => ReminderService))
    private reminderService: ReminderService,
  ) { }

  async create(
    createSurveyDto: CreateSurveyDto,
    createdBy?: string,
    organizationId?: string,
  ): Promise<Survey> {
    // Calculate totals
    const totalPages = createSurveyDto.pages?.length || 0;
    const totalQuestions =
      createSurveyDto.pages?.reduce(
        (sum, page) => sum + (page.questions?.length || 0),
        0,
      ) || 0;

    // Assign uniqueOrder if not provided
    const pages = createSurveyDto.pages
      ?.map((page, pageIndex) => this.normalizePage(page, pageIndex))
      .filter(Boolean);

    const survey = new this.surveyModel({
      ...createSurveyDto,
      pages: pages || [],
      totalPages,
      totalQuestions,
      totalResponses: 0,
      createdBy,
      organizationId: organizationId ? new (require('mongoose').Types.ObjectId)(organizationId) : undefined,
    });

    const savedSurvey = await survey.save();
    await this.persistSurveyPages(savedSurvey._id as Types.ObjectId, pages);

    // Log survey creation
    if (createdBy) {
      await this.auditLogService.logActivity(
        savedSurvey._id.toString(),
        { userId: createdBy },
        AuditLogAction.CREATED,
        AuditLogEntityType.SURVEY,
        {
          entityName: savedSurvey.name,
          newValue: {
            name: savedSurvey.name,
            description: savedSurvey.description,
            status: savedSurvey.status,
            category: savedSurvey.category,
          },
        },
      );
    }

    return savedSurvey;
  }

  async findAll(
    filters?: {
      status?: SurveyStatus;
      category?: string;
      isDeleted?: boolean;
      createdBy?: string;
      organizationId?: string;
    },
    pagination?: { page: number; limit: number },
  ): Promise<{ surveys: any[]; total: number }> {
    const query: any = {};

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.category) {
      query.category = filters.category;
    }
    if (filters?.isDeleted !== undefined) {
      query.isDeleted = filters.isDeleted;
    } else {
      query.isDeleted = false; // Default to non-deleted
    }
    if (filters?.createdBy) {
      query.createdBy = filters.createdBy;
    }
    if (filters?.organizationId) {
      query.organizationId = new Types.ObjectId(filters.organizationId);
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [surveys, total] = await Promise.all([
      this.surveyModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.surveyModel.countDocuments(query).exec(),
    ]);

    // Recalculate totalPages and totalQuestions dynamically for each survey
    // This ensures accuracy by counting only non-deleted pages and questions
    const surveysWithAccurateCounts = await Promise.all(
      surveys.map(async (survey) => {
        const pages = await this.surveyPageModel
          .find({
            surveyId: survey._id,
            isDeleted: false,
          })
          .exec();

        const totalPages = pages.length;
        const totalQuestions = pages.reduce((sum, page) => {
          return sum + page.questions.filter((q: any) => !q.isDeleted).length;
        }, 0);

        // Count completed responses for this survey
        const completedCount = await this.userSurveyModel.countDocuments({
          surveyId: survey._id,
          status: UserSurveyStatus.COMPLETED,
          isDeleted: false,
        }).exec();

        // Update the survey document with accurate counts (optional - for future queries)
        // For now, we'll just return the accurate counts in the response
        return {
          ...survey.toObject(),
          totalPages,
          totalQuestions,
          completedResponses: completedCount,
        };
      }),
    );

    return { surveys: surveysWithAccurateCounts, total };
  }

  async findOne(
    id: string,
    userContext?:
      | string
      | {
        userId?: string;
        role?: any;
        organizationId?: string | null;
      },
  ): Promise<any> {
    const survey = await this.surveyModel
      .findOne({ _id: id, isDeleted: false })
      .exec();
    if (!survey) {
      throw new NotFoundException(`Survey with ID ${id} not found`);
    }

    // Authorization checks when userContext is provided (builder/admin side)
    if (userContext) {
      this.checkPermission(survey, userContext);
    }

    // Fetch pages from separate collection
    let pages = await this.surveyPageModel
      .find({
        surveyId: survey._id,
        isDeleted: false,
      })
      .sort({ uniqueOrder: 1 })
      .exec();

    if ((!pages || pages.length === 0) && survey.pages && survey.pages.length) {
      await this.persistSurveyPages(survey._id as Types.ObjectId, survey.pages as SurveyPage[]);
      pages = await this.surveyPageModel
        .find({
          surveyId: survey._id,
          isDeleted: false,
        })
        .sort({ uniqueOrder: 1 })
        .exec();
    }

    // Format pages with questions
    const formattedPages = pages.map((page) => ({
      id: page._id.toString(),
      title: page.title,
      description: page.description,
      uniqueOrder: page.uniqueOrder,
      surveyId: page.surveyId.toString(),
      isDeleted: page.isDeleted,
      createdAt: (page as any).createdAt || new Date(),
      updatedAt: (page as any).updatedAt || new Date(),
      questions: page.questions
        .filter((q) => !q.isDeleted)
        .map((question) => this.formatQuestionForResponse(question, page._id.toString())),
    }));

    return {
      ...survey.toObject(),
      pages: formattedPages,
    };
  }

  private formatQuestionForResponse(question: any, pageId?: string): any {
    // Use questionId if available, otherwise generate one (for old questions without questionId)
    const questionId = question.questionId || question.id || this.generateId();
    const formatted: any = {
      id: questionId,
      questionId: questionId, // Ensure questionId is always present
      surveyPageId: pageId || question.surveyPageId || null,
      text: question.text,
      type: question.type,
      validationEnabled: question.validationEnabled || false,
      mandatoryEnabled: question.mandatoryEnabled || false,
      mandatoryMsg: question.mandatoryMsg || null,
      hintEnabled: question.hintEnabled || false,
      hintMsg: question.hintMsg || null,
      randomEnabled: question.randomEnabled || false,
      randomizationType: question.randomizationType || null,
      randomizeType: question.randomizeType || null,
      noneOptionEnabled: question.noneOptionEnabled || false,
      otherOptionEnabled: question.otherOptionEnabled || false,
      otherOptionMsg: question.otherOptionMsg || null,
      commentEnabled: question.commentEnabled || false,
      commentMsg: question.commentMsg || null,
      notApplicableEnabled: question.notApplicableEnabled || false,
      notApplicableMsg: question.notApplicableMsg || null,
      uniqueOrder: question.uniqueOrder,
      answerWidth: question.answerWidth || null,
      initialMsg: question.initialMsg || null,
      isDeleted: question.isDeleted || false,
      createdAt: question.createdAt || new Date(),
      updatedAt: question.updatedAt || new Date(),
    };

    // Add options if present
    if (question.options && question.options.length > 0) {
      formatted.options = question.options
        .filter((opt: any) => !opt.isDeleted)
        .map((opt: any) => ({
          questionId: questionId,
          text: opt.text,
          seqNo: opt.seqNo,
          uniqueOrder: opt.uniqueOrder,
          mandatoryEnabled: opt.mandatoryEnabled || false,
          preSelected: opt.preSelected || false,
          imageUrl: opt.imageUrl || null,
          type: opt.type || null,
          score: opt.score || null,
          startLabel: null,
          endLabel: null,
          scaleFrom: null,
          scaleTo: null,
          id: this.generateId(),
          isDeleted: opt.isDeleted || false,
          createdAt: opt.createdAt || new Date(),
          updatedAt: opt.updatedAt || new Date(),
        }));
    }

    // Add validation if present
    if (question.validation) {
      formatted.validations = {
        id: this.generateId(),
        questionId: questionId,
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
        createdAt: question.validation.createdAt || new Date(),
        updatedAt: question.validation.updatedAt || new Date(),
      };
    }

    const matrixRowSources = [
      Array.isArray(question.row) ? question.row : null,
      Array.isArray(question.rows) ? question.rows : null,
      Array.isArray(question.gridRows) ? question.gridRows : null,
      Array.isArray(question.metadata?.matrixRows) ? question.metadata.matrixRows : null,
      Array.isArray(question.metadata?.rows) ? question.metadata.rows : null,
      Array.isArray(question.metadata?.statements) ? question.metadata.statements : null,
    ].filter(Boolean) as any[][];

    if (matrixRowSources.length > 0) {
      const resolvedRows = matrixRowSources[0];
      formatted.row = resolvedRows.map((row: any, index: number) => ({
        questionId,
        text: row.text || row.label || row.statement || row.msg || `Statement ${index + 1}`,
        uniqueOrder: row.uniqueOrder ?? row.order ?? row.seqNo ?? index.toString(),
        columnsId: row.columnsId || [],
        score: row.score || [],
        id: row.id || row.rowId || row._id || this.generateId(),
        columns: row.columns || [],
        createdAt: row.createdAt || new Date(),
        updatedAt: row.updatedAt || new Date(),
      }));
    }

    const ratingScaleFromMetadata =
      Array.isArray(question.metadata?.ratingScale) && question.metadata.ratingScale.length
        ? question.metadata.ratingScale.map((scale: any, index: number) => ({
          text: scale.label || scale.description || scale.text || `Option ${index + 1}`,
          weight: scale.weight ?? scale.value ?? scale.scale ?? index + 1,
          value: scale.value ?? scale.weight ?? scale.scale ?? index + 1,
          uniqueOrder: scale.uniqueOrder ?? index.toString(),
        }))
        : null;

    const matrixColumnSources = [
      Array.isArray(question.columns) ? question.columns : null,
      Array.isArray(question.gridColumns) ? question.gridColumns : null,
      Array.isArray(question.options) ? question.options : null,
      ratingScaleFromMetadata,
      Array.isArray(question.metadata?.matrixColumns) ? question.metadata.matrixColumns : null,
      Array.isArray(question.metadata?.columns) ? question.metadata.columns : null,
    ].filter(Boolean) as any[][];

    if (matrixColumnSources.length > 0) {
      const resolvedColumns = matrixColumnSources[0];
      const normalizedColumns = resolvedColumns.map((col: any, index: number) => {
        const rawValue =
          col.value ??
          col.seqNo ??
          col.uniqueOrder ??
          col.weight ??
          col.scale ??
          (typeof col === 'string' ? col : null) ??
          index + 1;
        const numericWeight =
          typeof col.weight === 'number'
            ? col.weight
            : typeof col.score === 'number'
              ? col.score
              : typeof col.scale === 'number'
                ? col.scale
                : !Number.isNaN(Number(rawValue))
                  ? Number(rawValue)
                  : index + 1;

        return {
          text: col.text || col.label || col.description || (typeof col === 'string' ? col : ''),
          uniqueOrder: col.uniqueOrder?.toString() ?? col.seqNo?.toString() ?? index.toString(),
          mandatoryEnabled: col.mandatoryEnabled || false,
          questionId: col.questionId || null,
          rowId: col.rowId || null,
          weight: numericWeight,
          seqNo: col.seqNo ?? index,
          value: rawValue?.toString() ?? index.toString(),
          id: col.id || col._id || this.generateId(),
          createdAt: col.createdAt || new Date(),
          updatedAt: col.updatedAt || new Date(),
        };
      });
      formatted.columns = normalizedColumns;
      formatted.gridColumns = normalizedColumns;
    }

    return formatted;
  }

  private async persistSurveyPages(
    surveyId: Types.ObjectId,
    pages?: Array<Partial<SurveyPage> & { questions?: any[] }>,
  ) {
    if (!pages || !pages.length) {
      return;
    }

    await this.surveyPageModel.deleteMany({ surveyId }).exec();

    const documents = pages
      .map((page, pageIndex) => {
        const normalizedPage = this.normalizePage(page, pageIndex);
        if (!normalizedPage) {
          return null;
        }
        return {
          surveyId,
          title: normalizedPage.title,
          description: normalizedPage.description,
          uniqueOrder: normalizedPage.uniqueOrder,
          isDeleted: normalizedPage.isDeleted ?? false,
          questions: (normalizedPage.questions || []).map((question, questionIndex) =>
            this.normalizeQuestion(question, questionIndex),
          ),
        };
      })
      .filter(Boolean);

    if (documents.length) {
      await this.surveyPageModel.insertMany(documents);
    }
  }

  private normalizePage(page: any, pageIndex: number) {
    if (!page) {
      return undefined;
    }

    const normalizedTitle =
      typeof page.title === 'string' && page.title.trim().length > 0
        ? page.title.trim()
        : `Page ${pageIndex + 1}`;

    return {
      ...page,
      title: normalizedTitle,
      uniqueOrder: String(page.uniqueOrder ?? pageIndex),
      isDeleted: page.isDeleted ?? false,
      questions: (page.questions || []).map((question: any, questionIndex: number) =>
        this.normalizeQuestion(question, questionIndex),
      ),
    };
  }

  private normalizeQuestion(question: any, questionIndex: number) {
    if (!question) {
      return undefined;
    }

    const normalizedText =
      typeof question.text === 'string' && question.text.trim().length > 0
        ? question.text.trim()
        : `Question ${questionIndex + 1}`;

    const normalizedOptions = (question.options || []).map((option: any, optionIndex: number) =>
      this.normalizeOption(option, optionIndex),
    );

    const normalizeGrid = (rowsOrColumns: any[], includeWeights = false) =>
      (rowsOrColumns || []).map((item: any, idx: number) => ({
        ...item,
        uniqueOrder: String(item?.uniqueOrder ?? idx),
        ...(includeWeights && item.weight !== undefined
          ? { weight: Number(item.weight) }
          : includeWeights && item.weight === undefined && item.value !== undefined
            ? { weight: Number(item.value) }
            : includeWeights
              ? { weight: idx + 1 }
              : {}),
      }));

    return {
      ...question,
      text: normalizedText,
      uniqueOrder: String(question.uniqueOrder ?? questionIndex),
      questionId: question.questionId || this.generateId(),
      validationEnabled: question.validationEnabled ?? false,
      mandatoryEnabled: question.mandatoryEnabled ?? false,
      hintEnabled: question.hintEnabled ?? false,
      randomEnabled: question.randomEnabled ?? false,
      noneOptionEnabled: question.noneOptionEnabled ?? false,
      otherOptionEnabled: question.otherOptionEnabled ?? false,
      commentEnabled: question.commentEnabled ?? false,
      notApplicableEnabled: question.notApplicableEnabled ?? false,
      scoreEnabled: question.scoreEnabled ?? false,
      isDeleted: question.isDeleted ?? false,
      options: normalizedOptions,
      gridRows: normalizeGrid(question.gridRows || []),
      gridColumns: normalizeGrid(question.gridColumns || [], true),
      columns: normalizeGrid(question.columns || [], true),
    };
  }

  private normalizeOption(option: any, optionIndex: number) {
    if (!option) {
      return undefined;
    }

    return {
      ...option,
      uniqueOrder: String(option.uniqueOrder ?? optionIndex),
      seqNo: option.seqNo ?? optionIndex,
      isDeleted: option.isDeleted ?? false,
    };
  }

  private generateId(): string {
    return require('crypto').randomBytes(16).toString('hex');
  }

  async update(
    id: string,
    updateSurveyDto: UpdateSurveyDto,
    userContext?: string | { userId?: string; role?: any; organizationId?: string | null },
  ): Promise<Survey> {
    const survey = await this.surveyModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!survey) {
      throw new NotFoundException(`Survey with ID ${id} not found`);
    }

    // Verify permissions
    if (userContext) {
      this.checkPermission(survey, userContext);
    }

    const userId = typeof userContext === 'string' ? userContext : userContext?.userId;

    // Store old values for audit log
    const oldValue: any = {
      name: survey.name,
      description: survey.description,
      status: survey.status,
      category: survey.category,
    };

    // Update survey fields
    if (updateSurveyDto.name !== undefined) survey.name = updateSurveyDto.name;
    if (updateSurveyDto.category !== undefined) survey.category = updateSurveyDto.category;
    if (updateSurveyDto.status !== undefined) {
      // Log publish action if status changed to active
      if (survey.status !== 'active' && updateSurveyDto.status === 'active' && userId) {
        await this.auditLogService.logActivity(
          id,
          { userId: userId },
          AuditLogAction.PUBLISHED,
          AuditLogEntityType.SURVEY,
          {
            entityName: survey.name,
          },
        );

        // Auto-set startDate to now if not already set
        if (!survey.startDate) {
          survey.startDate = new Date();
        }

        // Auto-send emails to all eligible participants
        try {
          const eligibleParticipants = await this.reminderService.getReminderEligibleParticipants(id);

          if (eligibleParticipants.length > 0) {
            const participantIds = eligibleParticipants.map(p => p._id.toString());

            // Send emails (invites for new participants, reminders for existing ones)
            const result = await this.reminderService.sendBulkReminders(
              id,
              participantIds,
              {
                userId,
                role: 'admin',
                organizationId: survey.organizationId?.toString()
              }
            );

            console.log(`✅ Auto-sent emails on survey activation: ${result.sent} sent, ${result.failed} failed, ${result.ineligible} ineligible`);
          } else {
            console.log('ℹ️ No eligible participants to send emails to on survey activation');
          }
        } catch (error) {
          // Don't block survey activation if emails fail
          console.error(`⚠️ Failed to auto-send emails on activation: ${error.message}`);
        }
      }
      survey.status = updateSurveyDto.status;
    }
    if (updateSurveyDto.description !== undefined) survey.description = updateSurveyDto.description;
    if (updateSurveyDto.communicationTemplates !== undefined) survey.communicationTemplates = updateSurveyDto.communicationTemplates as any;

    // Only update dates if they are valid Date objects (not empty objects {})
    if (updateSurveyDto.startDate !== undefined) {
      if (updateSurveyDto.startDate instanceof Date || typeof updateSurveyDto.startDate === 'string') {
        survey.startDate = updateSurveyDto.startDate;
      }
    }
    if (updateSurveyDto.endDate !== undefined) {
      if (updateSurveyDto.endDate instanceof Date || typeof updateSurveyDto.endDate === 'string') {
        survey.endDate = updateSurveyDto.endDate;
      }
    }

    const updatedSurvey = await survey.save();

    // Auto-send emails if status changed to active
    if (oldValue.status !== 'active' && updatedSurvey.status === 'active' && userId) {
      try {
        const eligibleParticipants = await this.reminderService.getReminderEligibleParticipants(id);
        if (eligibleParticipants.length > 0) {
          const participantIds = eligibleParticipants.map(p => p._id.toString());

          // Use super_admin role to ensure internal call succeeds (permission already verified above)
          await this.reminderService.sendBulkReminders(
            id,
            participantIds,
            {
              userId,
              role: 'super_admin',
              organizationId: updatedSurvey.organizationId?.toString()
            }
          );
          console.log(`Auto-sent emails to ${participantIds.length} participants for survey ${id}`);
        }
      } catch (error) {
        console.error(`Failed to auto-send emails on activation for survey ${id}:`, error);
        // We don't throw here to avoid rolling back the activation if email fails
      }
    }

    // Log survey update
    if (userId) {
      const newValue: any = {
        name: updatedSurvey.name,
        description: updatedSurvey.description,
        status: updatedSurvey.status,
        category: updatedSurvey.category,
      };

      await this.auditLogService.logActivity(
        id,
        { userId: userId },
        AuditLogAction.UPDATED,
        AuditLogEntityType.SURVEY,
        {
          oldValue,
          newValue,
        },
      );
    }

    return updatedSurvey;
  }

  async updateNominationConfig(
    id: string,
    config: {
      isOpen: boolean;
      allowedRelationships: string[];
      requirements: Array<{ relationship: string; minCount: number }>;
      instructions?: string;
    },
    userContext?: string | { userId?: string; role?: any; organizationId?: string | null },
  ): Promise<Survey> {
    const survey = await this.surveyModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!survey) {
      throw new NotFoundException(`Survey with ID ${id} not found`);
    }

    // Verify permissions
    if (userContext) {
      this.checkPermission(survey, userContext);
    }

    survey.nominationConfig = config;
    return survey.save();
  }

  async updateParticipantReportConfig(
    id: string,
    config: {
      isEnabled: boolean;
      minTotalResponses: number;
      requirements: Array<{ relationship: string; minCount: number }>;
    },
    userContext?: string | { userId?: string; role?: any; organizationId?: string | null },
  ): Promise<Survey> {
    const survey = await this.surveyModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!survey) {
      throw new NotFoundException(`Survey with ID ${id} not found`);
    }

    // Verify permissions
    if (userContext) {
      this.checkPermission(survey, userContext);
    }

    survey.participantReportConfig = config;

    // Sync with nominationConfig.participantReportConfig as frontend expects it there
    if (!survey.nominationConfig) {
      survey.nominationConfig = { isOpen: false, allowedRelationships: [], requirements: [] };
    }
    survey.nominationConfig.participantReportConfig = config;
    // Mark mixed type as modified to ensure Mongoose saves it
    survey.markModified('nominationConfig');

    return survey.save();
  }

  async remove(
    id: string,
    userContext?: string | { userId?: string; role?: any; organizationId?: string | null },
  ): Promise<void> {
    const survey = await this.surveyModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!survey) {
      throw new NotFoundException(`Survey with ID ${id} not found`);
    }

    // Verify permissions
    if (userContext) {
      this.checkPermission(survey, userContext);
    }

    survey.isDeleted = true;
    await survey.save();
  }

  async delete(id: string): Promise<void> {
    await this.surveyModel.findByIdAndDelete(id).exec();
  }

  async incrementResponseCount(surveyId: string): Promise<void> {
    await this.surveyModel.findByIdAndUpdate(surveyId, { $inc: { totalResponses: 1 } }).exec();
  }

  async incrementVisitCount(surveyId: string): Promise<void> {
    await this.surveyModel.findByIdAndUpdate(surveyId, { $inc: { totalVisits: 1 } }).exec();
  }

  async searchSurveys(searchTerm: string, limit: number = 10, userId?: string): Promise<Survey[]> {
    const query: any = {
      $text: { $search: searchTerm },
      isDeleted: false,
    };

    // Filter by user if userId is provided
    if (userId) {
      query.createdBy = userId;
    }

    return this.surveyModel
      .find(query)
      .limit(limit)
      .exec();
  }

  async findByUrl(url: string): Promise<Survey | null> {
    return this.surveyModel
      .findOne({
        $or: [{ publicUrl: url }, { privateUrl: url }],
        isDeleted: false,
      })
      .exec();
  }

  /**
   * Create a survey (with pages and questions) from an uploaded Excel file.
   *
   * Expected columns in the first sheet:
   * - SurveyName        (same for all rows, required for first row)
   * - SurveyDescription (optional)
   * - PageTitle         (required)
   * - PageDescription   (optional)
   * - QuestionText      (required)
   * - QuestionType      (required, e.g. SINGLE_CHOICE, MULTIPLE_CHOICE, SHORT_ANSWER)
   * - Options           (optional, pipe-separated, e.g. "Option 1|Option 2|Option 3")
   * - IsRequired        (optional, "yes"/"no")
   */
  async createFromExcel(
    file: Express.Multer.File,
    createdBy: string,
    organizationId?: string,
  ): Promise<Survey> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded or file is empty');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      throw new BadRequestException('Uploaded Excel file is empty');
    }

    const firstRow = rows[0];
    const surveyName: string = firstRow.SurveyName || firstRow['Survey Name'] || 'Uploaded Survey';
    const surveyDescription: string =
      firstRow.SurveyDescription || firstRow['Survey Description'] || '';

    type PageAccumulator = {
      title: string;
      description?: string;
      questions: any[];
    };

    const pagesMap = new Map<string, PageAccumulator>();

    rows.forEach((row, index) => {
      const pageTitle =
        row.PageTitle || row['Page Title'] || row.Page || row['Page'] || `Page ${index + 1}`;
      const pageDescription =
        row.PageDescription ||
        row['Page Description'] ||
        row.PageDesc ||
        row['Page Desc'] ||
        '';

      const questionText =
        row.QuestionText || row['Question Text'] || row.Question || row['Question'];
      const questionType =
        row.QuestionType || row['Question Type'] || row.Type || row['Type'] || 'SHORT_ANSWER';
      const optionsRaw = row.Options || row['Options'] || '';
      const isRequiredRaw = (row.IsRequired || row['Is Required'] || '').toString().toLowerCase();

      if (!questionText) {
        // Skip completely empty lines
        return;
      }

      let page = pagesMap.get(pageTitle);
      if (!page) {
        page = {
          title: pageTitle,
          description: pageDescription,
          questions: [],
        };
        pagesMap.set(pageTitle, page);
      }

      const options =
        optionsRaw && typeof optionsRaw === 'string'
          ? optionsRaw
            .split('|')
            .map((opt: string) => opt.trim())
            .filter((opt: string) => opt.length > 0)
            .map((text: string) => ({ text }))
          : undefined;

      const mandatoryEnabled = isRequiredRaw === 'yes' || isRequiredRaw === 'true' || isRequiredRaw === '1';

      page.questions.push({
        text: questionText,
        type: questionType,
        mandatoryEnabled,
        options,
      });
    });

    // Parse Communication sheet if it exists
    let communicationTemplates: any = undefined;
    const communicationSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === 'communication' || name.toLowerCase() === 'communications',
    );

    if (communicationSheetName) {
      const commSheet = workbook.Sheets[communicationSheetName];
      // Use header: 1 to get array of arrays (raw rows)
      const commRows: any[][] = XLSX.utils.sheet_to_json(commSheet, { header: 1 });

      if (commRows && commRows.length > 0) {
        // Import the parsing utility
        const { parseCommunicationTemplates } = await import('./utils/email-template.util');

        communicationTemplates = parseCommunicationTemplates(commRows);
      }
    }

    const createSurveyDto: CreateSurveyDto = {
      name: surveyName,
      description: surveyDescription,
      category: 'uploaded',
      status: SurveyStatus.DRAFT,
      communicationTemplates: communicationTemplates || undefined,
      pages: Array.from(pagesMap.values()).map((page, idx) => ({
        title: page.title,
        description: page.description,
        uniqueOrder: idx,
        questions: page.questions,
      })),
    };

    return this.create(createSurveyDto, createdBy, organizationId);
  }

  private checkPermission(
    survey: Survey,
    userContext: string | { userId?: string; role?: any; organizationId?: string | null },
  ) {
    const ctx =
      typeof userContext === 'string'
        ? { userId: userContext }
        : userContext;

    // If only userId is provided (legacy check), keep existing "createdBy" ownership check
    if (ctx && ctx.role === undefined && ctx.organizationId === undefined && ctx.userId) {
      if (survey.createdBy && survey.createdBy.toString() !== ctx.userId) {
        throw new ForbiddenException('You do not have permission to access this survey');
      }
      return;
    }

    if (ctx && ctx.role) {
      const role = ctx.role;

      // Super admin can access any survey
      if (role === 'super_admin') {
        return;
      }

      if (role === 'org_admin' || role === 'org_sub_admin') {
        // Org-level users can only access surveys from their organization (if org is set)
        if (survey.organizationId && ctx.organizationId) {
          if (survey.organizationId.toString() !== ctx.organizationId.toString()) {
            throw new ForbiddenException(
              'You do not have permission to access surveys from another organization',
            );
          }
          return;
        }
      }

      // For participants/other roles, fall back to strict createdBy check when userId present
      if (ctx.userId && survey.createdBy && survey.createdBy.toString() !== ctx.userId) {
        throw new ForbiddenException('You do not have permission to access this survey');
      }
    }
  }
}

