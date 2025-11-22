import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { RabbitMQModule } from '../services/rabbitmq.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [RabbitMQModule, MailerModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

