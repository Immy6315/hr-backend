import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Query,
  UseInterceptors,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateOrganizationUserDto } from './dto/update-organization-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { Types } from 'mongoose';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserPermission, getDefaultPermissionsForRole, ensureMandatoryPermissions } from '../users/user-permissions';
import { CreateSurveyDto } from '../surveys/dto/create-survey.dto';
import { SurveysService } from '../surveys/surveys.service';
import { SurveyTemplateDraftsService } from '../surveys/survey-template-drafts.service';
import { SurveyStatus } from '../surveys/schemas/survey.schema';

const INVITATION_EXPIRY_DAYS = 10;

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly surveysService: SurveysService,
    private readonly templateDraftsService: SurveyTemplateDraftsService,
  ) { }

  private readonly logger = new Logger(OrganizationsController.name);

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Create a new organization (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  async create(@Body() createDto: CreateOrganizationDto, @Req() req: any) {
    const organization = await this.organizationsService.create(createDto, req.user.userId);
    return {
      message: 'Organization created successfully',
      data: organization,
    };
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all organizations (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'List of organizations' })
  async findAll() {
    const organizations = await this.organizationsService.findAll();
    return {
      message: 'Organizations fetched successfully',
      data: organizations,
    };
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get a single organization by ID (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    this.ensureOrganizationAccess(req, id);
    const organization = await this.organizationsService.findOne(id);
    return {
      message: 'Organization fetched successfully',
      data: organization,
    };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Update an organization (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateOrganizationDto, @Req() req: any) {
    this.ensureOrganizationAccess(req, id);
    const organization = await this.organizationsService.update(id, updateDto);
    return {
      message: 'Organization updated successfully',
      data: organization,
    };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Soft delete an organization (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Organization deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.organizationsService.softDelete(id);
    return {
      message: 'Organization deleted successfully',
    };
  }

  @Get(':id/users')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get all users in an organization (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'List of users in the organization' })
  async getOrganizationUsers(@Param('id') id: string, @Req() req: any) {
    this.ensureOrganizationAccess(req, id);
    const users = await this.usersService.findByOrganization(id);
    return {
      message: 'Users fetched successfully',
      data: users,
    };
  }

  @Get(':organizationId/surveys')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'List surveys for an organization' })
  async getOrganizationSurveys(
    @Param('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;

    const result = await this.surveysService.findAll(
      {
        organizationId,
        isDeleted: false,
      },
      { page: pageNumber, limit: limitNumber },
    );

    return {
      message: 'Organization surveys fetched successfully',
      data: result.surveys,
      meta: {
        total: result.total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.max(1, Math.ceil(result.total / limitNumber)),
      },
    };
  }

  @Post(':organizationId/surveys')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Create a survey within an organization' })
  async createOrganizationSurvey(
    @Param('organizationId') organizationId: string,
    @Body() createSurveyDto: CreateSurveyDto,
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);
    const payload: CreateSurveyDto = { ...createSurveyDto };
    delete (payload as any).organizationId;

    const survey = await this.surveysService.create(payload, req.user.userId, organizationId);

    return {
      message: 'Survey created successfully',
      data: {
        id: survey._id.toString(),
        name: survey.name,
        status: survey.status,
        createdAt: survey.createdAt,
        totalPages: survey.totalPages,
        totalQuestions: survey.totalQuestions,
      },
    };
  }

  @Post(':organizationId/surveys/upload-preview')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Analyze a survey Excel template and return sheet metadata' })
  async previewSurveyTemplate(
    @Param('organizationId') organizationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `[SurveyUpload] Preview requested | org=${organizationId} user=${req.user?.userId} file=${file.originalname} size=${file.size}B`,
    );

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    if (!workbook.SheetNames.length) {
      throw new BadRequestException('The uploaded workbook does not contain any sheets.');
    }

    const payloadSheets: any[] = [];
    const responseSheets: any[] = [];

    workbook.SheetNames.forEach((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName];
      const rowsMatrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: '',
      });

      const headerRow = rowsMatrix[0] || [];
      const headers = headerRow.map((header: any, headerIndex: number) => {
        const normalized = header?.toString()?.trim();
        return normalized || `column_${headerIndex + 1}`;
      });

      const dataRows = rowsMatrix.slice(1).map((row) => {
        return headers.reduce((acc, header, columnIndex) => {
          acc[header] = row[columnIndex] ?? '';
          return acc;
        }, {} as Record<string, any>);
      });

      payloadSheets.push({
        index,
        name: sheetName,
        headers,
        rows: dataRows,
      });

      responseSheets.push({
        index,
        name: sheetName,
        rowCount: dataRows.length,
        headers,
        sampleRows: dataRows.slice(0, 5),
      });
    });

    const payload = {
      metadata: {
        fileName: file.originalname,
        sheetCount: payloadSheets.length,
      },
      sheets: payloadSheets,
    };

    const draft = await this.templateDraftsService.createDraft({
      organizationId,
      createdBy: req.user.userId,
      payload,
    });

    this.logger.log(
      `[SurveyUpload] Preview stored as draft ${draft._id.toString()} | sheets=${payloadSheets.length}`,
    );

    return {
      message: 'Survey template analyzed successfully',
      data: {
        draftId: draft._id.toString(),
        sheetCount: payloadSheets.length,
        sheets: responseSheets,
        createdAt: draft.createdAt,
      },
    };
  }

  @Post(':organizationId/surveys/upload-create')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an Excel survey template and create a survey immediately' })
  async uploadSurveyAndCreate(
    @Param('organizationId') organizationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `[SurveyUpload] Upload-create requested | org=${organizationId} user=${req.user?.userId} file=${file.originalname} size=${file.size}B`,
    );

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const blueprint = this.buildSurveyBlueprintFromWorkbook(workbook);

    if (!blueprint.pages || blueprint.pages.length === 0) {
      throw new BadRequestException('No valid questions were found in the uploaded file.');
    }

    const survey = await this.surveysService.create(
      {
        name: blueprint.name,
        description: blueprint.description,
        status: SurveyStatus.DRAFT,
        category: '360 Feedback',
        pages: blueprint.pages,
        reminderTemplates: blueprint.reminderTemplates,
        communicationTemplates: blueprint.communicationTemplates,
        reminderSettings: blueprint.reminderSettings,
        projectDetails: blueprint.projectDetails,
        ratingScale: blueprint.ratingScale,
      },
      req.user.userId,
      organizationId,
    );

    this.logger.log(
      `[SurveyUpload] Survey created | surveyId=${survey._id.toString()} pages=${blueprint.pages.length} questions=${blueprint.questionCount}`,
    );

    return {
      message: 'Survey created successfully from Excel',
      data: {
        surveyId: survey._id.toString(),
        name: survey.name,
        pages: survey.pages?.length || blueprint.pages.length,
        questionCount: blueprint.questionCount,
      },
    };
  }

  @Get(':organizationId/surveys/drafts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'List survey template drafts for an organization' })
  async listSurveyDrafts(@Param('organizationId') organizationId: string, @Req() req: any) {
    this.ensureOrganizationAccess(req, organizationId);
    const drafts = await this.templateDraftsService.findByOrganization(organizationId);
    return {
      message: 'Drafts fetched successfully',
      data: drafts.map((draft) => ({
        id: draft._id.toString(),
        status: draft.status,
        createdAt: draft.createdAt,
        publishedAt: draft.publishedAt || null,
        metadata: draft.payload?.metadata || null,
      })),
    };
  }

  @Get(':organizationId/surveys/drafts/:draftId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get detailed payload for a survey template draft' })
  async getSurveyDraft(
    @Param('organizationId') organizationId: string,
    @Param('draftId') draftId: string,
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);
    const draft = await this.templateDraftsService.getDraft(draftId);
    if (draft.organizationId.toString() !== organizationId) {
      throw new ForbiddenException('This draft belongs to a different organization');
    }
    return {
      message: 'Draft fetched successfully',
      data: {
        id: draft._id.toString(),
        status: draft.status,
        createdAt: draft.createdAt,
        publishedAt: draft.publishedAt || null,
        payload: draft.payload,
      },
    };
  }

  @Post(':organizationId/surveys/drafts/:draftId/publish')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Create a survey from a stored template draft' })
  async publishSurveyFromDraft(
    @Param('organizationId') organizationId: string,
    @Param('draftId') draftId: string,
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);
    const draft = await this.templateDraftsService.getDraft(draftId);

    if (draft.organizationId.toString() !== organizationId) {
      throw new ForbiddenException('This draft belongs to a different organization');
    }

    const surveyBlueprint = this.buildSurveyFromDraft(draft.payload);

    if (surveyBlueprint.pages.length === 0) {
      throw new BadRequestException('No valid questions were found in the template draft.');
    }

    const survey = await this.surveysService.create(
      {
        name: surveyBlueprint.name,
        description: surveyBlueprint.description,
        status: SurveyStatus.DRAFT,
        category: '360 Feedback',
        pages: surveyBlueprint.pages,
        reminderTemplates: surveyBlueprint.reminderTemplates || surveyBlueprint.reminders,
        communicationTemplates: surveyBlueprint.communicationTemplates,
        reminderSettings: surveyBlueprint.reminderSettings,
        projectDetails: surveyBlueprint.projectDetails,
      },
      req.user.userId,
      organizationId,
    );

    await this.templateDraftsService.markAsPublished(draftId);

    return {
      message: 'Survey created successfully from template draft',
      data: {
        surveyId: survey._id.toString(),
        name: survey.name,
        pages: survey.pages?.length || surveyBlueprint.pages.length,
        questionCount: surveyBlueprint.questionCount,
      },
    };
  }

  private buildSurveyFromDraft(payload: any): {
    name: string;
    description?: string;
    pages: any[];
    questionCount: number;
    reminderTemplates: Array<{ type: string; subject: string; body: string; schedule?: string }>;
    reminders?: Array<{ type: string; subject: string; body: string; schedule?: string }>;
    communicationTemplates?: any;
    reminderSettings?: any;
    projectDetails?: any;
  } {
    const title =
      payload?.projectDetails?.name ||
      payload?.metadata?.fileName?.replace(/\.[^/.]+$/, '') ||
      'Imported 360 Survey';

    const ratingScale = this.extractRatingScale(payload);
    const competencyPages = this.buildCompetencyPages(payload, ratingScale);
    const qualitativePage = this.buildQualitativePage(payload);
    const reminderTemplates = this.buildReminderTemplates(payload);

    const pages = [...competencyPages];
    if (qualitativePage) {
      pages.push(qualitativePage);
    }

    const totalQuestions = pages.reduce(
      (count, page) => count + (page.questions?.length || 0),
      0,
    );

    const blueprint = {
      name: title,
      description: 'Survey generated automatically from Excel template',
      pages,
      questionCount: totalQuestions,
      reminderTemplates,
      reminders: reminderTemplates,
      communicationTemplates: payload?.communicationTemplates,
      reminderSettings: payload?.reminderSettings,
      projectDetails: payload?.projectDetails,
    };
    this.logger?.log?.(
      `[SurveyUpload] Generated blueprint with ${pages.length} pages and ${totalQuestions} questions`,
    );
    return blueprint;
  }

  private extractRatingScale(payload: any): { weight: number; label: string }[] {
    const sheets = payload?.sheets || [];
    const scaleSheet = sheets.find((sheet: any) =>
      sheet.name?.toLowerCase().includes('rating scale'),
    );

    if (!scaleSheet) {
      return this.defaultRatingScale();
    }

    const weightKey = scaleSheet.headers?.[0] || 'WEIGHT';
    const labelKey = scaleSheet.headers?.[1] || 'LABEL';

    const scale = (scaleSheet.rows || [])
      .map((row: Record<string, any>) => {
        const weight = Number(row[weightKey]);
        const label = row[labelKey]?.toString().trim();
        if (Number.isNaN(weight) || !label) {
          return null;
        }
        return { weight, label };
      })
      .filter(Boolean) as { weight: number; label: string }[];

    return scale.length > 0 ? scale : this.defaultRatingScale();
  }

  private buildCompetencyPages(
    payload: any,
    ratingScale: { weight: number; label: string }[],
  ) {
    const sheets = payload?.sheets || [];
    const mcqSheet = sheets.find((sheet: any) =>
      sheet.name?.toLowerCase().includes('feedback statements'),
    );
    if (!mcqSheet) {
      return [];
    }

    const competencyKey =
      mcqSheet.headers?.find((header: string) => header.toLowerCase().includes('competency')) ||
      'Competency';
    const statementKey =
      mcqSheet.headers?.find((header: string) => header.toLowerCase().includes('statement')) ||
      'Behavioural Statement';

    const groups = new Map<string, any[]>();

    (mcqSheet.rows || []).forEach((row: Record<string, any>) => {
      const competency = row[competencyKey]?.toString().trim();
      const statement = row[statementKey]?.toString().trim();
      if (!competency || !statement) {
        return;
      }
      if (!groups.has(competency)) {
        groups.set(competency, []);
      }
      groups.get(competency)!.push(statement);
    });

    const ratingOptions = ratingScale.map((scaleOption, index) => ({
      text: scaleOption.label,
      weight: scaleOption.weight,
      value: scaleOption.weight.toString(),
      seqNo: index + 1,
    }));

    return Array.from(groups.entries()).map(([competency, statements], idx) => ({
      title: competency,
      uniqueOrder: idx,
      questions: statements.map((statement: string, questionIndex: number) => ({
        text: statement,
        type: 'RATING_SCALE',
        uniqueOrder: questionIndex,
        weightageEnabled: true,
        showWeightage: true,
        displayFormat: 'matrix',
        options: ratingOptions,
        validations: {
          required: true,
        },
      })),
    }));
  }

  private buildQualitativePage(payload: any) {
    const sheets = payload?.sheets || [];
    const qualitativeSheet = sheets.find((sheet: any) =>
      sheet.name?.toLowerCase().includes('qualitative'),
    );
    if (!qualitativeSheet) {
      return null;
    }

    const statementKey =
      qualitativeSheet.headers?.find((header: string) =>
        header.toLowerCase().includes('statement'),
      ) || 'Statements';

    const qualitativeQuestions = (qualitativeSheet.rows || [])
      .map((row: Record<string, any>, index: number) => {
        const prompt = row[statementKey]?.toString().trim();
        if (!prompt) {
          return null;
        }
        return {
          text: prompt,
          type: 'LONG_ANSWER',
          uniqueOrder: index,
          validations: {
            required: false,
          },
        };
      })
      .filter(Boolean);

    if (qualitativeQuestions.length === 0) {
      return null;
    }

    return {
      title: 'Open-Ended Questions',
      uniqueOrder: 1000,
      questions: qualitativeQuestions,
    };
  }

  private defaultRatingScale() {
    return [
      { weight: 0, label: 'Cannot Rate' },
      { weight: 1, label: 'Ineffective' },
      { weight: 2, label: 'Somewhat Effective' },
      { weight: 3, label: 'Effective' },
      { weight: 4, label: 'Very Effective' },
      { weight: 5, label: 'Exceptionally Effective' },
    ];
  }

  private buildSurveyBlueprintFromWorkbook(workbook: XLSX.WorkBook) {
    this.logger.debug(
      `[SurveyUpload] Building survey blueprint | sheets=${workbook.SheetNames.join(', ')}`,
    );
    const ratingScaleResult = this.extractRatingScaleFromWorkbook(workbook);
    const ratingScale = ratingScaleResult.scale;
    const ratingScaleProvided = ratingScaleResult.provided;
    const mcqQuestions = this.buildMcqQuestionsFromWorkbook(workbook, ratingScale, ratingScaleProvided);
    const qualitativeQuestions = this.buildQualitativeQuestionsFromWorkbook(workbook);
    const questions = [...mcqQuestions, ...qualitativeQuestions].map((question, index) => ({
      ...question,
      uniqueOrder: index,
    }));

    this.logger.debug(
      `[SurveyUpload] Parsed sections | ratingOptions=${ratingScale.length} mcq=${mcqQuestions.length} qualitative=${qualitativeQuestions.length}`,
    );

    if (!questions.length) {
      throw new BadRequestException(
        'No questions were detected in the uploaded Excel. Please verify the Feedback Statements - MCQ or Qualitative sheets.',
      );
    }

    const projectDetails = this.extractProjectDetailsFromWorkbook(workbook);
    const communicationTemplates = this.extractCommunicationTemplatesFromWorkbook(workbook);
    const reminderSettings = this.extractReminderSettingsFromWorkbook(workbook);
    const reminderTemplates = this.buildReminderTemplatesFromCommunication(
      communicationTemplates,
      reminderSettings,
    );

    const blueprint = {
      name: projectDetails?.name || '360 Feedback Survey',
      description:
        projectDetails?.description || 'Survey generated automatically from the uploaded Excel template',
      pages: [
        {
          title: projectDetails?.pageTitle || '360 Feedback',
          description: projectDetails?.pageDescription,
          uniqueOrder: 0,
          questions,
        },
      ],
      questionCount: questions.length,
      reminderTemplates,
      communicationTemplates,
      reminderSettings,
      projectDetails,
      ratingScale: ratingScaleProvided
        ? ratingScale.map((entry) => ({
          weight: entry.weight,
          label: entry.label,
        }))
        : undefined,
    };
    this.logger.debug(
      `[SurveyUpload] Blueprint ready | name=${blueprint.name} pages=${blueprint.pages.length} questions=${blueprint.questionCount}`,
    );
    return blueprint;
  }

  private findSheet(workbook: XLSX.WorkBook, keyword: string) {
    const sheetName = workbook.SheetNames.find((name) =>
      name.toLowerCase().includes(keyword.toLowerCase()),
    );
    return sheetName ? workbook.Sheets[sheetName] : undefined;
  }

  private sheetToMatrix(sheet?: XLSX.WorkSheet) {
    if (!sheet) {
      return [];
    }
    return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][];
  }

  private normalizeHeader(header: any) {
    return header?.toString().trim().toLowerCase();
  }

  private extractRatingScaleFromWorkbook(workbook: XLSX.WorkBook): {
    scale: Array<{ weight: number; label: string }>;
    provided: boolean;
  } {
    const sheet = this.findSheet(workbook, 'rating');
    const matrix = this.sheetToMatrix(sheet);
    if (!matrix.length) {
      this.logger.warn('[SurveyUpload] Rating scale sheet missing; using defaults');
      return { scale: this.defaultRatingScale(), provided: false };
    }
    const headerRow = matrix.find((row) =>
      row.some((cell) => this.normalizeHeader(cell)?.includes('weight')),
    );
    const headers = headerRow || matrix[0];
    const normalizedHeaders = headers.map((header, index) => ({
      index,
      value: this.normalizeHeader(header),
    }));

    const weightIdx =
      normalizedHeaders.find((header) => header.value?.includes('weight'))?.index ?? 0;
    const labelIdx =
      normalizedHeaders.find((header) => header.value?.includes('label'))?.index ??
      normalizedHeaders.find((header) => header.value?.includes('rating'))?.index ??
      (headers.length > 1 ? 1 : 0);

    const rowsStartIndex = matrix.indexOf(headerRow || headers) + 1;
    const rows = matrix.slice(rowsStartIndex);
    const parsed: Array<{ weight: number; label: string }> = rows
      .map((row) => {
        const rawWeight = row[weightIdx];
        const labelRaw = row[labelIdx];
        const weightValue = rawWeight?.toString().trim();
        if (!weightValue) {
          return null;
        }
        const parsedWeight = Number(weightValue);
        if (!Number.isFinite(parsedWeight)) {
          return null;
        }
        const label = labelRaw?.toString().trim();
        if (!label) {
          return null;
        }
        return { weight: parsedWeight, label };
      })
      .filter(Boolean) as Array<{ weight: number; label: string }>;

    if (!parsed.length) {
      this.logger.warn('[SurveyUpload] Rating scale rows invalid; using defaults');
      return { scale: this.defaultRatingScale(), provided: false };
    }

    const zeroWeightOption = parsed.find((entry) => {
      if (entry.weight !== 0) {
        return false;
      }
      const normalizedLabel = this.normalizeHeader(entry.label);
      return (
        normalizedLabel?.includes('cannot rate') ||
        normalizedLabel?.includes('not observed') ||
        normalizedLabel?.includes('not applicable')
      );
    });
    const positiveEntries = parsed.filter((entry) => entry.weight > 0);

    const cannotRateConfig = zeroWeightOption
      ? { include: true, label: zeroWeightOption.label }
      : this.extractCannotRateConfig(rows);

    if (!positiveEntries.length) {
      this.logger.warn('[SurveyUpload] Rating scale has no weighted options; using defaults');
      return { scale: this.defaultRatingScale(), provided: false };
    }

    const finalScale = cannotRateConfig.include
      ? [{ weight: 0, label: cannotRateConfig.label || 'Cannot Rate' }, ...positiveEntries]
      : positiveEntries;

    this.logger.debug(`[SurveyUpload] Rating scale parsed with ${finalScale.length} rows`);
    return { scale: finalScale, provided: true };
  }

  private extractCannotRateConfig(rows: string[][]): { include: boolean; label?: string } {
    const keywordConfigs = [
      { match: 'cannot rate', fallback: 'Cannot Rate' },
      { match: 'not observed', fallback: 'Not Observed' },
      { match: 'not applicable', fallback: 'Not Applicable' },
    ];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (!row || !row.length) {
        continue;
      }

      const cells = row.map((cell, idx) => ({
        index: idx,
        raw: cell,
        normalized: this.normalizeHeader(cell),
      }));

      const keywordCell = cells.find((cell) =>
        cell.normalized
          ? keywordConfigs.some((keyword) => cell.normalized!.includes(keyword.match))
          : false,
      );

      if (!keywordCell) {
        continue;
      }

      const matchedKeyword =
        keywordConfigs.find((keyword) => keywordCell.normalized!.includes(keyword.match)) ?? null;
      const resolvedLabel = keywordCell.raw?.toString().trim() || matchedKeyword?.fallback || 'Cannot Rate';

      const decisionCell = cells.find(
        (cell) =>
          cell.index !== keywordCell.index &&
          (cell.normalized === 'yes' || cell.normalized === 'no'),
      );

      if (decisionCell) {
        return { include: decisionCell.normalized === 'yes', label: resolvedLabel };
      }

      for (let futureIndex = rowIndex + 1; futureIndex < rows.length; futureIndex++) {
        const futureRow = rows[futureIndex];
        if (!futureRow || !futureRow.length) {
          continue;
        }

        const futureCells = futureRow.map((cell) => ({
          raw: cell,
          normalized: this.normalizeHeader(cell),
        }));

        const futureHasKeyword = futureCells.some((cell) =>
          cell.normalized
            ? keywordConfigs.some((keyword) => cell.normalized!.includes(keyword.match))
            : false,
        );

        if (futureHasKeyword) {
          break;
        }

        const futureDecision = futureCells.find(
          (cell) => cell.normalized === 'yes' || cell.normalized === 'no',
        );

        if (futureDecision) {
          return { include: futureDecision.normalized === 'yes', label: resolvedLabel };
        }
      }
    }

    return { include: false, label: undefined };
  }

  private buildMcqQuestionsFromWorkbook(
    workbook: XLSX.WorkBook,
    optionsSource: Array<{ weight: number; label: string }>,
    ratingScaleProvided: boolean,
  ) {
    const sheet = this.findSheet(workbook, 'feedback');
    const matrix = this.sheetToMatrix(sheet);
    if (!matrix.length) {
      this.logger.warn('[SurveyUpload] Feedback Statements sheet empty');
      return [];
    }
    const headers = matrix[0];
    const normalizedHeaders = headers.map((header, index) => ({
      index,
      value: this.normalizeHeader(header),
    }));
    const competencyIdx =
      normalizedHeaders.find((header) => header.value?.includes('competency'))?.index ??
      normalizedHeaders.find((header) => header.value?.includes('theme'))?.index ??
      (headers.length > 1 ? 1 : 0);
    const statementIdx =
      normalizedHeaders.find((header) => header.value?.includes('statement'))?.index ??
      normalizedHeaders.find((header) => header.value?.includes('question'))?.index ??
      (headers.length > 0 ? headers.length - 1 : 0);

    const questionOptions =
      optionsSource.length > 0
        ? optionsSource.map((option, index) => ({
          text: option.label,
          seqNo: index + 1,
          uniqueOrder: index,
          weight: option.weight,
          value: (option.weight ?? index + 1).toString(),
        }))
        : [
          { text: 'Yes', seqNo: 1, uniqueOrder: 0, weight: 1, value: '1' },
          { text: 'No', seqNo: 2, uniqueOrder: 1, weight: 0, value: '0' },
        ];

    const ratingColumnsSource = questionOptions.length ? questionOptions : optionsSource;

    const ratingColumns = ratingColumnsSource.map((option: any, index: number) => ({
      text: option.label || option.text,
      uniqueOrder: (option.uniqueOrder ?? index).toString(),
      seqNo: option.seqNo ?? index + 1,
      weight:
        typeof option.weight === 'number'
          ? option.weight
          : Number(option.weight) || index + 1,
      value:
        option.value?.toString() ??
        option.seqNo?.toString() ??
        option.uniqueOrder?.toString() ??
        (index + 1).toString(),
    }));

    const groupedStatements = matrix.slice(1).reduce((acc: Map<string, string[]>, row) => {
      const competency = row[competencyIdx]?.toString().trim();
      const statement = row[statementIdx]?.toString().trim();
      if (!competency || !statement) {
        return acc;
      }
      if (!acc.has(competency)) {
        acc.set(competency, []);
      }
      acc.get(competency)!.push(statement);
      return acc;
    }, new Map<string, string[]>());

    const generated = Array.from(groupedStatements.entries()).map(([competency, statements], index) => {
      const normalizedColumns = ratingColumns.map((column, columnIndex) => ({
        ...column,
        uniqueOrder: column.uniqueOrder ?? columnIndex.toString(),
      }));

      return {
        text: competency,
        type: 'MATRIX_RADIO_BOX',
        displayFormat: 'matrix',
        mandatoryEnabled: true,
        columnRandomEnabled: false,
        columnRandomizationType: null,
        gridRows: statements.map((statement, rowIndex) => ({
          text: statement,
          uniqueOrder: rowIndex.toString(),
        })),
        columns: normalizedColumns.map((column) => ({ ...column })),
        gridColumns: normalizedColumns.map((column) => ({ ...column })),
        metadata: {
          matrixRows: statements,
          matrixColumns: normalizedColumns.map((column) => column.text),
          ratingScale: normalizedColumns.map((column) => ({
            label: column.text,
            weight: column.weight,
            value: column.value,
          })),
        },
        weightageEnabled: true,
        showWeightage: true,
        uniqueOrder: index,
      };
    });

    this.logger.debug(
      `[SurveyUpload] Matrix questions generated: ${generated.length} competencies (rows processed: ${matrix.length - 1
      })`,
    );
    return generated;
  }

  private buildQualitativeQuestionsFromWorkbook(workbook: XLSX.WorkBook) {
    const sheet = this.findSheet(workbook, 'qualitative');
    const matrix = this.sheetToMatrix(sheet);
    if (!matrix.length) {
      this.logger.warn('[SurveyUpload] Qualitative sheet empty');
      return [];
    }
    const headers = matrix[0];
    const normalizedHeaders = headers.map((header, index) => ({
      index,
      value: this.normalizeHeader(header),
    }));
    const statementIdx =
      normalizedHeaders.find((header) => header.value === 'statements')?.index ??
      normalizedHeaders.find(
        (header) => header.value?.includes('statement') && !header.value?.includes('type'),
      )?.index ??
      normalizedHeaders.find((header) => header.value?.includes('question'))?.index ??
      normalizedHeaders.find((header) => header.value?.includes('prompt'))?.index ??
      (headers.length > 1 ? 1 : 0);

    let uniqueCounter = 0;
    const generated = matrix.slice(1).reduce((acc: any[], row) => {
      const prompt = row[statementIdx]?.toString().trim();
      if (!prompt) {
        return acc;
      }
      acc.push({
        text: prompt,
        type: 'LONG_ANSWER',
        uniqueOrder: uniqueCounter++,
        mandatoryEnabled: false,
      });
      return acc;
    }, []);

    this.logger.debug(
      `[SurveyUpload] Qualitative questions generated: ${generated.length} (rows processed: ${matrix.length - 1
      })`,
    );
    return generated;
  }

  private extractProjectDetailsFromWorkbook(workbook: XLSX.WorkBook) {
    const sheet = this.findSheet(workbook, 'project');
    const matrix = this.sheetToMatrix(sheet);
    if (!matrix.length) {
      this.logger.warn('[SurveyUpload] Project details sheet missing');
      return undefined;
    }
    const details: Record<string, any> = {};
    matrix.forEach((row) => {
      const key = row[0]?.toString().trim();
      const value = row[1]?.toString().trim();
      if (key) {
        details[this.normalizeHeader(key) || key] = value;
      }
    });

    const surveyName =
      details['name of project'] ||
      details['name_of_project'] ||
      details['project name'] ||
      details['360° feedback project details'] ||
      details['360 feedback project details'] ||
      Object.values(details)[0];

    const pageDescription = details['company'] || details['contact name'];

    this.logger.debug(
      `[SurveyUpload] Project details parsed | name=${surveyName} company=${details['company']}`,
    );

    return {
      name: surveyName,
      description: details['company']
        ? `${details['company']} ${details['contact name'] || ''}`.trim()
        : undefined,
      pageTitle: surveyName || '360 Feedback',
      pageDescription,
      raw: details,
      ...details,
    };
  }

  private extractCommunicationTemplatesFromWorkbook(workbook: XLSX.WorkBook) {
    const sheet = this.findSheet(workbook, 'communication');
    const matrix = this.sheetToMatrix(sheet);
    if (!matrix.length) {
      this.logger.warn('[SurveyUpload] Communication sheet missing');
      return {};
    }

    const templates = {
      participantInvite: this.extractTemplateBlock(matrix, 'PARTICIPANT INVITE MAIL'),
      respondentInvite: this.extractTemplateBlock(matrix, 'RESPONDENT INVITE MAIL'),
      respondentReminder: this.extractTemplateBlock(matrix, 'RESPONDENT REMINDER MAIL'),
      respondentCancellation: this.extractTemplateBlock(matrix, 'RESPONDENT CANCELLATION MAIL'),
    };
    this.logger.debug(
      `[SurveyUpload] Communication templates extracted: ${Object.entries(templates)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
        .join(', ')}`,
    );
    return templates;
  }

  private extractTemplateBlock(matrix: string[][], marker: string) {
    const markerIndex = matrix.findIndex((row) =>
      row.some((cell) => cell?.toString().toUpperCase().includes(marker)),
    );
    if (markerIndex === -1) {
      this.logger.debug(`[SurveyUpload] Template marker not found: ${marker}`);
      return undefined;
    }

    const block: string[] = [];
    for (let i = markerIndex + 1; i < matrix.length; i += 1) {
      const rowText = matrix[i].map((cell) => cell?.toString().trim()).filter(Boolean).join(' ');
      if (!rowText) {
        if (block.length) {
          break;
        }
        continue;
      }
      if (rowText.toUpperCase().includes('PLEASE DO NOT CHANGE')) {
        break;
      }
      block.push(rowText);
    }

    if (!block.length) {
      return undefined;
    }

    const subjectIndex = block.findIndex((line) => line.toUpperCase().startsWith('SUBJECT'));

    let subject = marker;
    let bodyLines = block;

    if (subjectIndex !== -1) {
      const subjectLine = block[subjectIndex];
      subject = subjectLine.replace(/subject\s*:?/i, '').trim();
      // Only keep lines AFTER the subject line, ignoring everything before it
      bodyLines = block.slice(subjectIndex + 1);
    }

    const textBody = bodyLines.join('\n');
    const htmlBody = bodyLines.map((line) => `<p>${this.escapeHtml(line)}</p>`).join('');

    return {
      subject,
      text: textBody,
      html: htmlBody,
    };
  }

  private escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private extractReminderSettingsFromWorkbook(workbook: XLSX.WorkBook) {
    const sheet = this.findSheet(workbook, 'reminders');
    const matrix = this.sheetToMatrix(sheet);
    if (matrix.length < 2) {
      this.logger.warn('[SurveyUpload] Reminder sheet missing or incomplete');
      return undefined;
    }
    const headers = matrix[0];
    const dataRow = matrix[1];

    const toNumber = (value: any) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const getValue = (keyword: string) => {
      const headerIndex = headers.findIndex((header) =>
        header?.toString().toLowerCase().includes(keyword),
      );
      if (headerIndex === -1) {
        return undefined;
      }
      return dataRow[headerIndex];
    };

    const settings = {
      waitBeforeReminderHours: toNumber(getValue('wait')),
      reminderFrequency: getValue('frequency')?.toString(),
      completionStatusDashboard: headers.reduce((acc: Record<string, any>, header, index) => {
        if (!header) {
          return acc;
        }
        acc[header.toString()] = dataRow[index];
        return acc;
      }, {}),
    };
    this.logger.debug(
      `[SurveyUpload] Reminder settings extracted | wait=${settings.waitBeforeReminderHours} frequency=${settings.reminderFrequency}`,
    );
    return settings;
  }

  private buildReminderTemplatesFromCommunication(
    communicationTemplates?: Record<string, { subject: string; html: string }>,
    reminderSettings?: { reminderFrequency?: string },
  ) {
    if (!communicationTemplates?.respondentReminder) {
      this.logger.warn('[SurveyUpload] Reminder template missing in communication sheet');
      return [];
    }

    const templates = [
      {
        type: 'default',
        subject: communicationTemplates.respondentReminder.subject,
        body: communicationTemplates.respondentReminder.html,
        schedule: reminderSettings?.reminderFrequency,
      },
    ];
    this.logger.debug(
      `[SurveyUpload] Reminder templates built | count=${templates.length} schedule=${reminderSettings?.reminderFrequency}`,
    );
    return templates;
  }

  private buildReminderTemplates(payload: any) {
    const reminderSheet = payload?.sheets?.find((sheet: any) =>
      sheet.name?.toLowerCase().includes('reminders'),
    );
    if (!reminderSheet) {
      return [];
    }

    const subjectKey =
      reminderSheet.headers?.find((header: string) => header.toLowerCase().includes('subject')) ||
      reminderSheet.headers?.[0];
    const bodyKey =
      reminderSheet.headers?.find((header: string) => header.toLowerCase().includes('message')) ||
      reminderSheet.headers?.[1];

    return (reminderSheet.rows || [])
      .map((row: Record<string, any>) => {
        const subject = subjectKey ? row[subjectKey]?.toString().trim() : '';
        const body = bodyKey ? row[bodyKey]?.toString().trim() : '';
        if (!subject || !body) {
          return null;
        }
        return {
          type: 'reminder',
          subject,
          body,
          schedule: row['column_4']?.toString().trim() || '',
        };
      })
      .filter(Boolean);
  }

  @Post(':id/invite')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Invite a user to an organization (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Invitation sent successfully' })
  async inviteUser(@Param('id') organizationId: string, @Body() inviteDto: InviteUserDto, @Req() req: any) {
    this.ensureOrganizationAccess(req, organizationId);

    // Check if organization exists
    const organization = await this.organizationsService.findOne(organizationId);

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(inviteDto.email);
    if (existingUser && existingUser.organizationId?.toString() === organizationId) {
      throw new BadRequestException('User is already a member of this organization');
    }

    if (req.user.role !== UserRole.SUPER_ADMIN && inviteDto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only platform super admins can assign the Super Admin role.');
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationTokenExpiry = new Date();
    invitationTokenExpiry.setDate(invitationTokenExpiry.getDate() + INVITATION_EXPIRY_DAYS);

    const targetRole = inviteDto.role || UserRole.PARTICIPANT;
    const requestedPermissions =
      inviteDto.permissions && inviteDto.permissions.length > 0
        ? (inviteDto.permissions as UserPermission[])
        : getDefaultPermissionsForRole(targetRole);
    const targetPermissions = ensureMandatoryPermissions(targetRole, requestedPermissions);

    // Create or update user with invitation details
    const userData: any = {
      email: inviteDto.email.toLowerCase(),
      name: inviteDto.name,
      role: targetRole,
      organizationId: new Types.ObjectId(organizationId),
      invitationToken,
      invitationTokenExpiry,
      invitationAccepted: false,
      verified: false,
      isActive: true,
      permissions: targetPermissions,
      // Password will be set when user accepts invitation
    };

    let user;
    if (existingUser) {
      // Update existing user
      user = await this.usersService.update(existingUser._id.toString(), userData);
    } else {
      // Create new user
      user = await this.usersService.create(userData);
    }

    // Send invitation email
    await this.emailService.sendInvitationEmail(
      inviteDto.email,
      invitationToken,
      organization.name,
      inviteDto.name,
      targetRole,
      INVITATION_EXPIRY_DAYS,
    );

    return {
      message: 'Invitation sent successfully',
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions || [],
        },
      },
    };
  }

  @Patch(':organizationId/users/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Update an organization user (Super Admin or Org Admin)' })
  async updateOrganizationUser(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @Body() updateDto: UpdateOrganizationUserDto,
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);

    if (updateDto.role === UserRole.SUPER_ADMIN && req.user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only platform super admins can assign the Super Admin role.');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.organizationId?.toString() !== organizationId) {
      throw new BadRequestException('User does not belong to this organization');
    }

    const updatedUser = await this.usersService.update(userId, updateDto);

    return {
      message: 'User updated successfully',
      data: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        permissions: updatedUser.permissions || [],
        isActive: updatedUser.isActive,
      },
    };
  }

  @Post(':organizationId/users/:userId/reset-password')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Send a password reset email to an organization user' })
  async resetUserPassword(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    this.ensureOrganizationAccess(req, organizationId);
    const organization = await this.organizationsService.findOne(organizationId);
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.organizationId?.toString() !== organizationId) {
      throw new BadRequestException('User does not belong to this organization');
    }

    if (!user.invitationAccepted) {
      throw new BadRequestException('This user has not accepted their invitation yet.');
    }

    const passwordResetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetTokenExpiry = new Date();
    passwordResetTokenExpiry.setDate(passwordResetTokenExpiry.getDate() + INVITATION_EXPIRY_DAYS);

    await this.usersService.update(userId, {
      passwordResetToken,
      passwordResetTokenExpiry,
    });

    await this.emailService.sendPasswordResetEmail(
      user.email,
      passwordResetToken,
      organization.name,
      user.name,
      INVITATION_EXPIRY_DAYS,
    );

    return {
      message: 'Password reset email sent successfully',
    };
  }

  private ensureOrganizationAccess(req: any, organizationId: string) {
    if (req.user.role === UserRole.SUPER_ADMIN) {
      return;
    }

    const userOrgId =
      req.user.organizationId ||
      req.user.user?.organizationId?.toString() ||
      req.user.user?.organizationId;

    if (!userOrgId || userOrgId.toString() !== organizationId) {
      throw new ForbiddenException('You can only manage your own organization.');
    }
  }
}



