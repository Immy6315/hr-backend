import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Req,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Feedback360Service } from './feedback360.service';
import { CreateFeedback360ReviewDto } from './dto/create-feedback360-review.dto';
import { UpdateFeedback360ReviewDto } from './dto/update-feedback360-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ReviewStatus } from './schemas/feedback360-review.schema';

@ApiTags('360-feedback')
@Controller('360-feedback')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
export class Feedback360Controller {
  constructor(private readonly feedback360Service: Feedback360Service) {}

  @Post()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create a new 360° feedback review' })
  @ApiResponse({ status: 201, description: '360° Review created successfully' })
  async create(@Body() createDto: CreateFeedback360ReviewDto, @Req() req: any) {
    const review = await this.feedback360Service.create(createDto, req.user.userId);
    return {
      statusCode: 201,
      message: '360° Review created successfully',
      data: review,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all 360° feedback reviews' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ReviewStatus })
  @ApiQuery({ name: 'reviewCycle', required: false })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  async findAll(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: ReviewStatus,
    @Query('reviewCycle') reviewCycle?: string,
    @Req() req?: any,
  ) {
    const reviews = await this.feedback360Service.findAll({
      employeeId,
      createdBy: req?.user?.userId,
      status,
      reviewCycle,
    });
    return {
      statusCode: 200,
      message: 'Reviews retrieved successfully',
      data: reviews,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a 360° feedback review by ID' })
  @ApiResponse({ status: 200, description: 'Review retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async findOne(@Param('id') id: string) {
    const review = await this.feedback360Service.findOne(id);
    return {
      statusCode: 200,
      message: 'Review retrieved successfully',
      data: review,
    };
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update a 360° feedback review' })
  @ApiResponse({ status: 200, description: 'Review updated successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateFeedback360ReviewDto) {
    const review = await this.feedback360Service.update(id, updateDto);
    return {
      statusCode: 200,
      message: 'Review updated successfully',
      data: review,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a 360° feedback review' })
  @ApiResponse({ status: 200, description: 'Review deleted successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async remove(@Param('id') id: string) {
    await this.feedback360Service.remove(id);
    return {
      statusCode: 200,
      message: 'Review deleted successfully',
    };
  }
}

