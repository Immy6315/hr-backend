import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { SurveyParticipant } from './schemas/survey-participant.schema';
import { CreateSurveyParticipantDto, UpdateSurveyParticipantDto } from './dto/create-participant.dto';
import { SurveysService } from './surveys.service';
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
  ) {}

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

    const participant = new this.participantModel({
      surveyId: new Types.ObjectId(surveyId),
      participantName: dto.participantName.trim(),
      participantEmail: dto.participantEmail?.trim().toLowerCase(),
      respondentName: dto.respondentName.trim(),
      respondentEmail: dto.respondentEmail.trim().toLowerCase(),
      relationship: dto.relationship?.trim(),
      completionStatus: this.normalizeStatus(dto.completionStatus),
      completionDate: this.parseCompletionDate(dto.completionDate),
    });

    return participant.save();
  }

  async findAll(
    surveyId: string,
    ctx: AccessContext,
    options?: { page?: number; limit?: number; search?: string; status?: string },
  ) {
    await this.ensureSurveyAccess(surveyId, ctx);

    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options?.limit) || 10));

    const filter: FilterQuery<SurveyParticipant> = {
      surveyId: new Types.ObjectId(surveyId),
      isDeleted: false,
    };

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

    return participant.save();
  }

  async remove(surveyId: string, participantId: string, ctx: AccessContext) {
    await this.ensureSurveyAccess(surveyId, ctx);
    const participant = await this.participantModel.findOneAndUpdate(
      {
        _id: participantId,
        surveyId: new Types.ObjectId(surveyId),
        isDeleted: false,
      },
      { isDeleted: true },
      { new: true },
    );

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

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
      return { imported: 0, skipped: 0 };
    }

    const normalizeKey = (value: string) =>
      value?.toString().trim().toLowerCase().replace(/[\s_]+/g, '') || '';

    let imported = 0;
    let skipped = 0;

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

      await this.create(surveyId, dto, ctx);
      imported += 1;
    }

    return { imported, skipped };
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


