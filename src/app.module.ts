import { Module, MiddlewareConsumer, NestModule, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SurveysModule } from './surveys/surveys.module';
import { EmployeesModule } from './employees/employees.module';
import { DepartmentsModule } from './departments/departments.module';
import { Feedback360Module } from './feedback360/feedback360.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { redisStore } from 'cache-manager-redis-yet';
import { RabbitMQModule } from './services/rabbitmq.module';
import { MailerModule } from './mailer/mailer.module';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/roles.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { OrganizationsModule } from './organizations/organizations.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/impact-plus',
        // Performance optimizations
        maxPoolSize: 50,
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
      }),
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisEnabled = configService.get('REDIS_ENABLED') === 'true';
        const logger = new Logger('CacheModule');

        if (redisEnabled && process.env.NODE_ENV !== 'test') {
          try {
            const redisHost = configService.get('REDIS_HOST') || 'localhost';
            const redisPort = parseInt(configService.get('REDIS_PORT') || '6379');
            const redisPassword = configService.get('REDIS_PASSWORD');

            const store = await redisStore({
              socket: {
                host: redisHost,
                port: redisPort,
              },
              username: 'default',
              password: redisPassword,
              ttl: 60 * 60 * 1000, // 1 hour in milliseconds
            });

            logger.log(`✅ Redis connected: ${redisHost}:${redisPort}`);
            return { store, ttl: 60 * 60 };
          } catch (error) {
            logger.error(`❌ Redis connection failed, using in-memory cache: ${error.message}`);
            return { ttl: 60 * 60 }; // Fallback to in-memory
          }
        } else {
          logger.warn('Redis cache disabled, using in-memory cache');
          return { ttl: 60 * 60 };
        }
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = config.get<number>('THROTTLE_TTL') || 60;
        const limit = config.get<number>('THROTTLE_LIMIT') || 10;

        return {
          ttl,
          limit,
          throttlers: [],
        };
      },
    }),
    RedisModule,
    AuthModule,
    UsersModule,
    SurveysModule,
    EmployeesModule,
    DepartmentsModule,
    Feedback360Module,
    RabbitMQModule,
    MailerModule,
    OrganizationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}

