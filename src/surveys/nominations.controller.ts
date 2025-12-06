import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Request,
    UnauthorizedException,
    NotFoundException,
    BadRequestException,
    Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserSurveysService } from './user-surveys.service';
import { SurveysService } from './surveys.service';
import { AddNomineeDto } from './dto/add-nominee.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyParticipant } from './schemas/survey-participant.schema';
import { Survey } from './schemas/survey.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { SurveyAuditLogService } from './survey-audit-log.service';
import { AuditLogAction, AuditLogEntityType } from './schemas/survey-audit-log.schema';

@ApiTags('Nominations')
@Controller('nominations')
export class NominationsController {
    constructor(
        private readonly userSurveysService: UserSurveysService,
        private readonly surveysService: SurveysService,
        @InjectModel(SurveyParticipant.name) private participantModel: Model<SurveyParticipant>,
        @InjectModel(Survey.name) private surveyModel: Model<Survey>,
        private readonly auditLogService: SurveyAuditLogService,
    ) { }

    @Post('login')
    @ApiOperation({ summary: 'Login to nomination portal' })
    async login(@Body() body: { email: string; surveyId: string }) {
        const { email, surveyId } = body;

        const participant = await this.participantModel.findOne({
            surveyId: new Types.ObjectId(surveyId),
            participantEmail: email,
        }).exec();

        if (!participant) {
            throw new UnauthorizedException('Participant not found in this survey');
        }

        const survey = await this.surveysService.findOne(surveyId);
        if (!survey.nominationConfig?.isOpen) {
            throw new UnauthorizedException('Nominations are closed for this survey');
        }

        // Return simple session info (legacy support)
        return {
            token: Buffer.from(`${email}:${surveyId}`).toString('base64'),
            participant: {
                id: participant._id,
                name: participant.participantName,
                email: participant.participantEmail,
                nominationStatus: participant.nominationStatus || 'not_started',
            },
            survey: {
                id: survey._id,
                title: survey.name,
                config: survey.nominationConfig,
            }
        };
    }

    @Get('config/:surveyId')
    @Public()
    @ApiOperation({ summary: 'Get nomination configuration' })
    async getConfig(@Request() req: any, @Param('surveyId') surveyId: string) {
        // Allow both nomination and participant tokens
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            throw new UnauthorizedException('No authorization token provided');
        }

        const token = authHeader.replace('Bearer ', '');
        console.log('🔑 Config token received:', token);

        // Try to validate - accept either participant token or nomination token
        try {
            // Participant token is base64 encoded "user:email:timestamp"
            const decoded = Buffer.from(token, 'base64').toString('utf-8');
            console.log('🔓 Decoded token:', decoded);

            if (!decoded.includes(':')) {
                throw new UnauthorizedException('Invalid token format');
            }

            // Valid token found
            console.log('✅ Token validated successfully');
        } catch (error) {
            console.error('❌ Token validation failed:', error.message);
            throw new UnauthorizedException('Invalid token');
        }

        const survey = await this.surveysService.findOne(surveyId);
        console.log('📋 Returning nomination config:', survey.nominationConfig);
        return survey.nominationConfig || { isOpen: false };
    }

    private validateToken(req: any): string {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing or invalid authorization header');
        }

        const token = authHeader.split(' ')[1];
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf-8');
            // Support both formats:
            // 1. Participant: user:email:timestamp
            // 2. Nomination: email:surveyId

            const parts = decoded.split(':');
            let email = '';

            if (parts.length === 3 && parts[0] === 'user') {
                email = parts[1];
            } else if (parts.length === 2) {
                email = parts[0];
            } else {
                throw new Error('Invalid token format');
            }

            if (!email) throw new Error('Invalid email in token');

            // Set user on request for convenience
            req.user = { email };
            return email;
        } catch (e) {
            // Log error for debugging (optional)
            // console.error('Token validation failed:', e.message);
            throw new UnauthorizedException('Invalid token: ' + e.message);
        }
    }

    @Get('list')
    @Public()
    @ApiOperation({ summary: 'Get list of nominees' })
    async getNominees(@Request() req: any, @Query('surveyId') surveyId: string) {
        this.validateToken(req);
        if (!surveyId) throw new BadRequestException('Survey ID is required');
        return this.userSurveysService.getNominees(surveyId, req.user.email);
    }

    @Post('add')
    @Public()
    @ApiOperation({ summary: 'Add a nominee' })
    async addNominee(@Request() req: any, @Body() dto: AddNomineeDto, @Query('surveyId') surveyId: string) {
        this.validateToken(req);
        // Support surveyId in body or query
        const sId = surveyId || (dto as any).surveyId;
        if (!sId) throw new BadRequestException('Survey ID is required');

        return this.userSurveysService.addNominee(sId, req.user.email, dto);
    }

    @Delete(':id')
    @Public()
    @ApiOperation({ summary: 'Remove a nominee' })
    async removeNominee(@Request() req: any, @Param('id') id: string) {
        this.validateToken(req);
        return this.userSurveysService.removeNominee(id, req.user.email);
    }

    @Post('submit')
    @Public()
    @ApiOperation({ summary: 'Submit nominations' })
    async submitNominations(@Request() req: any, @Body('surveyId') surveyId: string) {
        this.validateToken(req);
        if (!surveyId) throw new BadRequestException('Survey ID is required');

        const email = req.user.email;

        // Validate requirements
        const survey = await this.surveysService.findOne(surveyId);
        const nominees = await this.userSurveysService.getNominees(surveyId, email);
        const requirements = survey.nominationConfig?.requirements || [];

        for (const req of requirements) {
            const count = nominees.filter(n => n.relationship === req.relationship).length;
            if (count < req.minCount) {
                throw new BadRequestException(`You need to add at least ${req.minCount} ${req.relationship}(s)`);
            }
        }

        // Update status - find participant record that has nominationStatus (was invited)
        console.log(`📝 Submitting nominations for: ${email}`);

        // First, let's find the participant to see what we're working with
        const participant = await this.participantModel.findOne({
            surveyId: new Types.ObjectId(surveyId),
            participantEmail: { $regex: new RegExp(`^${email}$`, 'i') }, // Case-insensitive
            $or: [
                { relationship: 'Self' },
                { respondentEmail: { $regex: new RegExp(`^${email}$`, 'i') } }
            ],
            isDeleted: false
        });

        console.log(`🔍 Found participant:`, participant ? {
            _id: participant._id,
            participantEmail: participant.participantEmail,
            nominationStatus: participant.nominationStatus,
            respondentEmail: participant.respondentEmail
        } : 'NOT FOUND');

        if (!participant) {
            throw new BadRequestException('Participant record not found. Please contact administrator.');
        }

        // Now update using the _id directly
        const updateResult = await this.participantModel.updateOne(
            { _id: participant._id },
            { $set: { nominationStatus: 'submitted' } }
        );

        console.log(`✅ Update complete:`, {
            matched: updateResult.matchedCount,
            modified: updateResult.modifiedCount
        });

        await this.auditLogService.logActivity(
            surveyId,
            { performedBy: email },
            AuditLogAction.NOMINATION_SUBMITTED,
            AuditLogEntityType.NOMINATION,
            {
                entityName: 'Nominations',
                description: `submitted nominations`,
            },
        );

        return { success: true, message: 'Nominations submitted successfully' };
    }
}
