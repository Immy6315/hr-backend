import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee } from './schemas/employee.schema';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @InjectModel(Employee.name) private employeeModel: Model<Employee>,
    private usersService: UsersService,
  ) {}

  async create(createEmployeeDto: CreateEmployeeDto): Promise<Employee> {
    // Check if email already exists
    const existingEmployee = await this.employeeModel.findOne({ 
      email: createEmployeeDto.email.toLowerCase() 
    }).exec();
    
    if (existingEmployee) {
      throw new BadRequestException('Employee with this email already exists');
    }

    // Check if employeeId already exists (if provided)
    if (createEmployeeDto.employeeId) {
      const existingById = await this.employeeModel.findOne({ 
        employeeId: createEmployeeDto.employeeId 
      }).exec();
      
      if (existingById) {
        throw new BadRequestException('Employee with this Employee ID already exists');
      }
    }

    // Validate manager exists if managerId is provided
    if (createEmployeeDto.managerId) {
      const manager = await this.employeeModel.findById(createEmployeeDto.managerId).exec();
      if (!manager) {
        throw new NotFoundException('Manager not found');
      }
    }

    // Try to link with User if email matches
    if (createEmployeeDto.email) {
      try {
        const user = await this.usersService.findByEmail(createEmployeeDto.email);
        if (user && !createEmployeeDto.userId) {
          createEmployeeDto.userId = user._id.toString();
        }
      } catch (error) {
        // User doesn't exist, that's okay
      }
    }

    // Ensure managerId is ObjectId if provided
    const employeeData: any = {
      ...createEmployeeDto,
      email: createEmployeeDto.email.toLowerCase(),
    };
    
    if (createEmployeeDto.managerId) {
      // DTO always provides string, so convert to ObjectId
      employeeData.managerId = new Types.ObjectId(createEmployeeDto.managerId);
    }

    const employee = new this.employeeModel(employeeData);

    return employee.save();
  }

  async findAll(filters?: {
    department?: string;
    isActive?: boolean;
    managerId?: string;
    search?: string;
  }): Promise<Employee[]> {
    const query: any = {};

    if (filters?.department) {
      query.department = filters.department;
    }

    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters?.managerId) {
      query.managerId = filters.managerId;
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { employeeId: { $regex: filters.search, $options: 'i' } },
        { position: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return this.employeeModel
      .find(query)
      .populate('managerId', 'name email position')
      .populate('userId', 'name email role')
      .sort({ name: 1 })
      .exec();
  }

  async findOne(id: string): Promise<Employee> {
    const employee = await this.employeeModel
      .findById(id)
      .populate('managerId', 'name email position department')
      .populate('userId', 'name email role')
      .exec();

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return employee;
  }

  async findByEmail(email: string): Promise<Employee | null> {
    return this.employeeModel
      .findOne({ email: email.toLowerCase() })
      .populate('managerId', 'name email position')
      .populate('userId', 'name email role')
      .exec();
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.employeeModel.findById(id).exec();
    
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    // Check if email is being changed and if it conflicts
    if (updateEmployeeDto.email && updateEmployeeDto.email.toLowerCase() !== employee.email) {
      const existingEmployee = await this.employeeModel.findOne({ 
        email: updateEmployeeDto.email.toLowerCase(),
        _id: { $ne: id }
      }).exec();
      
      if (existingEmployee) {
        throw new BadRequestException('Employee with this email already exists');
      }
    }

    // Check if employeeId is being changed and if it conflicts
    if (updateEmployeeDto.employeeId && updateEmployeeDto.employeeId !== employee.employeeId) {
      const existingById = await this.employeeModel.findOne({ 
        employeeId: updateEmployeeDto.employeeId,
        _id: { $ne: id }
      }).exec();
      
      if (existingById) {
        throw new BadRequestException('Employee with this Employee ID already exists');
      }
    }

    // Validate manager exists if managerId is provided
    if (updateEmployeeDto.managerId) {
      // Prevent self-reference
      if (updateEmployeeDto.managerId === id) {
        throw new BadRequestException('Employee cannot be their own manager');
      }

      // Prevent circular references (check if new manager is a direct/indirect report)
      const isCircular = await this.checkCircularReference(id, updateEmployeeDto.managerId);
      if (isCircular) {
        throw new BadRequestException('Cannot set manager: would create circular reference');
      }

      const manager = await this.employeeModel.findById(updateEmployeeDto.managerId).exec();
      if (!manager) {
        throw new NotFoundException('Manager not found');
      }
    }

    // Try to link with User if email matches
    if (updateEmployeeDto.email) {
      try {
        const user = await this.usersService.findByEmail(updateEmployeeDto.email);
        if (user) {
          updateEmployeeDto.userId = user._id.toString();
        }
      } catch (error) {
        // User doesn't exist, that's okay
      }
    }

    // Handle managerId - set to null if empty string, otherwise ensure it's ObjectId
    const updateData: any = {
      ...updateEmployeeDto,
      email: updateEmployeeDto.email ? updateEmployeeDto.email.toLowerCase() : employee.email,
    };
    
    // If managerId is empty string, set it to null
    if (updateEmployeeDto.managerId === '' || updateEmployeeDto.managerId === null || updateEmployeeDto.managerId === undefined) {
      updateData.managerId = null;
    } else if (updateEmployeeDto.managerId) {
      // DTO always provides string, so convert to ObjectId
      updateData.managerId = new Types.ObjectId(updateEmployeeDto.managerId);
    }

    Object.assign(employee, updateData);

    return employee.save();
  }

  async remove(id: string): Promise<void> {
    const employee = await this.employeeModel.findById(id).exec();
    
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    // Check if employee has direct reports
    const directReports = await this.employeeModel.countDocuments({ managerId: id }).exec();
    if (directReports > 0) {
      throw new BadRequestException(
        `Cannot delete employee: ${directReports} employee(s) report to this person. Please reassign their manager first.`
      );
    }

    await this.employeeModel.findByIdAndDelete(id).exec();
  }

  async getDirectReports(managerId: string): Promise<Employee[]> {
    return this.employeeModel
      .find({ managerId, isActive: true })
      .populate('userId', 'name email')
      .sort({ name: 1 })
      .exec();
  }

  async getPeers(employeeId: string): Promise<Employee[]> {
    const employee = await this.employeeModel.findById(employeeId).exec();
    
    if (!employee || !employee.managerId) {
      return [];
    }

    // Get all employees who report to the same manager
    return this.employeeModel
      .find({
        managerId: employee.managerId,
        _id: { $ne: employeeId },
        isActive: true,
      })
      .populate('userId', 'name email')
      .sort({ name: 1 })
      .exec();
  }

  async getManagerChain(employeeId: string): Promise<Employee[]> {
    const chain: Employee[] = [];
    let currentId: string | Types.ObjectId | undefined = employeeId;

    while (currentId) {
      const employee = await this.employeeModel
        .findById(currentId)
        .populate('managerId', 'name email position')
        .exec();

      if (!employee || !employee.managerId) {
        break;
      }

      const manager = await this.employeeModel
        .findById(employee.managerId)
        .populate('userId', 'name email')
        .exec();

      if (manager) {
        chain.push(manager);
        currentId = manager.managerId;
      } else {
        break;
      }
    }

    return chain;
  }

  private async checkCircularReference(employeeId: string, potentialManagerId: string): Promise<boolean> {
    // Get all direct and indirect reports of the employee
    const reports = await this.getAllReports(employeeId);
    return reports.some(report => report._id.toString() === potentialManagerId);
  }

  private async getAllReports(managerId: string): Promise<Employee[]> {
    const reports: Employee[] = [];
    const directReports = await this.employeeModel.find({ managerId }).exec();

    for (const report of directReports) {
      reports.push(report);
      const indirectReports = await this.getAllReports(report._id.toString());
      reports.push(...indirectReports);
    }

    return reports;
  }

  async getDepartments(): Promise<string[]> {
    const departments = await this.employeeModel.distinct('department').exec();
    return departments.filter((dept): dept is string => dept !== null && dept !== undefined);
  }

  async getHierarchy(): Promise<any> {
    // Get all top-level employees (those without managers)
    const topLevel = await this.employeeModel
      .find({ managerId: null, isActive: true })
      .populate('userId', 'name email')
      .exec();

    const buildTree = async (employee: Employee): Promise<any> => {
      // Query for direct reports - Mongoose handles ObjectId conversion automatically
      // But we'll use both ObjectId and string to be safe
      const employeeId = employee._id instanceof Types.ObjectId 
        ? employee._id 
        : new Types.ObjectId(employee._id.toString());
      
      // Try querying with ObjectId first
      let directReports = await this.employeeModel
        .find({ 
          managerId: employeeId, 
          isActive: true 
        })
        .populate('userId', 'name email')
        .sort({ name: 1 })
        .exec();

      // If no results, try with string comparison (in case managerId is stored as string)
      if (directReports.length === 0) {
        directReports = await this.employeeModel
          .find({ 
            managerId: employee._id.toString(), 
            isActive: true 
          })
          .populate('userId', 'name email')
          .sort({ name: 1 })
          .exec();
      }

      this.logger.debug(
        `Building tree for ${employee.name} (${employee._id}): Found ${directReports.length} direct reports`,
      );
      if (directReports.length > 0) {
        this.logger.verbose(
          `Direct reports for ${employee.name}: ${JSON.stringify(
            directReports.map((emp) => ({
              name: emp.name,
              id: emp._id,
              managerId: emp.managerId,
            })),
          )}`,
        );
      }

      const children = await Promise.all(directReports.map(buildTree));

      return {
        ...employee.toObject(),
        directReports: children,
        reportCount: directReports.length, // Use directReports.length instead of children.length
      };
    };

    return Promise.all(topLevel.map(buildTree));
  }
}

