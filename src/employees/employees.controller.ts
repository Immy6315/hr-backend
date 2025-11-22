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
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('employees')
@Controller('employees')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.ORG_SUB_ADMIN)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Create a new employee' })
  @ApiResponse({ status: 201, description: 'Employee created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - email or employeeId already exists' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  async create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'managerId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of employees' })
  async findAll(
    @Query('department') department?: string,
    @Query('isActive') isActive?: string,
    @Query('managerId') managerId?: string,
    @Query('search') search?: string,
  ) {
    const filters: any = {};
    if (department) filters.department = department;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (managerId) filters.managerId = managerId;
    if (search) filters.search = search;

    const employees = await this.employeesService.findAll(filters);
    return {
      statusCode: 200,
      message: 'Employees retrieved successfully',
      data: employees,
    };
  }

  @Get('departments')
  @ApiOperation({ summary: 'Get all unique departments' })
  @ApiResponse({ status: 200, description: 'List of departments' })
  async getDepartments() {
    const departments = await this.employeesService.getDepartments();
    return {
      statusCode: 200,
      message: 'Departments retrieved successfully',
      data: departments,
    };
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Get employee hierarchy tree' })
  @ApiResponse({ status: 200, description: 'Employee hierarchy' })
  async getHierarchy() {
    const hierarchy = await this.employeesService.getHierarchy();
    return {
      statusCode: 200,
      message: 'Hierarchy retrieved successfully',
      data: hierarchy,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID' })
  @ApiResponse({ status: 200, description: 'Employee details' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  async findOne(@Param('id') id: string) {
    const employee = await this.employeesService.findOne(id);
    return {
      statusCode: 200,
      message: 'Employee found',
      data: employee,
    };
  }

  @Get(':id/direct-reports')
  @ApiOperation({ summary: 'Get direct reports of an employee' })
  @ApiResponse({ status: 200, description: 'List of direct reports' })
  async getDirectReports(@Param('id') id: string) {
    const reports = await this.employeesService.getDirectReports(id);
    return {
      statusCode: 200,
      message: 'Direct reports retrieved successfully',
      data: reports,
    };
  }

  @Get(':id/peers')
  @ApiOperation({ summary: 'Get peers of an employee (same manager)' })
  @ApiResponse({ status: 200, description: 'List of peers' })
  async getPeers(@Param('id') id: string) {
    const peers = await this.employeesService.getPeers(id);
    return {
      statusCode: 200,
      message: 'Peers retrieved successfully',
      data: peers,
    };
  }

  @Get(':id/manager-chain')
  @ApiOperation({ summary: 'Get manager chain (all managers up the hierarchy)' })
  @ApiResponse({ status: 200, description: 'Manager chain' })
  async getManagerChain(@Param('id') id: string) {
    const chain = await this.employeesService.getManagerChain(id);
    return {
      statusCode: 200,
      message: 'Manager chain retrieved successfully',
      data: chain,
    };
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe())
  @ApiOperation({ summary: 'Update employee' })
  @ApiResponse({ status: 200, description: 'Employee updated successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  async update(@Param('id') id: string, @Body() updateEmployeeDto: UpdateEmployeeDto) {
    const employee = await this.employeesService.update(id, updateEmployeeDto);
    return {
      statusCode: 200,
      message: 'Employee updated successfully',
      data: employee,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete employee' })
  @ApiResponse({ status: 200, description: 'Employee deleted successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete - has direct reports' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  async remove(@Param('id') id: string) {
    await this.employeesService.remove(id);
    return {
      statusCode: 200,
      message: 'Employee deleted successfully',
    };
  }
}

