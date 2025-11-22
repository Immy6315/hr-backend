import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { EmailConsumerService } from './email-consumer.service';
import { RabbitMQModule } from '../services/rabbitmq.module';

@Module({
  imports: [RabbitMQModule],
  providers: [MailerService, EmailConsumerService],
  exports: [MailerService],
})
export class MailerModule {}

