# Impact Plus Backend

NestJS backend for Impact Plus HR Platform with MongoDB, Redis, and RabbitMQ integration.

## Features

- ✅ MongoDB connection with connection pooling
- ✅ Redis caching for faster responses
- ✅ RabbitMQ for message queuing (future use cases)
- ✅ Complete authentication system (Login, Register, JWT)
- ✅ Survey Builder APIs (19 question types supported)
- ✅ Survey Collector APIs
- ✅ Swagger API documentation
- ✅ Rate limiting with Throttler
- ✅ Input validation with class-validator

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (running locally or connection string)
- Redis (optional, for caching)
- RabbitMQ (optional, for message queuing)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```env
MONGODB_URI=mongodb://localhost:27017/impact-plus
JWT_SECRET=your-super-secret-jwt-key
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_URL=amqp://localhost:5672
```

## Running the Application

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run build
npm run start:prod
```

## API Documentation

Once the server is running, visit:
- Swagger UI: http://localhost:3000/api/docs
- Health Check: http://localhost:3000/api/health

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify-otp` - Verify email OTP
- `GET /api/auth/validate-token` - Validate JWT token
- `GET /api/auth/me` - Get current user profile

### Survey Builder APIs
- `GET /api/survey-builder/surveys/:surveyId` - Get Survey
- `POST /api/survey-builder/surveys/:surveyId/pages` - Create Survey Page
- `GET /api/survey-builder/surveys/:surveyId/pages/:pageId` - Get Survey Page
- `PUT /api/survey-builder/surveys/:surveyId/pages/:pageId` - Update Survey Page
- `DELETE /api/survey-builder/surveys/:surveyId/pages/:pageId` - Delete Survey Page
- `POST /api/survey-builder/surveys/:surveyId/pages/:pageId/questions` - Create Question (supports all 19 types)
- `GET /api/survey-builder/surveys/:surveyId/pages/:pageId/questions/:questionIndex` - Get Question
- `PUT /api/survey-builder/surveys/:surveyId/pages/:pageId/questions/:questionIndex` - Update Question
- `DELETE /api/survey-builder/surveys/:surveyId/pages/:pageId/questions/:questionIndex` - Delete Question
- `PATCH /api/survey-builder/surveys/:surveyId/pages/:pageId/questions/:questionIndex/restore` - Restore Question

### Supported Question Types
1. SINGLE_CHOICE
2. MULTIPLE_CHOICE
3. CHECK_BOX
4. DROPDOWN
5. SHORT_ANSWER
6. LONG_ANSWER (TEXTAREA)
7. FULL_NAME
8. NUMERIC_TEXTBOX
9. EMAIL_TEXTBOX
10. DATE
11. TIME
12. IMAGE_SINGLE_CHOICE
13. RATING_SCALE
14. STAR_RATING
15. FILE_UPLOAD
16. MULTIPLE_CHOICE_GRID
17. CHECK_BOX_GRID
18. MATRIX_CHECK_BOX
19. MATRIX_RADIO_BOX

### Survey Collector APIs
- `POST /api/user-surveys` - Start a survey
- `GET /api/user-surveys` - Get user surveys
- `POST /api/responses` - Submit response
- `GET /api/responses/user-survey/:userSurveyId` - Get responses for a survey

## MongoDB Architecture

The system uses optimized MongoDB schemas with:
- **Embedded documents** for better read performance (questions embedded in pages)
- **Separate collections** for scalability (SurveyPageCollection for pages)
- **Proper indexing** for fast queries
- **Denormalized data** where needed for faster access

### Collections:
1. **surveys** - Main survey metadata
2. **surveypagecollections** - Survey pages with embedded questions
3. **usersurveys** - User survey instances
4. **usersurveyresponses** - Individual question responses

## Project Structure

```
src/
├── auth/              # Authentication module
├── users/            # Users module
├── surveys/          # Survey module
│   ├── schemas/      # MongoDB schemas
│   ├── dto/         # Data Transfer Objects
│   ├── survey-pages.service.ts
│   ├── survey-questions.service.ts
│   └── surveys.service.ts
├── redis/            # Redis module
├── services/         # RabbitMQ service
└── app.module.ts     # Root module
```

## Environment Variables

See `.env.example` for all available environment variables.

## License

MIT
