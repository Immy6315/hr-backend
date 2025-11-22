import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService, EmailMessage } from '../services/rabbitmq.service';
import { MailerService } from './mailer.service';
import { getRabbitMQConfig } from '../config/rabbitmq.config';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

@Injectable()
export class EmailConsumerService implements OnModuleInit {
  private readonly logger = new Logger(EmailConsumerService.name);
  private consumerTag: string | null = null;

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Start consuming emails after a short delay to ensure RabbitMQ is connected
    setTimeout(() => {
      this.startConsuming().catch((err) => {
        this.logger.error(`❌ Failed to start email consumer: ${err.message}`);
      });
    }, 2000);
  }

  private async startConsuming(): Promise<void> {
    try {
      const rabbitMQConfig = getRabbitMQConfig(this.configService);
      const channel = this.rabbitMQService.getChannel();

      if (!channel || !this.rabbitMQService.isChannelReady()) {
        this.logger.warn('⏳ RabbitMQ channel not available yet. Will retry...');
        setTimeout(() => this.startConsuming(), 5000);
        return;
      }

      // Set prefetch to process one email at a time
      await channel.prefetch(1);

      // Start consuming messages
      const consumeResult = await channel.consume(
        rabbitMQConfig.queues.email,
        async (message: amqp.ConsumeMessage | null) => {
          if (!message) {
            return;
          }

          try {
            const emailData: EmailMessage = JSON.parse(message.content.toString());
            this.logger.log(`📨 Processing email for ${emailData.to}`);

            // Send email using mailer service
            const sent = await this.mailerService.sendMail({
              to: emailData.to,
              subject: emailData.subject,
              html: emailData.html || '',
              text: emailData.text,
            });

            if (sent) {
              // Acknowledge message on success
              channel.ack(message);
              this.logger.log(`✅ Email processed and sent successfully to ${emailData.to}`);
            } else {
              // Reject and requeue on failure
              channel.nack(message, false, true);
              this.logger.warn(`⚠️ Failed to send email to ${emailData.to}, requeuing...`);
            }
          } catch (error: any) {
            this.logger.error(`❌ Error processing email: ${error.message}`);
            
            // Check retry count
            const retryCount = (message.properties.headers?.['x-retry-count'] as number) || 0;
            const maxRetries = 3;

            if (retryCount < maxRetries) {
              // Requeue with incremented retry count
              const updatedHeaders = {
                ...message.properties.headers,
                'x-retry-count': retryCount + 1,
              };
              
              channel.nack(message, false, true);
              this.logger.warn(`⚠️ Requeuing email (retry ${retryCount + 1}/${maxRetries})`);
            } else {
              // Max retries reached, send to dead letter queue
              channel.nack(message, false, false);
              this.logger.error(`❌ Max retries reached for email. Sent to dead letter queue.`);
            }
          }
        },
        { noAck: false },
      );

      this.consumerTag = consumeResult.consumerTag;
      this.logger.log(`✅ Email consumer started. Consumer tag: ${this.consumerTag}`);
    } catch (error: any) {
      this.logger.error(`❌ Error starting email consumer: ${error.message}`);
      // Retry after 5 seconds
      setTimeout(() => this.startConsuming(), 5000);
    }
  }

  async stopConsuming(): Promise<void> {
    if (this.consumerTag) {
      try {
        const channel = this.rabbitMQService.getChannel();
        if (channel) {
          await channel.cancel(this.consumerTag);
          this.logger.log('✅ Email consumer stopped');
        }
      } catch (error) {
        this.logger.error('❌ Error stopping email consumer:', error);
      }
    }
  }
}

