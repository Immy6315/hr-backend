import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SurveyParticipant } from './schemas/survey-participant.schema';
import { EmailService } from '../email/email.service';
import { SurveysService } from './surveys.service';

@Injectable()
export class ReminderService {
    private readonly logger = new Logger(ReminderService.name);
    private readonly REMINDER_COOLDOWN_HOURS = 24;

    constructor(
        @InjectModel(SurveyParticipant.name)
        private readonly participantModel: Model<SurveyParticipant>,
        private readonly emailService: EmailService,
        @Inject(forwardRef(() => SurveysService))
        private readonly surveysService: SurveysService,
    ) { }

    /**
     * Get participants eligible for reminders
     * (not completed, not locked)
     */
    async getReminderEligibleParticipants(surveyId: string): Promise<SurveyParticipant[]> {
        return this.participantModel
            .find({
                surveyId: new Types.ObjectId(surveyId),
                isDeleted: false,
                isLocked: false,
                completionStatus: { $nin: ['Completed', 'completed'] },
            })
            .sort({ _id: -1 })
            .exec();
    }

    /**
     * Send bulk reminders to selected participants
     */
    async sendBulkReminders(
        surveyId: string,
        participantIds: string[],
        ctx: { userId: string; role: string; organizationId?: string },
    ): Promise<{
        sent: number;
        failed: number;
        ineligible: number;
        details: Array<{ participantId: string; status: 'sent' | 'failed' | 'ineligible'; reason?: string }>;
    }> {
        // Verify survey access
        const survey = await this.surveysService.findOne(surveyId, ctx);

        // Check if survey is active
        if (survey.status !== 'active') {
            throw new BadRequestException('Survey must be active to send reminders');
        }

        const now = new Date();

        let sent = 0;
        let failed = 0;
        let ineligible = 0;
        const details: Array<{ participantId: string; status: 'sent' | 'failed' | 'ineligible'; reason?: string }> = [];

        for (const participantId of participantIds) {
            try {
                const participant = await this.participantModel.findOne({
                    _id: participantId,
                    surveyId: new Types.ObjectId(surveyId),
                    isDeleted: false,
                });

                if (!participant) {
                    ineligible++;
                    details.push({ participantId, status: 'ineligible', reason: 'Participant not found' });
                    continue;
                }

                // Check eligibility
                if (participant.isLocked || participant.completionStatus === 'Completed' || participant.completionStatus === 'completed') {
                    ineligible++;
                    details.push({ participantId, status: 'ineligible', reason: 'Already completed or locked' });
                    continue;
                }

                // Determine which template to use
                let template;
                let isInvite = false;

                if (participant.relationship === 'Self' || participant.relationship === 'self') {
                    // Self -> Always Participant Invite (re-send invite)
                    template = survey.communicationTemplates?.participantInvite;
                    isInvite = true;
                } else {
                    // Respondent
                    if (participant.remindersSent && participant.remindersSent > 0) {
                        // Already sent at least once -> Send Reminder
                        template = survey.communicationTemplates?.respondentReminder;
                        isInvite = false;
                    } else {
                        // Never sent -> Send Invite (First time)
                        template = survey.communicationTemplates?.respondentInvite;
                        isInvite = true;
                    }
                }

                // Fallback to respondentReminder if specific template is missing (safety net)
                if (!template) {
                    template = survey.communicationTemplates?.respondentReminder;
                }

                let emailSent = false;

                if (isInvite) {
                    // For invites, we MUST send the password.
                    // We generate a new password (resetting it) to ensure we have the plain text version.
                    const { generateCredentials } = await import('./utils/credentials.util');
                    const credentials = await generateCredentials(participant.respondentEmail);

                    // Update ALL participants with this email to use the new password
                    await this.participantModel.updateMany(
                        {
                            respondentEmail: participant.respondentEmail.trim().toLowerCase(),
                            isDeleted: false
                        },
                        {
                            $set: {
                                password: credentials.hashedPassword
                            }
                        }
                    );

                    // Send Invite Email with plain password
                    emailSent = await this.emailService.sendSurveyParticipantInvite(
                        participant,
                        credentials.password,
                        survey,
                        template
                    );
                } else {
                    // For reminders, we don't send the password (security best practice + we don't have it)
                    emailSent = await this.emailService.sendSurveyReminder(participant, survey, template);
                }

                if (emailSent) {
                    // Update participant record
                    participant.remindersSent = (participant.remindersSent || 0) + 1;
                    participant.lastReminderDate = now;
                    await participant.save();

                    sent++;
                    details.push({ participantId, status: 'sent' });
                    this.logger.log(`✅ ${isInvite ? 'Invite' : 'Reminder'} sent to ${participant.respondentEmail}`);
                } else {
                    failed++;
                    details.push({ participantId, status: 'failed', reason: 'Email service failed' });
                    this.logger.warn(`⚠️ Failed to send ${isInvite ? 'invite' : 'reminder'} to ${participant.respondentEmail}`);
                }
            } catch (error) {
                this.logger.error(`❌ Error sending reminder to participant ${participantId}:`, error);
                failed++;
                details.push({ participantId, status: 'failed', reason: error.message });
            }
        }

        return { sent, failed, ineligible, details };
    }

    /**
     * Get reminder statistics for a survey
     */
    async getReminderStats(surveyId: string): Promise<{
        total: number;
        eligible: number;
        recentReminders: Array<{
            participantName: string;
            respondentEmail: string;
            remindersSent: number;
            lastReminderDate: Date | null;
        }>;
    }> {
        const [total, eligible, allParticipants] = await Promise.all([
            this.participantModel.countDocuments({
                surveyId: new Types.ObjectId(surveyId),
                isDeleted: false,
            }),
            this.getReminderEligibleParticipants(surveyId).then((p) => p.length),
            this.participantModel
                .find({
                    surveyId: new Types.ObjectId(surveyId),
                    isDeleted: false,
                    remindersSent: { $gt: 0 },
                })
                .sort({ lastReminderDate: -1 })
                .limit(10)
                .exec(),
        ]);

        const recentReminders = allParticipants.map((p) => ({
            participantName: p.participantName,
            respondentEmail: p.respondentEmail,
            remindersSent: p.remindersSent || 0,
            lastReminderDate: p.lastReminderDate || null,
        }));

        return {
            total,
            eligible,
            recentReminders,
        };
    }
}
