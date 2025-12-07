
import mongoose from 'mongoose';
import { SurveySchema } from './surveys/schemas/survey.schema';
import { SurveyParticipantSchema } from './surveys/schemas/survey-participant.schema';

async function run() {
    try {
        // Connect to MongoDB (replace with your actual connection string if different)
        await mongoose.connect('mongodb://localhost:27017/impact-plus');
        console.log('Connected to MongoDB');

        const Survey = mongoose.model('Survey', SurveySchema);
        const SurveyParticipant = mongoose.model('SurveyParticipant', SurveyParticipantSchema);

        const surveyId = '693341f3a337ab068008b03b';
        const userEmail = 'annuangle396@gmail.com';

        console.log(`\n🔍 Checking Survey: ${surveyId}`);
        const survey: any = await Survey.findById(surveyId);
        if (!survey) {
            console.log('❌ Survey not found');
            return;
        }

        console.log('✅ Survey found:', survey.name);
        console.log('⚙️ Nomination Config:', JSON.stringify(survey.nominationConfig, null, 2));

        const config = survey.nominationConfig?.participantReportConfig;

        // Enable report if disabled
        if (!config?.isEnabled) {
            console.log('⚠️ Enabling Report Config in Database...');
            if (!survey.nominationConfig) survey.nominationConfig = {};
            survey.nominationConfig.participantReportConfig = {
                isEnabled: true,
                minTotalResponses: 1, // Set to 1 for testing
                requirements: []
            };
            await Survey.updateOne({ _id: surveyId }, { $set: { nominationConfig: survey.nominationConfig } });
            console.log('✅ Report Config ENABLED');
        } else {
            console.log('✅ Report is ALREADY ENABLED');
            console.log(`   Min Total Responses: ${config.minTotalResponses}`);
        }

        console.log('\nAll Participants for Survey:');
        const allParticipants = await SurveyParticipant.find({ surveyId: new mongoose.Types.ObjectId(surveyId) });
        allParticipants.forEach((p: any) => {
            console.log(` - ${p.participantName} (${p.participantEmail}) | Respondent: ${p.respondentName} (${p.respondentEmail}) | Status: ${p.completionStatus} | Rel: ${p.relationship} | Deleted: ${p.isDeleted}`);
        });

        console.log(`\n🔍 Checking Responses for Subject: ${userEmail}`);
        const completedRespondents = await SurveyParticipant.find({
            surveyId: new mongoose.Types.ObjectId(surveyId),
            participantEmail: userEmail,
            completionStatus: 'Completed',
            isDeleted: false
        });

        console.log(`📊 Total Completed Responses for ${userEmail}: ${completedRespondents.length}`);

        const byRelationship: Record<string, number> = {};
        completedRespondents.forEach((r: any) => {
            const rel = r.relationship || 'Unknown';
            byRelationship[rel] = (byRelationship[rel] || 0) + 1;
        });
        console.log('📈 Breakdown by Relationship:', byRelationship);

        // Check criteria
        if (config?.isEnabled || true) { // Force check even if just enabled
            const minTotal = config?.minTotalResponses || 1;
            const totalMet = completedRespondents.length >= minTotal;

            console.log(`\n📝 Criteria Check:`);
            console.log(`   Total Met? ${totalMet} (${completedRespondents.length} >= ${minTotal})`);

            if (totalMet) {
                console.log('✅ BUTTON SHOULD BE VISIBLE');
            } else {
                console.log('❌ BUTTON SHOULD BE HIDDEN');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
