import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SurveysService } from './surveys.service';
import { SurveyPagesService } from './survey-pages.service';
import { UserSurveysService } from './user-surveys.service';
import { UserSurveyResponsesService } from './user-survey-responses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { CreateResponseDto } from './dto/create-response.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyParticipant } from './schemas/survey-participant.schema';

@ApiTags('survey-collector')
@Controller('survey-collector/surveys')
export class SurveyCollectorController {
  private readonly logger = new Logger(SurveyCollectorController.name);

  constructor(
    private readonly surveysService: SurveysService,
    private readonly surveyPagesService: SurveyPagesService,
    private readonly userSurveysService: UserSurveysService,
    private readonly responsesService: UserSurveyResponsesService,
    @InjectModel(SurveyParticipant.name)
    private readonly participantModel: Model<SurveyParticipant>,
  ) { }

  @Post('auth/login')
  @Public()
  @ApiOperation({ summary: 'Participant login with credentials' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async participantLogin(
    @Body() body: { username: string; password: string },
  ) {
    const { verifyPassword } = await import('./utils/credentials.util');

    try {
      this.logger.log(`Login attempt for username: ${body.username}`);

      // Find all participants by username (email)
      const participants = await this.participantModel.find({
        username: body.username.toLowerCase().trim(),
        isDeleted: false,
      });

      this.logger.log(`Found ${participants?.length || 0} participants for ${body.username}`);

      if (!participants || participants.length === 0) {
        this.logger.warn(`No participants found for ${body.username}`);
        throw new BadRequestException('Invalid credentials');
      }

      // Verify password against the first participant (since they are synced)
      const participant = participants[0];
      this.logger.log(`Verifying password for participant ${participant._id}`);

      const isValid = await verifyPassword(body.password, participant.password);
      this.logger.log(`Password validation result: ${isValid}`);

      if (!isValid) {
        this.logger.warn(`Password mismatch for ${body.username}`);
        throw new BadRequestException('Invalid credentials');
      }

      // Update login status for all
      await this.participantModel.updateMany(
        { username: body.username.toLowerCase().trim(), isDeleted: false },
        { $set: { hasLoggedIn: true } }
      );

      // Fetch survey details for each participant record
      const surveys = (await Promise.all(
        participants.map(async (p) => {
          try {
            const survey = await this.surveysService.findOne(p.surveyId.toString());
            // Filter out deleted or draft surveys
            if (survey.isDeleted || survey.status === 'draft' || survey.status === 'archived') {
              return null;
            }
            return {
              surveyId: p.surveyId.toString(),
              participantId: p._id.toString(),
              surveyName: survey.name,
              status: survey.status,
              dueDate: survey.endDate,
              completionStatus: p.completionStatus,
              isLocked: p.isLocked,
              completedAt: p.surveyCompletedAt,
            };
          } catch (e) {
            return null;
          }
        })
      )).filter(Boolean); // Remove nulls

      // Generate token identifying the user (email)
      const token = Buffer.from(`user:${participant.username}:${Date.now()}`).toString('base64');

      return {
        statusCode: 200,
        message: 'Login successful',
        data: {
          token,
          username: participant.username,
          participantName: participant.participantName,
          surveys,
        },
      };
    } catch (error) {
      this.logger.error(`Login error details: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Participant login error:', error);
      throw new BadRequestException('Invalid credentials');
    }
  }

  @Get('auth/surveys')
  @Public() // We will manually validate the token from the header
  @ApiOperation({ summary: 'Get surveys for authenticated participant' })
  @ApiResponse({ status: 200, description: 'List of assigned surveys' })
  async getParticipantSurveys(@Req() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];
    let username: string;

    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      // Format: user:email:timestamp
      const parts = decoded.split(':');
      if (parts[0] !== 'user' || !parts[1]) {
        throw new Error('Invalid token format');
      }
      username = parts[1];
    } catch (e) {
      throw new BadRequestException('Invalid token');
    }

    // Find all participants by username (email)
    const participants = await this.participantModel.find({
      username: username.toLowerCase().trim(),
      isDeleted: false,
    });

    if (!participants || participants.length === 0) {
      return {
        message: 'Surveys fetched successfully',
        data: [],
      };
    }

    const surveys = (await Promise.all(
      participants.map(async (p) => {
        try {
          const survey = await this.surveysService.findOne(p.surveyId.toString());
          // Filter out deleted or draft surveys
          if (survey.isDeleted || survey.status === 'draft' || survey.status === 'archived') {
            return null;
          }
          return {
            surveyId: p.surveyId.toString(),
            participantId: p._id.toString(),
            surveyName: survey.name,
            assesseeName: p.participantName,
            relationship: p.relationship,
            status: survey.status,
            dueDate: survey.endDate,
            completionStatus: p.completionStatus,
            isLocked: p.isLocked,
            completedAt: p.surveyCompletedAt,
          };
        } catch (e) {
          return null;
        }
      })
    )).filter(Boolean);

    return {
      message: 'Surveys fetched successfully',
      data: surveys,
    };
  }
  @Get(':surveyId/:pageId?')
  @Public()
  @ApiOperation({ summary: 'Get Survey Collector (with or without pageId)' })
  @ApiParam({ name: 'surveyId', description: 'Survey ID' })
  @ApiParam({ name: 'pageId', required: false, description: 'Page ID (optional)' })
  @ApiResponse({ status: 200, description: 'Survey Found' })
  async getSurveyCollector(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string | undefined,
    @Req() req: any,
    @Query('preview') preview?: string,
    @Query('p') participantId?: string,
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
        // 1. Try to get participant from query param (most reliable for participants)
        if (participantId) {
          const mongoose = await import('mongoose');
          if (mongoose.Types.ObjectId.isValid(participantId)) {
            const participant = await this.participantModel.findById(participantId);
            if (participant && participant.surveyId.toString() === surveyId) {
              userId = participant.respondentEmail; // Use email as identifier

              // Find existing response or create new one
              userSurvey = await this.userSurveysService.findByUserAndSurvey(userId, surveyId);

              if (!userSurvey) {
                // Create new response for participant
                userSurvey = await this.userSurveysService.create(userId, {
                  surveyId,
                  ipAddress: finalIpAddress,
                });

                // Update participant status
                await this.participantModel.findByIdAndUpdate(participantId, {
                  completionStatus: 'In Progress',
                  $inc: { remindersSent: 0 } // Just to trigger update
                });
              }
            }
          }
        }

        // 2. Fallback to JWT if available (for logged in users testing)
        if (!userSurvey && req.user?.userId) {
          userId = req.user.userId;
          userSurvey = await this.userSurveysService.findByUserAndSurvey(userId, surveyId);
        }

        // 3. Create anonymous response if no user identified
        if (!userSurvey && !userId) {
          // For now, we require participant login for this flow
          // But we can support anonymous if needed later
        }

      } catch (error) {
        this.logger.error(`Error handling survey response: ${error.message}`);
      }
    }

    // Get all pages for the survey
    const pages = await this.surveyPagesService.findAll(surveyId);

    // Ensure all questions have stable IDs
    // For matrix rows/columns, we don't save stable IDs to the DB (Mongoose fights us on that)
    // Instead, we generate them on-the-fly in formatQuestionForCollector
    try {
      const crypto = await import('crypto');
      for (const page of pages) {
        let pageUpdated = false;
        const questionsToCheck = page.questions.filter((q: any) => !q.isDeleted);

        questionsToCheck.forEach((q: any, index: number) => {
          // Check if question ID is missing
          if (!q.questionId && !q._id) {
            // Generate stable ID based on page, index, text and type
            const stableId = crypto.createHash('md5')
              .update(`${page._id.toString()}-${index}-${q.text}-${q.type}`)
              .digest('hex');

            q.questionId = stableId;
            pageUpdated = true;
          }
        });

        if (pageUpdated) {
          await page.save();
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to ensure stable question IDs: ${error.message}`);
      // Continue execution - we don't want to block the survey load if this fails,
      // although pre-filling might still be flaky.
    }

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
        this.logger.log(`Fetching responses for UserSurvey: ${userSurvey._id}`);
        existingResponses = await this.responsesService.findByUserSurvey(userSurvey._id.toString());
        this.logger.log(`Found ${existingResponses.length} existing responses`);
        existingResponses.forEach(r => this.logger.log(`Response QID: ${r.questionId}`));
      } catch (error) {
        // No existing responses
        this.logger.log(`No existing responses found for UserSurvey: ${userSurvey._id}`);
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
          const savedResponse = existingResponses.find(
            (r) => r.questionId === questionId || r.questionId === question._id?.toString()
          );

          if (savedResponse) {
            const questionType = question.type || question.questionType;
            let responseValue = savedResponse.response;

            // Format response based on question type
            if (questionType === 'MATRIX_RADIO_BOX' || questionType === 'MATRIX_CHECK_BOX') {
              // For matrix types, response should be array of {rowId, columnId} objects
              if (Array.isArray(responseValue)) {
                formatted.savedResponse = responseValue;
              } else {
                formatted.savedResponse = [];
              }
            } else if (questionType === 'MULTIPLE_CHOICE' || questionType === 'CHECK_BOX') {
              // For multiple choice, response should be array of option IDs
              if (Array.isArray(responseValue)) {
                formatted.savedResponse = responseValue;
              } else {
                formatted.savedResponse = responseValue ? [responseValue] : [];
              }
            } else {
              // For single choice and text inputs, response should be a single value (not array)
              if (Array.isArray(responseValue) && responseValue.length > 0) {
                formatted.savedResponse = responseValue[0];
              } else if (Array.isArray(responseValue) && responseValue.length === 0) {
                formatted.savedResponse = '';
              } else {
                formatted.savedResponse = responseValue || '';
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
        userSurveyId: userSurvey ? userSurvey._id.toString() : null,
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
  @Public()
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

    // Extract participant ID from surveyUrl if present (from ?p=xxx query param)
    let participantId: string | undefined;
    if (surveyUrl) {
      try {
        const url = new URL(surveyUrl, 'http://localhost'); // Base URL for relative paths
        participantId = url.searchParams.get('p') || undefined;
      } catch (e) {
        // Invalid URL, continue without participant ID
      }
    }

    const userId = req.user?.userId; // Optional - can be undefined for IP-based surveys

    // Get or create userSurvey
    let userSurvey;
    let participantUserId: string | undefined;

    // 1. Try participant-based flow first
    if (participantId) {
      try {
        const participant = await this.participantModel.findById(participantId);
        if (participant && participant.surveyId.toString() === surveyId) {
          participantUserId = participant.respondentEmail; // Use email as user identifier
          userSurvey = await this.userSurveysService.findByUserAndSurvey(participantUserId, surveyId);

          if (!userSurvey) {
            userSurvey = await this.userSurveysService.create(participantUserId, {
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
      } catch (error) {
        this.logger.error(`Error loading participant ${participantId}: ${error.message}`);
      }
    }

    // 2. Fallback to authenticated user
    if (!userSurvey && userId) {
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

      // Also update participant record if this is a participant-based survey
      if (participantId) {
        try {
          const participant = await this.participantModel.findById(participantId);

          if (participant && participant.surveyId.toString() === surveyId) {
            participant.completionStatus = 'Completed';
            participant.surveyCompletedAt = new Date();
            participant.isLocked = true; // Lock to prevent re-submission
            participant.completionDate = new Date();
            await participant.save();

            this.logger.log(`Updated participant ${participantId} status to Completed`);
          }
        } catch (error) {
          // Participant tracking is optional, continue if it fails
          this.logger.error(`Failed to update participant status: ${error.message}`);
        }
      }
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

  @Patch(':surveyId/response/auto-save')
  @ApiOperation({ summary: 'Auto-save partial survey responses' })
  @ApiResponse({ status: 200, description: 'Responses auto-saved successfully' })
  async autoSaveResponse(
    @Param('surveyId') surveyId: string,
    @Body() body: {
      responses: Array<{ questionId: string; questionType: string; response: any }>;
      participantId?: string; // For participant-based surveys
    },
    @Req() req: any,
  ) {
    // Get IP address from request
    const ipAddress =
      req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress;

    let finalIpAddress = ipAddress;
    if (ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress === '::ffff:127.0.0.1') {
      finalIpAddress = '127.0.0.1';
    }

    if (!finalIpAddress || finalIpAddress === 'unknown' || finalIpAddress === '') {
      throw new BadRequestException('IP not found. Please check and retry again.');
    }

    const userId = req.user?.userId;

    // Get or create userSurvey
    let userSurvey;
    if (userId) {
      userSurvey = await this.userSurveysService.findByUserAndSurvey(userId, surveyId);
      if (!userSurvey) {
        userSurvey = await this.userSurveysService.create(userId, {
          surveyId,
          ipAddress: finalIpAddress,
        });
      }
    } else {
      userSurvey = await this.userSurveysService.findByIpAndSurvey(finalIpAddress, surveyId);
      if (!userSurvey) {
        userSurvey = await this.userSurveysService.createByIp(finalIpAddress, {
          surveyId,
          ipAddress: finalIpAddress,
        });
      }
    }

    // Check if participant survey is locked (for participant-based surveys)
    if (body.participantId) {
      const { InjectModel } = await import('@nestjs/mongoose');
      const { Model } = await import('mongoose');
      // We need to check if participant is locked
      // This would require access to SurveyParticipant model
      // For now, we'll skip this check and add it later
    }

    // Auto-save each response (create or update)
    const savedResponses = [];
    for (const resp of body.responses) {
      let processedResponse = resp.response;

      // Handle MATRIX types
      if (resp.questionType === 'MATRIX_RADIO_BOX' || resp.questionType === 'MATRIX_CHECK_BOX') {
        if (Array.isArray(resp.response) && resp.response.length > 0) {
          if (resp.response[0].id) {
            processedResponse = resp.response.map((item: any) => item.id);
          } else {
            processedResponse = resp.response.map((item: any) => ({
              rowId: item.rowId,
              columnId: item.columnId,
            }));
          }
        }
      }

      // Check if response exists
      const existingResponse = await this.responsesService.findAll(
        userSurvey._id.toString(),
        undefined,
        resp.questionId,
      );

      let response;
      if (existingResponse.length > 0) {
        // Update existing
        const existing = existingResponse[0];
        existing.response = processedResponse;
        existing.answeredAt = new Date();
        response = await existing.save();
      } else {
        // Create new
        response = await this.responsesService.create(userId || undefined, {
          userSurveyId: userSurvey._id.toString(),
          questionId: resp.questionId,
          questionType: resp.questionType,
          response: processedResponse,
        });
      }
      savedResponses.push(response);
    }

    // Update participant status to "In Progress" if this is their first save
    if (body.participantId) {
      try {
        const mongoose = await import('mongoose');
        const participantModel = mongoose.model('SurveyParticipant');
        const participant = await participantModel.findById(body.participantId);

        if (participant && participant.completionStatus === 'Yet To Start') {
          participant.completionStatus = 'In Progress';
          participant.surveyStartedAt = new Date();
          await participant.save();
        }
      } catch (error) {
        // Participant tracking is optional, continue if it fails
      }
    }

    return {
      statusCode: 200,
      message: 'Responses auto-saved successfully',
      data: {
        savedCount: savedResponses.length,
        userSurveyId: userSurvey._id.toString(),
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
        const crypto = require('crypto');
        const questionId = question.questionId || question._id?.toString();

        formatted.row = resolvedRows.map((row: any, index: number) => {
          const rowText = row.text || row.label || row.statement || row.msg || `Statement ${index + 1}`;
          // Generate stable ID based on question ID, row index, and row text
          const stableRowId = crypto.createHash('md5')
            .update(`${questionId}-row-${index}-${rowText}`)
            .digest('hex');

          return {
            id: stableRowId,
            questionId: questionId,
            text: rowText,
            uniqueOrder: row.uniqueOrder?.toString() ?? row.order?.toString() ?? row.seqNo?.toString() ?? `${index}`,
            columnsId: row.columnsId || [],
            score: row.score || [],
            createdAt: row.createdAt || new Date(),
            updatedAt: row.updatedAt || new Date(),
          };
        });
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
        const crypto = require('crypto');
        const questionId = question.questionId || question._id?.toString();

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

          const colText = col.text || col.label || col.description || (typeof col === 'string' ? col : '');
          // Generate stable ID based on question ID, column index, and column text
          const stableColId = crypto.createHash('md5')
            .update(`${questionId}-column-${index}-${colText}`)
            .digest('hex');

          return {
            id: stableColId,
            text: colText,
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

  @Get('test/responses/:userSurveyId')
  @Public()
  async testGetResponses(@Param('userSurveyId') userSurveyId: string) {
    const responses = await this.responsesService.findByUserSurvey(userSurveyId);
    return {
      count: responses.length,
      responses,
    };
  }
}
