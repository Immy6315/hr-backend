import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { getRabbitMQConfig } from '../config/rabbitmq.config';

export interface EmailMessage {
  to: string;
  subject: string;
  template?: string;
  context?: any;
  html?: string;
  text?: string;
  priority?: 'high' | 'normal' | 'low';
  retryCount?: number;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private isConnected = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private rabbitMQConfig: any;

  constructor(private readonly configService: ConfigService) {
    this.rabbitMQConfig = getRabbitMQConfig(configService);
  }

  async onModuleInit() {
    setTimeout(() => {
      this.initializeRabbitMQ().catch((err) =>
        this.logger.warn(`⚠️ RabbitMQ init deferred; app continues to run. ${err?.message || err}`),
      );
    }, 0);
  }

  private async initializeRabbitMQ(): Promise<void> {
    await this.connect();
    if (this.isConnected) {
      await this.setupQueues();
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.log('ℹ️ Already connected to RabbitMQ');
      return;
    }

    try {
      this.logger.log('🔌 Connecting to RabbitMQ...');

      // amqp.connect returns Promise<Connection>
      const connection = (await amqp.connect(
        this.rabbitMQConfig.url,
        this.rabbitMQConfig.options,
      )) as unknown as amqp.Connection;

      this.connection = connection;

      this.connection.on('error', (error) => {
        this.logger.error('❌ RabbitMQ connection error:', error);
        this.isConnected = false;
        this.handleReconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('⚠️ RabbitMQ connection closed');
        this.isConnected = false;
        this.handleReconnect();
      });

      const channel = await (connection as any).createChannel();
      this.channel = channel;

      this.channel.on('error', (error) => {
        this.logger.error('❌ RabbitMQ channel error:', error);
      });

      this.isConnected = true;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.logger.log('✅ Successfully connected to RabbitMQ');
    } catch (error) {
      this.logger.error('❌ Failed to connect to RabbitMQ:', error);
      this.handleReconnect();
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }
    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.logger.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(async () => {
      this.isReconnecting = false; // Reset flag before trying to connect
      await this.connect();
      if (this.isConnected) {
        await this.setupQueues();
      } else {
        // If connection failed, handleReconnect will be called again by the catch block in connect()
        // But we need to make sure we don't get stuck if connect() doesn't throw but fails silently (unlikely)
      }
    }, delay);
  }

  private async setupQueues(): Promise<void> {
    if (!this.channel) {
      this.logger.warn('⏳ Channel not initialized yet; will setup queues after connection');
      return;
    }

    try {
      // Create dead letter exchange
      await this.channel.assertExchange(
        `${this.rabbitMQConfig.exchanges.email}.dlx`,
        'direct',
        { durable: true },
      );

      // Create dead letter queue
      await this.channel.assertQueue(this.rabbitMQConfig.queues.emailDeadLetter, {
        durable: true,
        arguments: {
          'x-message-ttl': 24 * 60 * 60 * 1000, // 24 hours
        },
      });

      await this.channel.bindQueue(
        this.rabbitMQConfig.queues.emailDeadLetter,
        `${this.rabbitMQConfig.exchanges.email}.dlx`,
        this.rabbitMQConfig.routingKeys.email,
      );

      // Create main email exchange
      await this.channel.assertExchange(this.rabbitMQConfig.exchanges.email, 'direct', {
        durable: true,
      });

      // Create main email queue with dead letter configuration
      await this.channel.assertQueue(this.rabbitMQConfig.queues.email, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': `${this.rabbitMQConfig.exchanges.email}.dlx`,
          'x-dead-letter-routing-key': this.rabbitMQConfig.routingKeys.email,
          'x-message-ttl': 5 * 60 * 1000, // 5 minutes before retry
        },
      });

      await this.channel.bindQueue(
        this.rabbitMQConfig.queues.email,
        this.rabbitMQConfig.exchanges.email,
        this.rabbitMQConfig.routingKeys.email,
      );

      await this.channel.prefetch(1);

      this.logger.log('✅ RabbitMQ queues and exchanges setup completed');
    } catch (error) {
      this.logger.error('❌ Failed to setup queues:', error);
    }
  }

  async publishEmail(emailData: EmailMessage): Promise<boolean> {
    if (!this.isConnected || !this.channel) {
      this.logger.error('❌ RabbitMQ not connected, cannot publish email');
      return false;
    }

    try {
      const message = {
        ...emailData,
        timestamp: new Date().toISOString(),
        retryCount: emailData.retryCount || 0,
      };

      const buffer = Buffer.from(JSON.stringify(message));

      const result = this.channel!.publish(
        this.rabbitMQConfig.exchanges.email,
        this.rabbitMQConfig.routingKeys.email,
        buffer,
        {
          persistent: true,
          priority: this.getPriority(emailData.priority),
          headers: {
            'x-retry-count': message.retryCount,
          },
        },
      );

      if (result) {
        this.logger.log(`📧 Email queued successfully for ${emailData.to}`);
        return true;
      } else {
        this.logger.error(`❌ Failed to queue email for ${emailData.to}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`❌ Error publishing email for ${emailData.to}:`, error);
      return false;
    }
  }

  private getPriority(priority?: 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'high':
        return 10;
      case 'low':
        return 1;
      default:
        return 5;
    }
  }

  getChannel(): amqp.Channel | null {
    return this.channel;
  }

  isChannelReady(): boolean {
    return this.isConnected && this.channel !== null;
  }

  async getQueueStatus(): Promise<any> {
    if (!this.isConnected || !this.channel) {
      return { connected: false };
    }

    try {
      const emailQueue = await this.channel!.checkQueue(this.rabbitMQConfig.queues.email);
      const deadLetterQueue = await this.channel!.checkQueue(
        this.rabbitMQConfig.queues.emailDeadLetter,
      );

      return {
        connected: true,
        emailQueue: {
          name: emailQueue.queue,
          messageCount: emailQueue.messageCount,
          consumerCount: emailQueue.consumerCount,
        },
        deadLetterQueue: {
          name: deadLetterQueue.queue,
          messageCount: deadLetterQueue.messageCount,
          consumerCount: deadLetterQueue.consumerCount,
        },
      };
    } catch (error) {
      this.logger.error('❌ Error getting queue status:', error);
      return { connected: false, error: error.message };
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        // Connection.close() returns a Promise<void>
        if (typeof (this.connection as any).close === 'function') {
          await (this.connection as any).close();
        }
        this.connection = null;
      }

      this.isConnected = false;
      this.logger.log('🔌 Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('❌ Error disconnecting from RabbitMQ:', error);
    }
  }
}

