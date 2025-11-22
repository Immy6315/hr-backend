import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SurveysService } from './surveys.service';
import { SurveyPagesService } from './survey-pages.service';
import { UserSurveysService } from './user-surveys.service';
import { UserSurveyResponsesService } from './user-survey-responses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateResponseDto } from './dto/create-response.dto';
import { Types } from 'mongoose';

@ApiTags('survey-collector')
@Controller('survey-collector/surveys')
export class SurveyCollectorController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly surveyPagesService: SurveyPagesService,
    private readonly userSurveysService: UserSurveysService,
    private readonly responsesService: UserSurveyResponsesService,
  ) {}

  @Get(':surveyId/:pageId?')
  @ApiOperation({ summary: 'Get Survey Collector (with or without pageId)' })
  @ApiParam({ name: 'surveyId', description: 'Survey ID' })
  @ApiParam({ name: 'pageId', required: false, description: 'Page ID (optional)' })
  @ApiResponse({ status: 200, description: 'Survey Found' })
  async getSurveyCollector(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string | undefined,
    @Req() req: any,
    @Query('preview') preview?: string,
  ) {
    const referer = req.headers?.referer || req.headers?.origin || '';
    const headerPreview = req.headers?.['x-preview-mode'];
    const isPreviewRequest =
      preview === 'true' ||
      headerPreview === 'true' ||
      (typeof referer === 'string' && referer.includes('preview=true'));

    // Get IP address from request
    const ipAddress = req.ip || 
                     req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress;

    // Handle localhost IPs - convert to a standard format
    let finalIpAddress = ipAddress;
    if (ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress === '::ffff:127.0.0.1') {
      finalIpAddress = '127.0.0.1'; // Standardize localhost IP
    }

    // Validate IP address
    if (!finalIpAddress || finalIpAddress === 'unknown' || finalIpAddress === '') {
      throw new BadRequestException('IP not found. Please check and retry again.');
    }

    // Increment visit count only for real collector visits (skip preview traffic)
    if (!isPreviewRequest) {
    await this.surveysService.incrementVisitCount(surveyId);
    }
    
    const survey = await this.surveysService.findOne(surveyId);

    // Get or create userSurvey
    let userSurvey;
    let userId: string | undefined;
    let token: string | undefined;

    if (!isPreviewRequest) {
    try {
      // Try to get user from JWT if available
      if (req.user?.userId) {
        userId = req.user.userId;
        userSurvey = await this.userSurveysService.findByUserAndSurvey(userId, surveyId);
        if (!userSurvey) {
          userSurvey = await this.userSurveysService.create(userId, {
            surveyId,
            ipAddress,
          });
        }
        // Generate token for user
        token = 'token-placeholder'; // You can generate JWT here if needed
      } else {
        // IP-based survey (no user authentication)
        // Check if UserSurvey exists for this IP
        userSurvey = await this.userSurveysService.findByIpAndSurvey(finalIpAddress, surveyId);
        
        if (!userSurvey) {
          // Create new UserSurvey by IP
          userSurvey = await this.userSurveysService.createByIp(finalIpAddress, {
            surveyId,
            ipAddress: finalIpAddress,
          });
        } else {
          // Return existing UserSurvey - load existing responses
          // This will be handled in the response below
        }
      }
    } catch (error) {
      // If error is BadRequestException, rethrow it
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Other errors - continue without userSurvey
      }
    }

    // Get pages
    const pages = await this.surveyPagesService.findAll(surveyId);

    // Determine which page to return
    let currentPage;
    let currentPageIndex = 0;

    if (pageId) {
      currentPage = pages.find((p) => p._id.toString() === pageId);
      if (currentPage) {
        currentPageIndex = pages.findIndex((p) => p._id.toString() === pageId);
      }
    } else {
      // Get first page
      currentPage = pages[0];
      currentPageIndex = 0;
    }

    if (!currentPage) {
      throw new Error('Page not found');
    }

    // Load existing responses if UserSurvey exists
    let existingResponses: any[] = [];
    if (userSurvey) {
      try {
        existingResponses = await this.responsesService.findByUserSurvey(userSurvey._id.toString());
      } catch (error) {
        // No existing responses
      }
    }

    // Format page response with existing responses
    const formattedPage = {
      id: currentPage._id.toString(),
      title: currentPage.title,
      description: currentPage.description,
      uniqueOrder: currentPage.uniqueOrder,
      surveyId: currentPage.surveyId.toString(),
      isDeleted: currentPage.isDeleted,
      createdAt: currentPage.createdAt,
      updatedAt: currentPage.updatedAt,
      questions: currentPage.questions
        .filter((q: any) => !q.isDeleted)
        .map((question: any) => {
          const formatted = this.formatQuestionForCollector(question, currentPage._id.toString());
          // Add existing response if available
          const questionId = question.questionId || question._id?.toString();
          const existingResponse = existingResponses.find(
            (r) => r.questionId === questionId || r.questionId === question._id?.toString()
          );
          if (existingResponse) {
            const questionType = question.type || question.questionType;
            let responseValue = existingResponse.response;
            
            // Format response based on question type
            if (questionType === 'MATRIX_RADIO_BOX' || questionType === 'MATRIX_CHECK_BOX') {
              // For matrix types, response should be array of {rowId, columnId} objects
              if (Array.isArray(responseValue)) {
                formatted.existingResponse = responseValue;
              } else {
                formatted.existingResponse = [];
              }
            } else if (questionType === 'MULTIPLE_CHOICE' || questionType === 'CHECK_BOX') {
              // For multiple choice, response should be array of option IDs
              if (Array.isArray(responseValue)) {
                formatted.existingResponse = responseValue;
              } else {
                formatted.existingResponse = responseValue ? [responseValue] : [];
              }
            } else {
              // For single choice and text inputs, response should be a single value (not array)
              if (Array.isArray(responseValue) && responseValue.length > 0) {
                formatted.existingResponse = responseValue[0];
              } else if (Array.isArray(responseValue) && responseValue.length === 0) {
                formatted.existingResponse = '';
              } else {
                formatted.existingResponse = responseValue || '';
              }
            }
          }
          return formatted;
        }),
    };

    // Get previous and next page IDs
    const previousPageId =
      currentPageIndex > 0 ? pages[currentPageIndex - 1]._id.toString() : null;
    const nextPageId =
      currentPageIndex < pages.length - 1 ? pages[currentPageIndex + 1]._id.toString() : null;
    const currentPageNumber = currentPageIndex + 1;

    return {
      statusCode: 200,
      message: 'Survey Found',
      data: {
        id: survey._id ? survey._id.toString() : surveyId,
        name: survey.name,
        description: survey.description || null,
        category: survey.category,
        status: survey.status,
        isDeleted: survey.isDeleted,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
        ratingScale: survey.ratingScale || [],
        ratingScaleSource: survey.ratingScale?.map((entry, index) => ({
          scale: entry.weight ?? entry.value ?? index,
          description: entry.label,
        })) || [],
        settings: {
          sid: 0,
          surveyId: survey._id ? survey._id.toString() : surveyId,
          headerEnabled: false,
          headerLogoUrl: null,
          introductionPageEnabled: false,
          introductionPageDescription: null,
          termsConditionsEnabled: false,
          termsConditionsDescription: null,
          endDateEnabled: false,
          endDate: null,
          responseLimitEnabled: false,
          responseLimit: null,
          timeLimitEnabled: false,
          timeLimit: null,
          createdAt: survey.createdAt,
          updatedAt: survey.updatedAt,
        },
        token: token || null,
        userId: userId || null,
        page: formattedPage,
        totalPages: pages.length,
        currentPageNumber,
        previousPageId,
        nextPageId,
      },
    };
  }

  @Post(':surveyId/response')
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create Survey Response' })
  @ApiResponse({ status: 200, description: 'Created User Response' })
  async createResponse(
    @Param('surveyId') surveyId: string,
    @Body() body: { 
      responses: Array<{ questionId: string; questionType: string; response: any }>;
      isComplete?: boolean;
      userAgent?: string;
      surveyUrl?: string;
      collector?: string;
      tags?: string[];
    },
    @Req() req: any,
  ) {
    // Get IP address from request
    const ipAddress = req.ip || 
                     req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress;

    // Handle localhost IPs - convert to a standard format
    let finalIpAddress = ipAddress;
    if (ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress === '::ffff:127.0.0.1') {
      finalIpAddress = '127.0.0.1'; // Standardize localhost IP
    }

    // Validate IP address
    if (!finalIpAddress || finalIpAddress === 'unknown' || finalIpAddress === '') {
      throw new BadRequestException('IP not found. Please check and retry again.');
    }

    // Get user agent from request headers
    const userAgent = body.userAgent || req.headers['user-agent'] || 'Unknown';

    // Get survey URL from request or body
    const surveyUrl = body.surveyUrl || req.headers['referer'] || `${req.protocol}://${req.get('host')}/survey/${surveyId}`;

    const userId = req.user?.userId; // Optional - can be undefined for IP-based surveys

    // Get or create userSurvey
    let userSurvey;
    if (userId) {
      // User authenticated - use userId
      userSurvey = await this.userSurveysService.findByUserAndSurvey(userId, surveyId);
      if (!userSurvey) {
        userSurvey = await this.userSurveysService.create(userId, {
          surveyId,
          ipAddress: finalIpAddress,
        });
        // Set initial metadata
        userSurvey.userAgent = userAgent;
        userSurvey.surveyUrl = surveyUrl;
        await userSurvey.save();
      } else if (!userSurvey.userAgent) {
        // Update metadata if not set
        userSurvey.userAgent = userAgent;
        userSurvey.surveyUrl = surveyUrl;
        await userSurvey.save();
      }
    } else {
      // IP-based survey (no user authentication)
      userSurvey = await this.userSurveysService.findByIpAndSurvey(finalIpAddress, surveyId);
      if (!userSurvey) {
        userSurvey = await this.userSurveysService.createByIp(finalIpAddress, {
          surveyId,
          ipAddress: finalIpAddress,
        });
        // Set initial metadata
        userSurvey.userAgent = userAgent;
        userSurvey.surveyUrl = surveyUrl;
        await userSurvey.save();
      } else if (!userSurvey.userAgent) {
        // Update metadata if not set
        userSurvey.userAgent = userAgent;
        userSurvey.surveyUrl = surveyUrl;
        await userSurvey.save();
      }
    }

    // Create responses
    const createdResponses = [];
    for (const resp of body.responses) {
      // Handle MATRIX types - response is array of {rowId, columnId} objects
      let processedResponse = resp.response;
      
      if (resp.questionType === 'MATRIX_RADIO_BOX' || resp.questionType === 'MATRIX_CHECK_BOX') {
        // For MATRIX types, extract IDs from response objects
        // Response format: [{rowId, columnId, id?, createdAt?, updatedAt?}, ...]
        // We need to store array of IDs or the full objects
        if (Array.isArray(resp.response) && resp.response.length > 0) {
          // If response contains objects with id field, extract those IDs
          if (resp.response[0].id) {
            processedResponse = resp.response.map((item: any) => item.id);
          } else {
            // Otherwise store the rowId-columnId pairs
            processedResponse = resp.response.map((item: any) => ({
              rowId: item.rowId,
              columnId: item.columnId,
            }));
          }
        }
      }

      // Check if response already exists for this question
      const existingResponse = await this.responsesService.findAll(
        userSurvey._id.toString(),
        undefined,
        resp.questionId,
      );

      let response;
      if (existingResponse.length > 0) {
        // Update existing response
        const existing = existingResponse[0];
        existing.response = processedResponse;
        existing.answeredAt = new Date();
        response = await existing.save();
      } else {
        // Create new response
        response = await this.responsesService.create(userId || userSurvey.userId?.toString() || undefined, {
          userSurveyId: userSurvey._id.toString(),
          questionId: resp.questionId,
          questionType: resp.questionType,
          response: processedResponse,
        });
      }
      createdResponses.push(response);
    }

    // If this is the final submission, mark survey as complete with metadata
    if (body.isComplete) {
      await this.userSurveysService.complete(userSurvey._id.toString(), {
        userAgent: userAgent,
        surveyUrl: surveyUrl,
        collector: body.collector || 'Web Link',
        tags: body.tags || [],
      });
      // Reload userSurvey to get updated metadata
      userSurvey = await this.userSurveysService.findOne(userSurvey._id.toString());
    }

    // Format response
    const formattedResponses = await Promise.all(
      createdResponses.map(async (resp) => {
        // Get question details
        const pages = await this.surveyPagesService.findAll(surveyId);
        let questionData = null;

        for (const page of pages) {
          const question = page.questions.find(
            (q: any) => (q.questionId === resp.questionId || q._id?.toString() === resp.questionId) && !q.isDeleted,
          );
          if (question) {
            questionData = this.formatQuestionForCollector(question, page._id.toString());
            break;
          }
        }

        return {
          userId: resp.userId ? resp.userId.toString() : null,
          surveyId: resp.surveyId.toString(),
          userSurveyId: resp.userSurveyId.toString(),
          questionId: resp.questionId,
          questionType: resp.questionType,
          response: Array.isArray(resp.response) ? resp.response : [resp.response],
          otherOption: null,
          commentOption: null,
          id: resp._id.toString(),
          isDeleted: resp.isDeleted,
          createdAt: resp.createdAt,
          updatedAt: resp.updatedAt,
          question: questionData,
        };
      }),
    );

    return {
      statusCode: 200,
      message: 'Created User Response',
      data: {
        userId: userSurvey.userId ? userSurvey.userId.toString() : null,
        surveyId: userSurvey.surveyId.toString(),
        ipAddress: userSurvey.ipAddress || '1',
        id: userSurvey._id.toString(),
        isDeleted: userSurvey.isDeleted,
        createdAt: (userSurvey as any).createdAt || new Date(),
        updatedAt: (userSurvey as any).updatedAt || new Date(),
        responses: formattedResponses,
      },
    };
  }

  @Get(':surveyId/response/:responseId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Survey Response' })
  @ApiResponse({ status: 200, description: 'Survey Found' })
  async getResponse(
    @Param('surveyId') surveyId: string,
    @Param('responseId') responseId: string,
    @Req() req: any,
  ) {
    const userSurvey = await this.userSurveysService.findOne(responseId);
    const survey = await this.surveysService.findOne(surveyId);
    const responses = await this.responsesService.findByUserSurvey(responseId);

    // Get page with questions and responses
    const pages = await this.surveyPagesService.findAll(surveyId);
    const currentPage = pages[0] || null; // Get first page or implement logic to get current page

    if (!currentPage) {
      throw new Error('Page not found');
    }

    // Format questions with responses
    const formattedQuestions = currentPage.questions
      .filter((q: any) => !q.isDeleted)
      .map((question: any) => {
        const questionResponse = responses.find(
          (r) => r.questionId === question.questionId || r.questionId === question._id?.toString(),
        );

        const formatted = this.formatQuestionForCollector(question, currentPage._id.toString());

        if (questionResponse) {
          formatted.response = Array.isArray(questionResponse.response)
            ? questionResponse.response
            : [questionResponse.response];
        }

        return formatted;
      });

    return {
      statusCode: 200,
      message: 'Survey Found',
      data: {
        id: survey._id ? survey._id.toString() : surveyId,
        name: survey.name,
        category: survey.category,
        publicUrl: null,
        privateUrl: null,
        status: survey.status,
        isDeleted: survey.isDeleted,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
        ratingScale: survey.ratingScale || [],
        ratingScaleSource: survey.ratingScale?.map((entry, index) => ({
          scale: entry.weight ?? entry.value ?? index,
          description: entry.label,
        })) || [],
        settings: {
          sid: 0,
          surveyId: survey._id ? survey._id.toString() : surveyId,
          headerEnabled: false,
          headerLogoUrl: null,
          introductionPageEnabled: false,
          introductionPageDescription: null,
          termsConditionsEnabled: false,
          termsConditionsDescription: null,
          endDateEnabled: false,
          endDate: null,
          responseLimitEnabled: false,
          publicEnabled: false,
          privateEnabled: false,
          responseLimit: null,
          timeLimitEnabled: false,
          timeLimit: null,
          createdAt: survey.createdAt,
          updatedAt: survey.updatedAt,
        },
        token: 'token-placeholder',
        userId: userSurvey.userId ? userSurvey.userId.toString() : null,
        userSurveyId: userSurvey._id.toString(),
        page: {
          id: currentPage._id.toString(),
          title: currentPage.title,
          description: currentPage.description,
          uniqueOrder: currentPage.uniqueOrder,
          surveyId: currentPage.surveyId.toString(),
          isDeleted: currentPage.isDeleted,
          createdAt: (currentPage as any).createdAt || new Date(),
          updatedAt: (currentPage as any).updatedAt || new Date(),
          questions: formattedQuestions,
        },
        pageNo: 0,
        totalPages: pages.length,
        totalQuestions: formattedQuestions.length,
        nextPageId: pages.length > 1 ? pages[1]._id.toString() : null,
        previousPageId: null,
      },
    };
  }

  @Delete(':surveyId/response/:responseId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete Survey Response' })
  @ApiResponse({ status: 200, description: 'User Survey Response Deleted' })
  async deleteResponse(
    @Param('surveyId') surveyId: string,
    @Param('responseId') responseId: string,
  ) {
    await this.userSurveysService.remove(responseId);
    return {
      statusCode: 200,
      message: 'User Survey Response Deleted',
    };
  }

  @Put(':surveyId/response/:responseId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update Survey Response' })
  @ApiResponse({ status: 200, description: 'User Survey Response Updated' })
  async updateResponse(
    @Param('surveyId') surveyId: string,
    @Param('responseId') responseId: string,
    @Body() body: { responses: Array<{ questionId: string; questionType: string; response: any }> },
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    const userSurvey = await this.userSurveysService.findOne(responseId);

    // Update each response
    for (const resp of body.responses) {
      const existingResponse = await this.responsesService.findAll(
        responseId,
        undefined,
        resp.questionId,
      );

      if (existingResponse.length > 0) {
        // Update existing response
        await this.responsesService.create(userId, {
          userSurveyId: responseId,
          questionId: resp.questionId,
          questionType: resp.questionType,
          response: resp.response,
        });
      }
    }

    return {
      statusCode: 200,
      message: 'User Survey Response Updated',
    };
  }

  private formatQuestionForCollector(question: any, pageId: string): any {
    const formatted: any = {
      id: question.questionId || question._id?.toString() || this.generateId(),
      surveyPageId: pageId,
      text: question.text,
      type: question.type,
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
      uniqueOrder: question.uniqueOrder,
      answerWidth: question.answerWidth || null,
      initialMsg: question.initialMsg || null,
      displayFormat: question.displayFormat || null,
      weightageEnabled: question.weightageEnabled || false,
      showWeightage: question.showWeightage || false,
      isDeleted: question.isDeleted || false,
      createdAt: question.createdAt || new Date(),
      updatedAt: question.updatedAt || new Date(),
    };

    // Add MATRIX-specific fields
    if (question.type === 'MATRIX_CHECK_BOX' || question.type === 'MATRIX_RADIO_BOX') {
      formatted.displayFormat = question.displayFormat || formatted.displayFormat || null;
      formatted.columnRandomEnabled = question.columnRandomEnabled || false;
      formatted.columnRandomizationType = question.columnRandomizationType || null;
      formatted.weightageEnabled = question.weightageEnabled || formatted.weightageEnabled || false;
      formatted.scoreEnabled = question.scoreEnabled || false;
      formatted.score = question.score || null;
    }

    // Add validation
    if (question.validation) {
      formatted.validations = {
        id: this.generateId(),
        questionId: question.questionId || question._id?.toString() || this.generateId(),
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

    if (question.type === 'MATRIX_CHECK_BOX' || question.type === 'MATRIX_RADIO_BOX') {
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
          id: row.id?.toString() || row.rowId?.toString() || row._id?.toString() || this.generateId(),
        questionId: question.questionId || question._id?.toString() || this.generateId(),
          text: row.text || row.label || row.statement || row.msg || `Statement ${index + 1}`,
          uniqueOrder: row.uniqueOrder?.toString() ?? row.order?.toString() ?? row.seqNo?.toString() ?? `${index}`,
        columnsId: row.columnsId || [],
        score: row.score || [],
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
            id: col.id?.toString() || col._id?.toString() || this.generateId(),
            text: col.text || col.label || col.description || (typeof col === 'string' ? col : ''),
            uniqueOrder: col.uniqueOrder?.toString() ?? col.seqNo?.toString() ?? index.toString(),
        mandatoryEnabled: col.mandatoryEnabled || false,
        questionId: col.questionId || null,
        rowId: col.rowId || null,
            weight: numericWeight,
            seqNo: col.seqNo ?? index,
            value: rawValue?.toString() ?? index.toString(),
        createdAt: col.createdAt || new Date(),
        updatedAt: col.updatedAt || new Date(),
          };
        });
        formatted.columns = normalizedColumns;
        formatted.gridColumns = normalizedColumns;
      }
    }

    // Add options for choice-based questions
    if (question.options && question.options.length > 0) {
      formatted.options = question.options
        .filter((opt: any) => !opt.isDeleted)
        .map((opt: any) => ({
          id: this.generateId(),
          text: opt.text,
          seqNo: opt.seqNo || 0,
          uniqueOrder: opt.uniqueOrder || '0',
          value: opt.value || null,
          weight: typeof opt.weight === 'number' ? opt.weight : null,
          mandatoryEnabled: opt.mandatoryEnabled || false,
          preSelected: opt.preSelected || false,
          type: opt.type || null,
          imageUrl: opt.imageUrl || null,
          score: opt.score || null,
          createdAt: opt.createdAt || new Date(),
          updatedAt: opt.updatedAt || new Date(),
        }));
    }

    return formatted;
  }

  private generateId(): string {
    return require('crypto').randomBytes(16).toString('hex');
  }
}

