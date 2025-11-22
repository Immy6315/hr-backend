import { Controller, Get, Post, Body, Param, UseGuards, UsePipes, ValidationPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SurveyTemplatesService } from './survey-templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('survey-builder')
@Controller('survey-builder/template')
export class SurveyTemplatesController {
  constructor(private readonly templatesService: SurveyTemplatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create Survey Template' })
  @ApiResponse({ status: 200, description: 'Created Survey Template' })
  async create(@Body() body: { name: string; surveyId: string; description?: string }) {
    const template = await this.templatesService.create(body.name, body.surveyId, body.description);
    return {
      statusCode: 200,
      message: 'Created Survey Template',
      data: {
        name: template.name,
        surveyId: template.surveyId.toString(),
        description: template.description || null,
        id: template._id.toString(),
        isDeleted: template.isDeleted,
        createdAt: (template as any).createdAt || new Date(),
        updatedAt: (template as any).updatedAt || new Date(),
      },
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Template List' })
  @ApiResponse({ status: 200, description: 'List of Templates' })
  async findAll() {
    const templates = await this.templatesService.findAll();
    return {
      statusCode: 200,
      message: 'List of Templates',
      data: templates,
    };
  }

  @Post('surveys')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create Survey from Template' })
  @ApiResponse({ status: 200, description: 'Survey created from template' })
  async createFromTemplate(@Body() body: { templateId: string }, @Req() req: any) {
    return await this.templatesService.createSurveyFromTemplate(body.templateId, req.user.userId);
  }
}

