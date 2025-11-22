import { ConfigService } from '@nestjs/config';

export const getRabbitMQConfig = (configService: ConfigService) => ({
  url: configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672',
  queues: {
    email: configService.get<string>('RABBITMQ_EMAIL_QUEUE') || 'email_queue',
    emailDeadLetter: configService.get<string>('RABBITMQ_EMAIL_DLQ') || 'email_dead_letter_queue',
  },
  exchanges: {
    email: configService.get<string>('RABBITMQ_EMAIL_EXCHANGE') || 'email_exchange',
  },
  routingKeys: {
    email: configService.get<string>('RABBITMQ_EMAIL_ROUTING_KEY') || 'email.send',
  },
  options: {
    heartbeat: configService.get<number>('RABBITMQ_HEARTBEAT') || 60,
    connectionTimeout: configService.get<number>('RABBITMQ_CONNECTION_TIMEOUT') || 30000,
    channelMax: configService.get<number>('RABBITMQ_CHANNEL_MAX') || 0,
    frameMax: configService.get<number>('RABBITMQ_FRAME_MAX') || 0,
    retry: {
      attempts: configService.get<number>('RABBITMQ_RETRY_ATTEMPTS') || 3,
      delay: configService.get<number>('RABBITMQ_RETRY_DELAY') || 1000,
    },
  },
});

