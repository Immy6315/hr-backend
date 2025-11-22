# MongoDB Schema Architecture Diagram

## Survey Management System - Database Schema Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MONGODB COLLECTIONS                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER Collection                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ _id: ObjectId                                                        │  │
│  │ name: String                                                          │  │
│  │ email: String (unique, indexed)                                     │  │
│  │ password: String (hashed)                                           │  │
│  │ role: Enum [admin, user, hr]                                        │  │
│  │ verified: Boolean                                                    │  │
│  │ isActive: Boolean                                                    │  │
│  │ verificationOtp: String?                                            │  │
│  │ otpExpiry: Date?                                                     │  │
│  │ profileImage: String?                                                │  │
│  │ phoneNumber: String?                                                 │  │
│  │ createdAt: Date (auto)                                               │  │
│  │ updatedAt: Date (auto)                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Indexes:                                                                   │
│    - email (unique)                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N (createdBy)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SURVEY Collection                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ _id: ObjectId                                                        │  │
│  │ name: String                                                          │  │
│  │ category: String?                                                    │  │
│  │ status: Enum [draft, active, paused, completed, archived]           │  │
│  │ isDeleted: Boolean                                                   │  │
│  │ createdBy: String (User._id)                                         │  │
│  │ description: String?                                                 │  │
│  │ publicUrl: String?                                                   │  │
│  │ privateUrl: String?                                                  │  │
│  │ startDate: Date?                                                     │  │
│  │ endDate: Date?                                                       │  │
│  │                                                                       │  │
│  │ ┌─ DENORMALIZED COUNTS (for performance) ───────────────────────┐   │  │
│  │ │ totalPages: Number                                             │   │  │
│  │ │ totalQuestions: Number                                         │   │  │
│  │ │ totalResponses: Number                                         │   │  │
│  │ └────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                       │  │
│  │ ┌─ EMBEDDED PAGES (denormalized for findAll) ───────────────────┐   │  │
│  │ │ pages: [SurveyPage]                                           │   │  │
│  │ │   - title: String                                             │   │  │
│  │ │   - description: String?                                     │   │  │
│  │ │   - uniqueOrder: String                                       │   │  │
│  │ └────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                       │  │
│  │ createdAt: Date (auto)                                               │  │
│  │ updatedAt: Date (auto)                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Indexes:                                                                   │
│    - {status: 1, isDeleted: 1}                                             │
│    - {category: 1, status: 1}                                              │
│    - {createdAt: -1}                                                       │
│    - {createdBy: 1}                                                         │
│    - {name: 'text', description: 'text'} (text search)                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N (surveyId)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SURVEY_PAGE_COLLECTION Collection                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ _id: ObjectId                                                        │  │
│  │ surveyId: ObjectId (ref: Survey, indexed)                            │  │
│  │ title: String                                                         │  │
│  │ description: String?                                                  │  │
│  │ uniqueOrder: String                                                   │  │
│  │ isDeleted: Boolean                                                    │  │
│  │                                                                        │  │
│  │ ┌─ EMBEDDED QUESTIONS (for single-page read performance) ──────────┐  │  │
│  │ │ questions: [SurveyQuestion]                                      │  │  │
│  │ │   ┌──────────────────────────────────────────────────────────┐   │  │  │
│  │ │   │ text: String                                             │   │  │  │
│  │ │   │ type: String (19 types supported)                        │   │  │  │
│  │ │   │ questionId: String (unique identifier)                   │   │  │  │
│  │ │   │ uniqueOrder: String                                      │   │  │  │
│  │ │   │ validationEnabled: Boolean                               │   │  │  │
│  │ │   │ mandatoryEnabled: Boolean                                 │   │  │  │
│  │ │   │ hintEnabled: Boolean                                      │   │  │  │
│  │ │   │ randomEnabled: Boolean                                   │   │  │  │
│  │ │   │ commentEnabled: Boolean                                   │   │  │  │
│  │ │   │ isDeleted: Boolean                                       │   │  │  │
│  │ │   │                                                           │   │  │  │
│  │ │   │ ┌─ EMBEDDED OPTIONS ──────────────────────────────────┐  │   │  │  │
│  │ │   │ │ options: [QuestionOption]                            │  │   │  │  │
│  │ │   │ │   - text: String                                     │  │   │  │  │
│  │ │   │ │   - seqNo: Number                                    │  │   │  │  │
│  │ │   │ │   - uniqueOrder: String                              │  │   │  │  │
│  │ │   │ │   - imageUrl: String?                                 │  │   │  │  │
│  │ │   │ │   - preSelected: Boolean                             │  │   │  │  │
│  │ │   │ │   - mandatoryEnabled: Boolean                        │  │   │  │  │
│  │ │   │ │   - score: String?                                   │  │   │  │  │
│  │ │   │ └──────────────────────────────────────────────────────┘  │   │  │  │
│  │ │   │                                                           │   │  │  │
│  │ │   │ ┌─ EMBEDDED VALIDATION ────────────────────────────────┐  │   │  │  │
│  │ │   │ │ validation: ValidationOptions?                      │  │   │  │  │
│  │ │   │ │   - maxLength: Number?                             │  │   │  │  │
│  │ │   │ │   - minLength: Number?                             │  │   │  │  │
│  │ │   │ │   - maxValue: String?                              │  │   │  │  │
│  │ │   │ │   - minValue: String?                              │  │   │  │  │
│  │ │   │ │   - format: String? (MM_DD_YYYY, etc.)            │  │   │  │  │
│  │ │   │ │   - scaleFrom: String?                              │  │   │  │  │
│  │ │   │ │   - scaleTo: String?                               │  │   │  │  │
│  │ │   │ │   - startLabel: String?                             │  │   │  │  │
│  │ │   │ │   - endLabel: String?                              │  │   │  │  │
│  │ │   │ │   - type: String?                                  │  │   │  │  │
│  │ │   │ └──────────────────────────────────────────────────────┘  │   │  │  │
│  │ │   │                                                           │   │  │  │
│  │ │   │ ┌─ EMBEDDED GRID ROWS (for MATRIX types) ───────────┐  │   │  │  │
│  │ │   │ │ gridRows: [GridRow]                                │  │   │  │  │
│  │ │   │ │   - text: String                                   │  │   │  │  │
│  │ │   │ │   - uniqueOrder: String                            │  │   │  │  │
│  │ │   │ │   - columnsId: [String]                            │  │   │  │  │
│  │ │   │ │   - score: [String]                                │  │   │  │  │
│  │ │   │ │   - columns: [GridColumn]                           │  │   │  │  │
│  │ │   │ └──────────────────────────────────────────────────────┘  │   │  │  │
│  │ │   │                                                           │   │  │  │
│  │ │   │ ┌─ EMBEDDED GRID COLUMNS (for MATRIX types) ────────┐  │   │  │  │
│  │ │   │ │ columns: [GridColumn]                              │  │   │  │  │
│  │ │   │ │   - text: String                                   │  │   │  │  │
│  │ │   │ │   - uniqueOrder: String                            │  │   │  │  │
│  │ │   │ │   - mandatoryEnabled: Boolean                      │  │   │  │  │
│  │ │   │ │   - rowId: String?                                 │  │   │  │  │
│  │ │   │ │   - questionId: String?                            │  │   │  │  │
│  │ │   │ │   - question: Object? (nested question)           │  │   │  │  │
│  │ │   │ └──────────────────────────────────────────────────────┘  │   │  │  │
│  │ │   │                                                           │   │  │  │
│  │ │   │ ┌─ MATRIX-SPECIFIC FIELDS ──────────────────────────┐  │   │  │  │
│  │ │   │ │ columnRandomEnabled: Boolean?                     │  │   │  │  │
│  │ │   │ │ columnRandomizationType: String?                  │  │   │  │  │
│  │ │   │ │ weightageEnabled: Boolean?                        │  │   │  │  │
│  │ │   │ │ displayFormat: String?                            │  │   │  │  │
│  │ │   │ └──────────────────────────────────────────────────────┘  │   │  │  │
│  │ │   └──────────────────────────────────────────────────────────┘  │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │ ┌─ DENORMALIZED COUNT ───────────────────────────────────────────┐  │  │
│  │ │ totalQuestions: Number                                         │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │ createdAt: Date (auto)                                               │  │
│  │ updatedAt: Date (auto)                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Indexes:                                                                   │
│    - {surveyId: 1, uniqueOrder: 1}                                          │
│    - {surveyId: 1, isDeleted: 1}                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N (surveyId)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SURVEY_TEMPLATE Collection                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ _id: ObjectId                                                        │  │
│  │ name: String                                                          │  │
│  │ surveyId: ObjectId (ref: Survey, indexed)                            │  │
│  │ description: String?                                                 │  │
│  │ isDeleted: Boolean                                                    │  │
│  │                                                                        │  │
│  │ ┌─ DENORMALIZED COUNTS ───────────────────────────────────────────┐  │  │
│  │ │ totalQuestions: Number                                          │  │  │
│  │ │ totalPages: Number                                              │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │ createdAt: Date (auto)                                                │  │
│  │ updatedAt: Date (auto)                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Indexes:                                                                   │
│    - {surveyId: 1, isDeleted: 1}                                           │
│    - {isDeleted: 1}                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER_SURVEY Collection                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ _id: ObjectId                                                        │  │
│  │ userId: ObjectId (ref: User, indexed)                                │  │
│  │ surveyId: ObjectId (ref: Survey, indexed)                             │  │
│  │ status: Enum [started, in_progress, completed, abandoned]            │  │
│  │ ipAddress: String?                                                   │  │
│  │ isDeleted: Boolean                                                   │  │
│  │                                                                        │  │
│  │ ┌─ DENORMALIZED DATA (for faster access) ────────────────────────┐  │  │
│  │ │ surveyName: String?                                             │  │  │
│  │ │ surveyCategory: String?                                          │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │ ┌─ PROGRESS TRACKING ────────────────────────────────────────────┐  │  │
│  │ │ currentPageIndex: Number                                       │  │  │
│  │ │ totalPages: Number                                             │  │  │
│  │ │ answeredQuestions: Number                                     │  │  │
│  │ │ totalQuestions: Number                                         │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │ ┌─ TIMESTAMPS ───────────────────────────────────────────────────┐  │  │
│  │ │ startedAt: Date?                                              │  │  │
│  │ │ completedAt: Date?                                            │  │  │
│  │ │ lastActivityAt: Date?                                          │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │ createdAt: Date (auto)                                                │  │
│  │ updatedAt: Date (auto)                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Indexes:                                                                   │
│    - {userId: 1, surveyId: 1}                                               │
│    - {surveyId: 1, status: 1}                                               │
│    - {userId: 1, status: 1, createdAt: -1}                                  │
│    - {surveyId: 1, createdAt: -1}                                          │
│    - {lastActivityAt: -1}                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N (userSurveyId)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      USER_SURVEY_RESPONSE Collection                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ _id: ObjectId                                                        │  │
│  │ userId: ObjectId (ref: User, indexed)                                │  │
│  │ surveyId: ObjectId (ref: Survey, indexed)                            │  │
│  │ userSurveyId: ObjectId (ref: UserSurvey, indexed)                    │  │
│  │ questionId: String (indexed)                                         │  │
│  │ questionType: String                                                  │  │
│  │ response: Mixed (String | Number | Array | Object)                   │  │
│  │   - For MATRIX types: [{rowId, columnId, id?}, ...]                  │  │
│  │   - For simple types: ["value"] or "value"                           │  │
│  │                                                                        │  │
│  │ ┌─ DENORMALIZED DATA ─────────────────────────────────────────────┐  │  │
│  │ │ questionText: String?                                           │  │  │
│  │ │ pageIndex: Number?                                               │  │  │
│  │ │ questionOrder: Number?                                          │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │ ┌─ METADATA ─────────────────────────────────────────────────────┐  │  │
│  │ │ comment: String?                                               │  │  │
│  │ │ score: Number?                                                 │  │  │
│  │ │ answeredAt: Date?                                              │  │  │
│  │ └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │ isDeleted: Boolean                                                    │  │
│  │ createdAt: Date (auto)                                                │  │
│  │ updatedAt: Date (auto)                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Indexes:                                                                   │
│    - {userSurveyId: 1, questionId: 1} (unique)                             │
│    - {surveyId: 1, questionId: 1}                                          │
│    - {userId: 1, surveyId: 1}                                               │
│    - {surveyId: 1, createdAt: -1}                                          │
│    - {questionId: 1, createdAt: -1}                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         RELATIONSHIP DIAGRAM                                │
└─────────────────────────────────────────────────────────────────────────────┘

    USER (1)
      │
      │ creates (1:N)
      │
      ▼
    SURVEY (1)
      │
      ├─── (1:N) ───► SURVEY_PAGE_COLLECTION
      │                 │
      │                 └─── (1:N embedded) ───► SurveyQuestion
      │                                             │
      │                                             ├─── (1:N embedded) ───► QuestionOption
      │                                             ├─── (1:1 embedded) ───► ValidationOptions
      │                                             ├─── (1:N embedded) ───► GridRow
      │                                             └─── (1:N embedded) ───► GridColumn
      │
      └─── (1:N) ───► SURVEY_TEMPLATE
                        │
                        └─── references ───► SURVEY

    USER (1)
      │
      │ takes (1:N)
      │
      ▼
    USER_SURVEY (1)
      │
      │ references ───► SURVEY
      │
      └─── (1:N) ───► USER_SURVEY_RESPONSE
                        │
                        ├─── references ───► SURVEY
                        └─── references ───► questionId (in SurveyQuestion)

┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE DECISIONS                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. EMBEDDED DOCUMENTS (for Performance):
   ✅ Questions embedded in SurveyPageCollection
     → Single query to get all questions for a page
   ✅ Options, Validation, GridRows, GridColumns embedded in SurveyQuestion
     → Single query to get complete question structure
   ✅ Pages embedded in Survey (for findAll operations)
     → Single query to get survey summary

2. SEPARATE COLLECTIONS (for Scalability):
   ✅ SurveyPageCollection separate from Survey
     → Allows granular updates without loading entire survey
     → Better for large surveys with many pages
   ✅ UserSurvey separate from Survey
     → Tracks individual user progress
   ✅ UserSurveyResponse separate from UserSurvey
     → Allows querying responses independently

3. DENORMALIZATION (for Performance):
   ✅ totalPages, totalQuestions, totalResponses in Survey
     → Avoids aggregation queries
   ✅ surveyName, surveyCategory in UserSurvey
     → Faster access without join
   ✅ questionText, pageIndex in UserSurveyResponse
     → Faster analytics queries

4. INDEXING STRATEGY:
   ✅ Compound indexes on frequently queried fields
   ✅ Unique indexes where needed (email, userSurveyId+questionId)
   ✅ Text indexes for search functionality
   ✅ Timestamp indexes for sorting

5. SOFT DELETES:
   ✅ isDeleted flag on all collections
     → Allows recovery and audit trail
     → Maintains referential integrity

6. QUESTION TYPES SUPPORTED (19 types):
   ✅ SINGLE_CHOICE, MULTIPLE_CHOICE, CHECK_BOX, DROPDOWN
   ✅ SHORT_ANSWER, LONG_ANSWER (TEXTAREA), FULL_NAME
   ✅ NUMERIC_TEXTBOX, EMAIL_TEXTBOX, DATE, TIME
   ✅ IMAGE_SINGLE_CHOICE, RATING_SCALE, STAR_RATING
   ✅ FILE_UPLOAD, MULTIPLE_CHOICE_GRID, CHECK_BOX_GRID
   ✅ MATRIX_CHECK_BOX, MATRIX_RADIO_BOX

