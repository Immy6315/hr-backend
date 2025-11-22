import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SurveyPagesService } from './survey-pages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('survey-builder')
@Controller('survey-builder/surveys/:surveyId/pages')
export class SurveyPagesController {
  constructor(private readonly surveyPagesService: SurveyPagesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create Survey Page' })
  @ApiResponse({ status: 200, description: 'Created Survey Page' })
  async create(
    @Param('surveyId') surveyId: string,
    @Body() body: { title: string; description?: string; uniqueOrder?: string; isDeleted?: boolean },
    @Req() req: any,
  ) {
    const page = await this.surveyPagesService.create(surveyId, body, req.user?.userId);
    return {
      statusCode: 200,
      message: 'Created Survey Page',
      data: {
        id: page._id.toString(),
        title: page.title,
        description: page.description,
        uniqueOrder: page.uniqueOrder,
        surveyId: page.surveyId.toString(),
        isDeleted: page.isDeleted,
      },
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get All Survey Pages' })
  @ApiResponse({ status: 200, description: 'List of Survey Pages' })
  async findAll(@Param('surveyId') surveyId: string) {
    const pages = await this.surveyPagesService.findAll(surveyId);
    const crypto = require('crypto');
    
    // Process pages and save questionId back to database if missing
    const processedPages = await Promise.all(
      pages.map(async (page) => {
        const nonDeletedQuestions = page.questions.filter((q: any) => !q.isDeleted);
        let needsSave = false;
        
        // Check and generate questionId for questions that don't have it
        const questionsWithIds = nonDeletedQuestions.map((q: any, index: number) => {
          // Convert to plain object first to check existing values
          const questionObj = q.toObject ? q.toObject() : { ...q };
          
          // Get or generate questionId
          let questionId = q.questionId || questionObj.questionId || questionObj.id;
          
          if (!questionId) {
            // Generate a stable ID based on page and question index
            questionId = crypto.createHash('md5')
              .update(`${page._id.toString()}-${index}-${questionObj.text}-${questionObj.type}`)
              .digest('hex');
            // Set it on the Mongoose document for saving
            q.questionId = questionId;
            needsSave = true;
          }
          
          // Return object with guaranteed id and questionId
          return {
            ...questionObj,
            id: questionId,
            questionId: questionId,
          };
        });
        
        // Save if any questionId was added
        if (needsSave) {
          await page.save();
        }
        
        return {
        id: page._id.toString(),
        title: page.title,
        description: page.description,
        uniqueOrder: page.uniqueOrder,
        surveyId: page.surveyId.toString(),
        isDeleted: page.isDeleted,
          totalQuestions: nonDeletedQuestions.length,
          questions: questionsWithIds,
        };
      }),
    );
    
    return {
      statusCode: 200,
      message: 'Survey Pages Found',
      data: processedPages,
    };
  }

  @Get(':pageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Survey Page' })
  @ApiResponse({ status: 200, description: 'Survey Page Found' })
  @ApiResponse({ status: 404, description: 'Survey Page not found' })
  async findOne(@Param('surveyId') surveyId: string, @Param('pageId') pageId: string) {
    const page = await this.surveyPagesService.findOne(surveyId, pageId);
    return {
      statusCode: 200,
      message: 'Survey Page Found',
      data: {
        id: page._id.toString(),
        title: page.title,
        description: page.description,
        uniqueOrder: page.uniqueOrder,
        surveyId: page.surveyId.toString(),
        isDeleted: page.isDeleted,
      },
    };
  }

  @Put(':pageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update Survey Page' })
  @ApiResponse({ status: 200, description: 'Survey Page Updated' })
  async update(
    @Param('surveyId') surveyId: string,
    @Param('pageId') pageId: string,
    @Body() body: { title?: string; description?: string; uniqueOrder?: string; isDeleted?: boolean },
    @Req() req: any,
  ) {
    await this.surveyPagesService.update(surveyId, pageId, body, req.user?.userId);
    return {
      statusCode: 200,
      message: 'Survey Page Updated',
    };
  }

  @Delete(':pageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete Survey Page' })
  @ApiResponse({ status: 200, description: 'Survey Page Deleted' })
  async delete(@Param('surveyId') surveyId: string, @Param('pageId') pageId: string, @Req() req: any) {
    await this.surveyPagesService.delete(surveyId, pageId, req.user?.userId);
    return {
      statusCode: 200,
      message: 'Survey Page Deleted',
    };
  }
}

