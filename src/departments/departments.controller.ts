import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('departments')
@Controller('departments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create a new department' })
  @ApiResponse({ status: 201, description: 'Department created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - name or code already exists' })
  async create(@Body() createDepartmentDto: CreateDepartmentDto) {
    const department = await this.departmentsService.create(createDepartmentDto);
    return {
      statusCode: 201,
      message: 'Department created successfully',
      data: department,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all departments' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'location', required: false })
  @ApiQuery({ name: 'parentDepartmentId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of departments' })
  async findAll(
    @Query('status') status?: string,
    @Query('isActive') isActive?: string,
    @Query('location') location?: string,
    @Query('parentDepartmentId') parentDepartmentId?: string,
    @Query('search') search?: string,
  ) {
    const filters: any = {};
    if (status) filters.status = status;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (location) filters.location = location;
    if (parentDepartmentId) filters.parentDepartmentId = parentDepartmentId;
    if (search) filters.search = search;

    const departments = await this.departmentsService.findAll(filters);
    return {
      statusCode: 200,
      message: 'Departments retrieved successfully',
      data: departments,
    };
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Get department hierarchy tree' })
  @ApiResponse({ status: 200, description: 'Department hierarchy' })
  async getHierarchy() {
    const hierarchy = await this.departmentsService.getDepartmentHierarchy();
    return {
      statusCode: 200,
      message: 'Department hierarchy retrieved successfully',
      data: hierarchy,
    };
  }

  @Get('locations')
  @ApiOperation({ summary: 'Get all unique locations' })
  @ApiResponse({ status: 200, description: 'List of locations' })
  async getLocations() {
    const locations = await this.departmentsService.getLocations();
    return {
      statusCode: 200,
      message: 'Locations retrieved successfully',
      data: locations,
    };
  }

  @Get('cost-centers')
  @ApiOperation({ summary: 'Get all unique cost centers' })
  @ApiResponse({ status: 200, description: 'List of cost centers' })
  async getCostCenters() {
    const costCenters = await this.departmentsService.getCostCenters();
    return {
      statusCode: 200,
      message: 'Cost centers retrieved successfully',
      data: costCenters,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get department by ID' })
  @ApiResponse({ status: 200, description: 'Department details' })
  @ApiResponse({ status: 404, description: 'Department not found' })
  async findOne(@Param('id') id: string) {
    const department = await this.departmentsService.findOne(id);
    return {
      statusCode: 200,
      message: 'Department found',
      data: department,
    };
  }

  @Get(':id/sub-departments')
  @ApiOperation({ summary: 'Get sub-departments of a department' })
  @ApiResponse({ status: 200, description: 'List of sub-departments' })
  async getSubDepartments(@Param('id') id: string) {
    const subDepartments = await this.departmentsService.getSubDepartments(id);
    return {
      statusCode: 200,
      message: 'Sub-departments retrieved successfully',
      data: subDepartments,
    };
  }

  @Get(':id/employees')
  @ApiOperation({ summary: 'Get employees in a department' })
  @ApiResponse({ status: 200, description: 'List of employees' })
  async getEmployees(@Param('id') id: string) {
    const employees = await this.departmentsService.getEmployeesByDepartment(id);
    return {
      statusCode: 200,
      message: 'Employees retrieved successfully',
      data: employees,
    };
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update department' })
  @ApiResponse({ status: 200, description: 'Department updated successfully' })
  @ApiResponse({ status: 404, description: 'Department not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async update(@Param('id') id: string, @Body() updateDepartmentDto: UpdateDepartmentDto) {
    const department = await this.departmentsService.update(id, updateDepartmentDto);
    return {
      statusCode: 200,
      message: 'Department updated successfully',
      data: department,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete department' })
  @ApiResponse({ status: 200, description: 'Department deleted successfully' })
  @ApiResponse({ status: 404, description: 'Department not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete - has employees or sub-departments' })
  async remove(@Param('id') id: string) {
    await this.departmentsService.remove(id);
    return {
      statusCode: 200,
      message: 'Department deleted successfully',
    };
  }
}
