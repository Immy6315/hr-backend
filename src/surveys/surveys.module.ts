import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SurveysService } from './surveys.service';
import { SurveysController } from './surveys.controller';
import { Survey, SurveySchema } from './schemas/survey.schema';
import { SurveyPageCollection, SurveyPageCollectionSchema } from './schemas/survey-page-collection.schema';
import { UserSurvey, UserSurveySchema } from './schemas/user-survey.schema';
import { UserSurveyResponse, UserSurveyResponseSchema } from './schemas/user-survey-response.schema';
import { UserSurveysService } from './user-surveys.service';
import { UserSurveysController } from './user-surveys.controller';
import { UserSurveyResponsesService } from './user-survey-responses.service';
import { UserSurveyResponsesController } from './user-survey-responses.controller';
import { SurveyPagesService } from './survey-pages.service';
import { SurveyPagesController } from './survey-pages.controller';
import { SurveyQuestionsService } from './survey-questions.service';
import { SurveyQuestionsController } from './survey-questions.controller';
import { SurveyQuestionsRestoreController } from './survey-questions-restore.controller';
import { SurveyCollectorController } from './survey-collector.controller';
import { SurveyTemplatesService } from './survey-templates.service';
import { SurveyTemplatesController } from './survey-templates.controller';
import { SurveyVisibilityController } from './survey-visibility.controller';
import { SurveyUrlValidationController } from './survey-url-validation.controller';
import { SurveySearchController } from './survey-search.controller';
import { SurveyTemplate, SurveyTemplateSchema } from './schemas/survey-template.schema';
import { SurveyAuditLog, SurveyAuditLogSchema } from './schemas/survey-audit-log.schema';
import { SurveyAuditLogService } from './survey-audit-log.service';
import { SurveyAuditLogController } from './survey-audit-log.controller';
import { SurveyParticipant, SurveyParticipantSchema } from './schemas/survey-participant.schema';
import { SurveyParticipantsService } from './survey-participants.service';
import { SurveyParticipantsController } from './survey-participants.controller';
import { SurveyTemplateDraft, SurveyTemplateDraftSchema } from './schemas/survey-template-draft.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { EmailModule } from '../email/email.module';
import { SurveyTemplateDraftsService } from './survey-template-drafts.service';
import { ReminderService } from './reminder.service';

import { NominationsController } from './nominations.controller';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: Survey.name, schema: SurveySchema },
      { name: SurveyPageCollection.name, schema: SurveyPageCollectionSchema },
      { name: UserSurvey.name, schema: UserSurveySchema },
      { name: UserSurveyResponse.name, schema: UserSurveyResponseSchema },
      { name: SurveyTemplate.name, schema: SurveyTemplateSchema },
      { name: SurveyAuditLog.name, schema: SurveyAuditLogSchema },
      { name: SurveyParticipant.name, schema: SurveyParticipantSchema },
      { name: SurveyTemplateDraft.name, schema: SurveyTemplateDraftSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    SurveysController,
    SurveyPagesController,
    SurveyQuestionsController,
    SurveyQuestionsRestoreController,
    SurveyCollectorController,
    SurveyTemplatesController,
    SurveyVisibilityController,
    SurveyUrlValidationController,
    SurveySearchController,
    UserSurveysController,
    UserSurveyResponsesController,
    SurveyAuditLogController,
    SurveyParticipantsController,
    NominationsController,
  ],
  providers: [
    SurveysService,
    SurveyPagesService,
    SurveyQuestionsService,
    SurveyTemplatesService,
    UserSurveysService,
    UserSurveyResponsesService,
    SurveyAuditLogService,
    SurveyParticipantsService,
    SurveyTemplateDraftsService,
    ReminderService,
  ],
  exports: [
    SurveysService,
    SurveyPagesService,
    SurveyQuestionsService,
    SurveyTemplatesService,
    UserSurveysService,
    UserSurveyResponsesService,
    SurveyAuditLogService,
    SurveyParticipantsService,
    SurveyTemplateDraftsService,
  ],
})
export class SurveysModule { }

