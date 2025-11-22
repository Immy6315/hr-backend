import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Department } from './schemas/department.schema';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Employee } from '../employees/schemas/employee.schema';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name) private departmentModel: Model<Department>,
    @InjectModel(Employee.name) private employeeModel: Model<Employee>,
  ) {}

  async create(createDepartmentDto: CreateDepartmentDto): Promise<Department> {
    // Check if department name already exists
    const existingDepartment = await this.departmentModel.findOne({
      name: createDepartmentDto.name.trim(),
    }).exec();

    if (existingDepartment) {
      throw new BadRequestException('Department with this name already exists');
    }

    // Check if department code already exists (if provided)
    if (createDepartmentDto.code) {
      const existingCode = await this.departmentModel.findOne({
        code: createDepartmentDto.code.trim(),
      }).exec();

      if (existingCode) {
        throw new BadRequestException('Department with this code already exists');
      }
    }

    // Validate parent department exists if provided
    if (createDepartmentDto.parentDepartmentId) {
      const parent = await this.departmentModel.findById(createDepartmentDto.parentDepartmentId).exec();
      if (!parent) {
        throw new NotFoundException('Parent department not found');
      }
    }

    // Validate department head exists if provided
    if (createDepartmentDto.departmentHeadId) {
      const head = await this.employeeModel.findById(createDepartmentDto.departmentHeadId).exec();
      if (!head) {
        throw new NotFoundException('Department head not found');
      }
    }

    // Validate HR manager exists if provided
    if (createDepartmentDto.hrManagerId) {
      const hrManager = await this.employeeModel.findById(createDepartmentDto.hrManagerId).exec();
      if (!hrManager) {
        throw new NotFoundException('HR manager not found');
      }
    }

    const department = new this.departmentModel({
      ...createDepartmentDto,
      name: createDepartmentDto.name.trim(),
      code: createDepartmentDto.code?.trim(),
      employeeCount: 0,
    });

    const savedDepartment = await department.save();
    await this.updateEmployeeCount(savedDepartment._id.toString());
    
    return savedDepartment;
  }

  async findAll(filters?: {
    status?: string;
    isActive?: boolean;
    location?: string;
    parentDepartmentId?: string;
    search?: string;
  }): Promise<Department[]> {
    const query: any = {};

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters?.location) {
      query.location = filters.location;
    }

    if (filters?.parentDepartmentId) {
      query.parentDepartmentId = filters.parentDepartmentId;
    } else if (filters?.parentDepartmentId === null) {
      query.parentDepartmentId = null;
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { code: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
        { location: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return this.departmentModel
      .find(query)
      .populate('parentDepartmentId', 'name code')
      .populate('departmentHeadId', 'name email position')
      .populate('hrManagerId', 'name email')
      .sort({ name: 1 })
      .exec();
  }

  async findOne(id: string): Promise<Department> {
    const department = await this.departmentModel
      .findById(id)
      .populate('parentDepartmentId', 'name code description')
      .populate('departmentHeadId', 'name email position department')
      .populate('hrManagerId', 'name email position')
      .exec();

    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }

    return department;
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto): Promise<Department> {
    const department = await this.departmentModel.findById(id).exec();

    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }

    // Check if name is being changed and conflicts
    if (updateDepartmentDto.name && updateDepartmentDto.name.trim() !== department.name) {
      const existing = await this.departmentModel.findOne({
        name: updateDepartmentDto.name.trim(),
        _id: { $ne: id },
      }).exec();

      if (existing) {
        throw new BadRequestException('Department with this name already exists');
      }
    }

    // Check if code is being changed and conflicts
    if (updateDepartmentDto.code && updateDepartmentDto.code.trim() !== department.code) {
      const existing = await this.departmentModel.findOne({
        code: updateDepartmentDto.code.trim(),
        _id: { $ne: id },
      }).exec();

      if (existing) {
        throw new BadRequestException('Department with this code already exists');
      }
    }

    // Validate parent department (prevent circular references)
    if (updateDepartmentDto.parentDepartmentId) {
      if (updateDepartmentDto.parentDepartmentId === id) {
        throw new BadRequestException('Department cannot be its own parent');
      }

      const isCircular = await this.checkCircularReference(id, updateDepartmentDto.parentDepartmentId);
      if (isCircular) {
        throw new BadRequestException('Cannot set parent: would create circular reference');
      }

      const parent = await this.departmentModel.findById(updateDepartmentDto.parentDepartmentId).exec();
      if (!parent) {
        throw new NotFoundException('Parent department not found');
      }
    }

    // Validate department head
    if (updateDepartmentDto.departmentHeadId) {
      const head = await this.employeeModel.findById(updateDepartmentDto.departmentHeadId).exec();
      if (!head) {
        throw new NotFoundException('Department head not found');
      }
    }

    // Validate HR manager
    if (updateDepartmentDto.hrManagerId) {
      const hrManager = await this.employeeModel.findById(updateDepartmentDto.hrManagerId).exec();
      if (!hrManager) {
        throw new NotFoundException('HR manager not found');
      }
    }

    Object.assign(department, {
      ...updateDepartmentDto,
      name: updateDepartmentDto.name ? updateDepartmentDto.name.trim() : department.name,
      code: updateDepartmentDto.code ? updateDepartmentDto.code.trim() : department.code,
    });

    const updated = await department.save();
    await this.updateEmployeeCount(id);
    
    return updated;
  }

  async remove(id: string): Promise<void> {
    const department = await this.departmentModel.findById(id).exec();

    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }

    // Check if department has employees
    const employeeCount = await this.employeeModel.countDocuments({ department: department.name }).exec();
    if (employeeCount > 0) {
      throw new BadRequestException(
        `Cannot delete department: ${employeeCount} employee(s) are assigned to this department. Please reassign them first.`
      );
    }

    // Check if department has sub-departments
    const subDepartments = await this.departmentModel.countDocuments({ parentDepartmentId: id }).exec();
    if (subDepartments > 0) {
      throw new BadRequestException(
        `Cannot delete department: ${subDepartments} sub-department(s) exist. Please reassign or delete them first.`
      );
    }

    await this.departmentModel.findByIdAndDelete(id).exec();
  }

  async getSubDepartments(parentId: string): Promise<Department[]> {
    return this.departmentModel
      .find({ parentDepartmentId: parentId, isActive: true })
      .populate('departmentHeadId', 'name email')
      .sort({ name: 1 })
      .exec();
  }

  async getDepartmentHierarchy(): Promise<any> {
    const topLevel = await this.departmentModel
      .find({ parentDepartmentId: null, isActive: true })
      .populate('departmentHeadId', 'name email position')
      .exec();

    const buildTree = async (dept: Department): Promise<any> => {
      const subDepartments = await this.departmentModel
        .find({ parentDepartmentId: dept._id, isActive: true })
        .populate('departmentHeadId', 'name email position')
        .exec();

      const children = await Promise.all(subDepartments.map(buildTree));

      return {
        ...dept.toObject(),
        subDepartments: children,
        subDepartmentCount: children.length,
      };
    };

    return Promise.all(topLevel.map(buildTree));
  }

  async getEmployeesByDepartment(departmentId: string): Promise<Employee[]> {
    const department = await this.departmentModel.findById(departmentId).exec();
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return this.employeeModel
      .find({ department: department.name, isActive: true })
      .populate('managerId', 'name email')
      .sort({ name: 1 })
      .exec();
  }

  async updateEmployeeCount(departmentId: string): Promise<void> {
    const department = await this.departmentModel.findById(departmentId).exec();
    if (!department) return;

    const count = await this.employeeModel.countDocuments({
      department: department.name,
      isActive: true,
    }).exec();

    await this.departmentModel.findByIdAndUpdate(departmentId, {
      employeeCount: count,
    }).exec();
  }

  async getLocations(): Promise<string[]> {
    const locations = await this.departmentModel.distinct('location').exec();
    return locations.filter((loc): loc is string => loc !== null && loc !== undefined);
  }

  async getCostCenters(): Promise<string[]> {
    const costCenters = await this.departmentModel.distinct('costCenter').exec();
    return costCenters.filter((cc): cc is string => cc !== null && cc !== undefined);
  }

  private async checkCircularReference(departmentId: string, potentialParentId: string): Promise<boolean> {
    const subDepartments = await this.getAllSubDepartments(departmentId);
    return subDepartments.some((dept) => dept._id.toString() === potentialParentId);
  }

  private async getAllSubDepartments(parentId: string): Promise<Department[]> {
    const result: Department[] = [];
    const directSubs = await this.departmentModel.find({ parentDepartmentId: parentId }).exec();

    for (const sub of directSubs) {
      result.push(sub);
      const indirectSubs = await this.getAllSubDepartments(sub._id.toString());
      result.push(...indirectSubs);
    }

    return result;
  }
}
