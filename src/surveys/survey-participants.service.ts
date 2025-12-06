import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { SurveyParticipant } from './schemas/survey-participant.schema';
import { CreateSurveyParticipantDto, UpdateSurveyParticipantDto } from './dto/create-participant.dto';
import { SurveysService } from './surveys.service';
import { EmailService } from '../email/email.service';
import * as XLSX from 'xlsx';

interface AccessContext {
  userId: string;
  role: string;
  organizationId?: string;
}

@Injectable()
export class SurveyParticipantsService {
  constructor(
    @InjectModel(SurveyParticipant.name)
    private readonly participantModel: Model<SurveyParticipant>,
    private readonly surveysService: SurveysService,
    private readonly emailService: EmailService,
  ) { }

  private normalizeStatus(status?: string) {
    if (!status) {
      return undefined;
    }
    const normalized = status.trim();
    return normalized || undefined;
  }

  private parseCompletionDate(value?: string) {
    if (!value) return undefined;
    const trimmed = value.toString().trim();
    if (!trimmed || trimmed.toLowerCase() === 'na') {
      return undefined;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    const serial = Number(trimmed);
    if (!isNaN(serial)) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const converted = new Date(excelEpoch.getTime() + serial * 86400000);
      if (!isNaN(converted.getTime())) {
        return converted;
      }
    }

    return undefined;
  }

  private async ensureSurveyAccess(surveyId: string, ctx: AccessContext) {
    await this.surveysService.findOne(surveyId, {
      userId: ctx.userId,
      role: ctx.role,
      organizationId: ctx.organizationId || undefined,
    });
  }

  async create(surveyId: string, dto: CreateSurveyParticipantDto, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);

    // Import credential generation utility
    const { generateCredentials } = await import('./utils/credentials.util');

    // Generate credentials for the respondent (they will login to complete the survey)
    const credentials = await generateCredentials(dto.respondentEmail);
    const normalizedEmail = dto.respondentEmail.trim().toLowerCase();

    // Find all existing participants with the same respondent email (across all surveys)
    // We will update their password to match the new one so the user has ONE password for all surveys
    await this.participantModel.updateMany(
      {
        respondentEmail: normalizedEmail,
        isDeleted: false,
      },
      {
        $set: {
          password: credentials.hashedPassword,
        },
      },
    );

    const participant = new this.participantModel({
      surveyId: new Types.ObjectId(surveyId),
      participantName: dto.participantName.trim(),
      participantEmail: dto.participantEmail?.trim().toLowerCase(),
      respondentName: dto.respondentName.trim(),
      respondentEmail: normalizedEmail,
      relationship: dto.relationship?.trim(),
      completionStatus: this.normalizeStatus(dto.completionStatus) || 'Yet To Start',
      completionDate: this.parseCompletionDate(dto.completionDate),
      // Auto-generated credential fields
      username: credentials.username,
      password: credentials.hashedPassword, // Store hashed password
      hasLoggedIn: false,
      remindersSent: 0,
      isLocked: false,
    });

    const saved = await participant.save();

    // Return the participant object along with the plain password for email sending
    return {
      participant: saved,
      plainPassword: credentials.password, // Plain password to be sent via email
    };
  }

  async findAll(
    surveyId: string,
    ctx: AccessContext,
    options?: { page?: number; limit?: number; search?: string; status?: string; includeRejected?: boolean },
  ) {
    await this.ensureSurveyAccess(surveyId, ctx);

    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options?.limit) || 10));

    const filter: FilterQuery<SurveyParticipant> = {
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    };

    // Exclude rejected participants by default (Participants tab)
    // Include them only if explicitly requested (Nominations page)
    if (!options?.includeRejected) {
      filter.verificationStatus = { $ne: 'rejected' };
    }

    if (options?.status) {
      filter.completionStatus = new RegExp(`^${options.status}$`, 'i');
    }

    if (options?.search?.trim()) {
      const regex = new RegExp(options.search.trim(), 'i');
      filter.$or = [
        { participantName: regex },
        { participantEmail: regex },
        { respondentName: regex },
        { respondentEmail: regex },
      ];
    }

    const baseMatch: FilterQuery<SurveyParticipant> = {
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    };

    // Same logic for status breakdown
    if (!options?.includeRejected) {
      baseMatch.verificationStatus = { $ne: 'rejected' };
    }

    const [totalFiltered, participants, statusBreakdown] = await Promise.all([
      this.participantModel.countDocuments(filter),
      this.participantModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.participantModel
        .aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: { $toLower: '$completionStatus' },
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
    ]);

    const summary = statusBreakdown.reduce(
      (acc, item) => {
        const key = (item._id || 'pending').toString();
        if (key.includes('complete')) {
          acc.completed += item.count;
        } else if (key.includes('progress')) {
          acc.inProgress += item.count;
        } else if (key.includes('yet')) {
          acc.pending += item.count;
        } else {
          acc.pending += item.count;
        }
        acc.total += item.count;
        return acc;
      },
      { total: 0, completed: 0, inProgress: 0, pending: 0 },
    );

    summary.pending = Math.max(summary.total - summary.completed - summary.inProgress, summary.pending);

    return {
      data: participants,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.max(1, Math.ceil(totalFiltered / limit)),
      },
      summary,
    };
  }

  async verify(surveyId: string, participantId: string, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);
    const participant = await this.participantModel.findOne({
      _id: participantId,
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    participant.verificationStatus = 'verified';
    return participant.save();
  }

  async reject(surveyId: string, participantId: string, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);
    const participant = await this.participantModel.findOne({
      _id: participantId,
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    participant.verificationStatus = 'rejected';
    await participant.save();

    // Reset the nominator's nomination status to allow re-submission
    if (participant.nominatedBy) {
      await this.participantModel.updateMany(
        {
          surveyId: new Types.ObjectId(surveyId),
          participantEmail: participant.nominatedBy,
          isDeleted: false,
        },
        {
          $set: { nominationStatus: 'in_progress' },
        },
      );
    }

    return participant;
  }

  async inviteParticipant(surveyId: string, participantId: string, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);
    const participant = await this.participantModel.findOne({
      _id: participantId,
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (!participant.respondentEmail) {
      throw new BadRequestException('Respondent email is required to send an invite');
    }

    // 1. Get Survey for details and templates
    const survey = await this.surveysService.findOne(surveyId, {
      userId: ctx.userId,
      role: ctx.role,
      organizationId: ctx.organizationId,
    });

    // 2. Generate new credentials
    const { generateCredentials } = await import('./utils/credentials.util');
    const credentials = await generateCredentials(participant.respondentEmail);

    // 3. Update password for this participant and ALL other participants with same email
    // This ensures single sign-on experience across surveys
    await this.participantModel.updateMany(
      {
        respondentEmail: participant.respondentEmail,
        isDeleted: false,
      },
      {
        $set: {
          password: credentials.hashedPassword,
          username: credentials.username,
        },
      },
    );

    // 4. Send Email
    // Use 'participantInvite' template if available, otherwise default
    // We want to emphasize that this is for BOTH survey and nominations
    const template = survey.communicationTemplates?.participantInvite || {
      subject: 'Invitation to 360° Feedback Survey & Nomination',
      text: 'You have been invited to participate in a 360° Feedback Survey. Please log in to nominate your respondents and complete your self-assessment.',
      html: `
        <p>You have been invited to participate in a 360° Feedback Survey.</p>
        <p><strong>Action Required:</strong></p>
        <ul>
          <li>Log in to the portal.</li>
          <li><strong>Nominate</strong> your peers, managers, and direct reports (if applicable).</li>
          <li>Complete your <strong>Self-Assessment</strong>.</li>
        </ul>
        <p>Please ensure you complete these steps by the due date.</p>
      `
    };

    // We use sendSurveyParticipantInvite which sends login credentials
    const emailSent = await this.emailService.sendSurveyParticipantInvite(
      participant,
      credentials.password,
      survey,
      template
    );

    if (!emailSent) {
      throw new BadRequestException('Failed to send invitation email');
    }

    return { message: 'Invitation sent successfully' };
  }

  async update(surveyId: string, participantId: string, dto: UpdateSurveyParticipantDto, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);

    const participant = await this.participantModel.findOne({
      _id: participantId,
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    participant.participantName = dto.participantName?.trim() || participant.participantName;
    participant.participantEmail = dto.participantEmail?.trim().toLowerCase() || participant.participantEmail;
    participant.respondentName = dto.respondentName?.trim() || participant.respondentName;
    participant.respondentEmail = dto.respondentEmail?.trim().toLowerCase() || participant.respondentEmail;
    participant.relationship = dto.relationship?.trim() || participant.relationship;
    if (dto.completionStatus !== undefined) {
      participant.completionStatus = this.normalizeStatus(dto.completionStatus) || participant.completionStatus;
    }
    if (dto.completionDate !== undefined) {
      participant.completionDate = this.parseCompletionDate(dto.completionDate);
    }
    if (dto.nominationStatus !== undefined) {
      participant.nominationStatus = dto.nominationStatus;
    }
    if (dto.addedBy) {
      participant.addedBy = dto.addedBy;
    }
    if (dto.verificationStatus !== undefined) {
      participant.verificationStatus = dto.verificationStatus;
    }

    return participant.save();
  }

  async remove(surveyId: string, participantId: string, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);

    // Find participant first (before deletion)
    const participant = await this.participantModel.findOne({
      _id: participantId,
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    // Send cancellation email if Respondent (not Self)
    if (participant.relationship && participant.relationship.toLowerCase() !== 'self') {
      try {
        const survey = await this.surveysService.findOne(surveyId, ctx);
        const template = survey.communicationTemplates?.respondentCancellation;

        if (template) {
          await this.emailService.sendSurveyCancellation(participant, survey, template);
        }
      } catch (error) {
        // Log error but don't block deletion
        console.error('Failed to send cancellation email:', error);
      }
    }

    // Proceed with deletion
    participant.isDeleted = true;
    await participant.save();

    return participant;
  }

  async bulkUpload(surveyId: string, file: Express.Multer.File, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName =
      workbook.SheetNames.find((name) => {
        const candidate = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(candidate, { defval: '' });
        return data.length > 0;
      }) || workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      return { imported: 0, skipped: 0, participantsWithCredentials: [] };
    }

    const normalizeKey = (value: string) =>
      value?.toString().trim().toLowerCase().replace(/[\s_]+/g, '') || '';

    let imported = 0;
    let skipped = 0;
    const participantsWithCredentials: Array<{
      participant: any;
      plainPassword: string;
    }> = [];

    for (const row of rows as Record<string, string>[]) {
      const entries = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[normalizeKey(key)] = value;
        return acc;
      }, {});

      const participantName = entries['participant'];
      const respondentName = entries['respondent'];
      const respondentEmail = entries['respondentemailid'] || entries['respondentemail'];

      if (!participantName || !respondentName || !respondentEmail) {
        skipped += 1;
        continue;
      }

      const dto: CreateSurveyParticipantDto = {
        participantName: participantName.toString(),
        participantEmail: entries['participantemail']?.toString(),
        respondentName: respondentName.toString(),
        respondentEmail: respondentEmail.toString(),
        relationship: entries['relationship']?.toString(),
        completionStatus: entries['completionstatus']?.toString(),
        completionDate: entries['completiondate']?.toString(),
      };

      const result = await this.create(surveyId, dto, ctx);
      participantsWithCredentials.push(result as any);
      imported += 1;
    }

    return { imported, skipped, participantsWithCredentials };
  }

  async findPendingParticipants(surveyId: string) {
    return this.participantModel
      .find({
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
        $or: [
          { completionStatus: { $exists: false } },
          { completionStatus: { $nin: ['completed', 'Completed'] } },
        ],
      })
      .exec();
  }
}


