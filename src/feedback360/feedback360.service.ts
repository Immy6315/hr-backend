import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback360Review, ReviewStatus, FeedbackStatus } from './schemas/feedback360-review.schema';
import { CreateFeedback360ReviewDto } from './dto/create-feedback360-review.dto';
import { UpdateFeedback360ReviewDto } from './dto/update-feedback360-review.dto';
import { SurveysService } from '../surveys/surveys.service';
import { SurveyPagesService } from '../surveys/survey-pages.service';
import { SurveyQuestionsService } from '../surveys/survey-questions.service';
import { UserSurveysService } from '../surveys/user-surveys.service';
import { Employee } from '../employees/schemas/employee.schema';
import { SurveyStatus } from '../surveys/schemas/survey.schema';

@Injectable()
export class Feedback360Service {
  constructor(
    @InjectModel(Feedback360Review.name)
    private reviewModel: Model<Feedback360Review>,
    @InjectModel(Employee.name)
    private employeeModel: Model<Employee>,
    private surveysService: SurveysService,
    private surveyPagesService: SurveyPagesService,
    private surveyQuestionsService: SurveyQuestionsService,
    private userSurveysService: UserSurveysService,
  ) {}

  async create(createDto: CreateFeedback360ReviewDto, createdBy: string): Promise<Feedback360Review> {
    // Validate employee exists
    // Note: You'll need to inject EmployeeModel if you want to validate
    // For now, we'll proceed with the assumption that IDs are valid

    // Create survey for feedback collection
    const survey = await this.createFeedbackSurvey(createDto, createdBy);

    // Calculate total feedback requests
    const totalRequests = 1 + (createDto.peerIds?.length || 0) + (createDto.directReportIds?.length || 0);

    // Initialize feedback status
    const feedbackStatus: any = {
      manager: {
        status: FeedbackStatus.PENDING,
      },
    };

    if (createDto.peerIds && createDto.peerIds.length > 0) {
      feedbackStatus.peers = createDto.peerIds.map(peerId => ({
        employeeId: new Types.ObjectId(peerId),
        status: FeedbackStatus.PENDING,
      }));
    }

    if (createDto.directReportIds && createDto.directReportIds.length > 0) {
      feedbackStatus.directReports = createDto.directReportIds.map(reportId => ({
        employeeId: new Types.ObjectId(reportId),
        status: FeedbackStatus.PENDING,
      }));
    }

    const review = new this.reviewModel({
      ...createDto,
      employeeId: new Types.ObjectId(createDto.employeeId),
      managerId: new Types.ObjectId(createDto.managerId),
      createdBy: new Types.ObjectId(createdBy),
      peerIds: createDto.peerIds?.map(id => new Types.ObjectId(id)) || [],
      directReportIds: createDto.directReportIds?.map(id => new Types.ObjectId(id)) || [],
      surveyId: survey._id,
      status: ReviewStatus.ACTIVE,
      totalFeedbackRequests: totalRequests,
      feedbackStatus,
      startDate: createDto.startDate || new Date(),
      endDate: createDto.endDate || this.getDefaultEndDate(),
    });

    const savedReview = await review.save();

    // Create user surveys for each reviewer
    await this.createUserSurveysForReviewers(savedReview, survey._id.toString());

    return savedReview.populate([
      { path: 'employeeId', select: 'name email position department' },
      { path: 'managerId', select: 'name email position department' },
      { path: 'peerIds', select: 'name email position department' },
      { path: 'directReportIds', select: 'name email position department' },
    ]);
  }

  private async createFeedbackSurvey(createDto: CreateFeedback360ReviewDto, createdBy: string) {
    // Create survey for 360 feedback
    const survey = await this.surveysService.create(
      {
        name: `360° Feedback - ${createDto.reviewCycle}`,
        description: `360-degree feedback review for ${createDto.reviewCycle}`,
        category: '360-feedback',
        status: SurveyStatus.ACTIVE,
      },
      createdBy,
    );

    // Create a page for the survey
    const page = await this.surveyPagesService.create(survey._id.toString(), {
      title: '360° Feedback Form',
      description: createDto.customInstructions || 'Please provide your honest feedback',
    }, createdBy);

    // Create questions based on competencies
    const competencies = createDto.competencies || [
      'leadership',
      'communication',
      'teamwork',
      'problem-solving',
      'adaptability',
      'accountability',
      'innovation',
      'customer-focus',
    ];

    for (const competency of competencies) {
      await this.surveyQuestionsService.createQuestion(
        survey._id.toString(),
        page.id,
        {
          text: this.getCompetencyQuestion(competency),
          type: 'RATING_SCALE',
          mandatoryEnabled: true,
          validations: {
            scaleFrom: '1',
            scaleTo: '5',
            startLabel: 'Poor',
            endLabel: 'Excellent',
          },
        },
      );
    }

    // Add overall feedback question
    await this.surveyQuestionsService.createQuestion(
      survey._id.toString(),
      page.id,
      {
        text: 'Additional Comments (Optional)',
        type: 'LONG_TEXT',
        mandatoryEnabled: false,
      },
    );

    return survey;
  }

  private getCompetencyQuestion(competency: string): string {
    const questions: Record<string, string> = {
      leadership: 'How would you rate this person\'s leadership and vision?',
      communication: 'How would you rate this person\'s communication skills?',
      teamwork: 'How would you rate this person\'s teamwork and collaboration?',
      'problem-solving': 'How would you rate this person\'s problem-solving abilities?',
      adaptability: 'How would you rate this person\'s adaptability?',
      accountability: 'How would you rate this person\'s accountability?',
      innovation: 'How would you rate this person\'s innovation and creativity?',
      'customer-focus': 'How would you rate this person\'s customer focus?',
    };
    return questions[competency] || `How would you rate this person's ${competency}?`;
  }

  private async createUserSurveysForReviewers(review: Feedback360Review, surveyId: string) {
    // Get manager employee to find userId
    const manager = await this.employeeModel.findById(review.managerId).exec();
    const managerUserId = manager?.userId?.toString() || '';

    // Create user survey for manager (userId can be empty for IP-based surveys)
    try {
      await this.userSurveysService.create(managerUserId, {
        surveyId,
      });
    } catch (error) {
      console.error('Error creating user survey for manager:', error);
    }

    // Create user surveys for peers
    for (const peerId of review.peerIds) {
      try {
        const peer = await this.employeeModel.findById(peerId).exec();
        const peerUserId = peer?.userId?.toString() || '';
        
        await this.userSurveysService.create(peerUserId, {
          surveyId,
        });
      } catch (error) {
        console.error(`Error creating user survey for peer ${peerId}:`, error);
      }
    }

    // Create user surveys for direct reports
    for (const reportId of review.directReportIds) {
      try {
        const report = await this.employeeModel.findById(reportId).exec();
        const reportUserId = report?.userId?.toString() || '';
        
        await this.userSurveysService.create(reportUserId, {
          surveyId,
        });
      } catch (error) {
        console.error(`Error creating user survey for direct report ${reportId}:`, error);
      }
    }
  }

  private getDefaultEndDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 30); // 30 days from now
    return date;
  }

  async findAll(filters?: {
    employeeId?: string;
    createdBy?: string;
    status?: ReviewStatus;
    reviewCycle?: string;
  }) {
    const query: any = { isDeleted: false };

    if (filters?.employeeId) {
      query.employeeId = new Types.ObjectId(filters.employeeId);
    }

    if (filters?.createdBy) {
      query.createdBy = new Types.ObjectId(filters.createdBy);
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.reviewCycle) {
      query.reviewCycle = filters.reviewCycle;
    }

    return this.reviewModel
      .find(query)
      .populate('employeeId', 'name email position department')
      .populate('managerId', 'name email position department')
      .populate('peerIds', 'name email position department')
      .populate('directReportIds', 'name email position department')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Feedback360Review> {
    const review = await this.reviewModel
      .findById(id)
      .populate('employeeId', 'name email position department')
      .populate('managerId', 'name email position department')
      .populate('peerIds', 'name email position department')
      .populate('directReportIds', 'name email position department')
      .populate('createdBy', 'name email')
      .populate('surveyId')
      .exec();

    if (!review || review.isDeleted) {
      throw new NotFoundException(`360 Review with ID ${id} not found`);
    }

    return review;
  }

  async update(id: string, updateDto: UpdateFeedback360ReviewDto): Promise<Feedback360Review> {
    const review = await this.reviewModel.findById(id).exec();

    if (!review || review.isDeleted) {
      throw new NotFoundException(`360 Review with ID ${id} not found`);
    }

    if (updateDto.employeeId) {
      review.employeeId = new Types.ObjectId(updateDto.employeeId);
    }

    if (updateDto.managerId) {
      review.managerId = new Types.ObjectId(updateDto.managerId);
    }

    if (updateDto.peerIds) {
      review.peerIds = updateDto.peerIds.map(id => new Types.ObjectId(id));
    }

    if (updateDto.directReportIds) {
      review.directReportIds = updateDto.directReportIds.map(id => new Types.ObjectId(id));
    }

    Object.assign(review, {
      ...updateDto,
      peerIds: updateDto.peerIds?.map(id => new Types.ObjectId(id)) || review.peerIds,
      directReportIds: updateDto.directReportIds?.map(id => new Types.ObjectId(id)) || review.directReportIds,
    });

    return review.save();
  }

  async remove(id: string): Promise<void> {
    const review = await this.reviewModel.findById(id).exec();

    if (!review || review.isDeleted) {
      throw new NotFoundException(`360 Review with ID ${id} not found`);
    }

    review.isDeleted = true;
    review.status = ReviewStatus.CANCELLED;
    await review.save();
  }
}

