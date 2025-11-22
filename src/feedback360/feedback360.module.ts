import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Feedback360Controller } from './feedback360.controller';
import { Feedback360Service } from './feedback360.service';
import { Feedback360Review, Feedback360ReviewSchema } from './schemas/feedback360-review.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { SurveysModule } from '../surveys/surveys.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Feedback360Review.name, schema: Feedback360ReviewSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
    SurveysModule,
  ],
  controllers: [Feedback360Controller],
  providers: [Feedback360Service],
  exports: [Feedback360Service],
})
export class Feedback360Module {}

