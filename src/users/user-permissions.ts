import { UserRole } from './enums/user-role.enum';

export enum UserPermission {
  ORG_USER_MANAGE = 'org:user:manage',
  SURVEY_CREATE = 'survey:create',
  SURVEY_UPDATE = 'survey:update',
  SURVEY_DELETE = 'survey:delete',
  SURVEY_TRACK = 'survey:track',

  // Survey Tab Permissions
  SURVEY_VIEW_SUMMARY = 'survey:view:summary',
  SURVEY_VIEW_BUILDER = 'survey:view:builder',
  SURVEY_VIEW_PARTICIPANTS = 'survey:view:participants',
  SURVEY_VIEW_COMMUNICATIONS = 'survey:view:communications',
  SURVEY_VIEW_REPORTS = 'survey:view:reports',
  SURVEY_VIEW_AUDIT_LOGS = 'survey:view:audit_logs',

  // 1. Summary Actions
  SURVEY_SUMMARY_EDIT = 'survey:summary:edit',

  // 2. Builder - Page Actions
  SURVEY_BUILDER_PAGE_CREATE = 'survey:builder:page:create',
  SURVEY_BUILDER_PAGE_EDIT = 'survey:builder:page:edit',
  SURVEY_BUILDER_PAGE_DELETE = 'survey:builder:page:delete',

  // 2. Builder - Question Actions
  SURVEY_BUILDER_QUESTION_CREATE = 'survey:builder:question:create',
  SURVEY_BUILDER_QUESTION_EDIT = 'survey:builder:question:edit',
  SURVEY_BUILDER_QUESTION_DELETE = 'survey:builder:question:delete',

  // 3. Preview
  SURVEY_PREVIEW = 'survey:preview',

  // 4. Participants Actions
  SURVEY_PARTICIPANTS_UPLOAD = 'survey:participants:upload',
  SURVEY_PARTICIPANTS_ADD = 'survey:participants:add',
  SURVEY_PARTICIPANTS_EDIT = 'survey:participants:edit',
  SURVEY_PARTICIPANTS_DELETE = 'survey:participants:delete',

  // 5. Communications - Email Templates
  SURVEY_COMMUNICATIONS_TEMPLATE_ADD = 'survey:communications:template:add',
  SURVEY_COMMUNICATIONS_TEMPLATE_EDIT = 'survey:communications:template:edit',
  SURVEY_COMMUNICATIONS_TEMPLATE_DELETE = 'survey:communications:template:delete',

  // 5. Communications - Reminders
  SURVEY_COMMUNICATIONS_REMINDER_SEND = 'survey:communications:reminder:send',
  SURVEY_COMMUNICATIONS_REMINDER_VIEW = 'survey:communications:reminder:view',
  SURVEY_COMMUNICATIONS_REMINDER_EDIT = 'survey:communications:reminder:edit',

  // 5. Communications - Settings
  SURVEY_COMMUNICATIONS_SETTINGS_VIEW = 'survey:communications:settings:view',

  NOMINATION_VIEW = 'nomination:view',
  SURVEY_PARTICIPATE = 'survey:participate',
}

const ALL_PERMISSIONS = Object.values(UserPermission);

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  [UserRole.SUPER_ADMIN]: ALL_PERMISSIONS,
  [UserRole.ORG_ADMIN]: [
    UserPermission.ORG_USER_MANAGE,
    UserPermission.SURVEY_CREATE,
    UserPermission.SURVEY_UPDATE,
    UserPermission.SURVEY_DELETE,
    UserPermission.SURVEY_TRACK,
    // Tab access - all tabs
    UserPermission.SURVEY_VIEW_SUMMARY,
    UserPermission.SURVEY_VIEW_BUILDER,
    UserPermission.SURVEY_VIEW_PARTICIPANTS,
    UserPermission.SURVEY_VIEW_COMMUNICATIONS,
    UserPermission.SURVEY_VIEW_REPORTS,
    UserPermission.SURVEY_VIEW_AUDIT_LOGS,
    // Summary
    UserPermission.SURVEY_SUMMARY_EDIT,
    // Builder - Full access
    UserPermission.SURVEY_BUILDER_PAGE_CREATE,
    UserPermission.SURVEY_BUILDER_PAGE_EDIT,
    UserPermission.SURVEY_BUILDER_PAGE_DELETE,
    UserPermission.SURVEY_BUILDER_QUESTION_CREATE,
    UserPermission.SURVEY_BUILDER_QUESTION_EDIT,
    UserPermission.SURVEY_BUILDER_QUESTION_DELETE,
    // Preview
    UserPermission.SURVEY_PREVIEW,
    // Participants - Full access
    UserPermission.SURVEY_PARTICIPANTS_UPLOAD,
    UserPermission.SURVEY_PARTICIPANTS_ADD,
    UserPermission.SURVEY_PARTICIPANTS_EDIT,
    UserPermission.SURVEY_PARTICIPANTS_DELETE,
    // Communications - Full access
    UserPermission.SURVEY_COMMUNICATIONS_TEMPLATE_ADD,
    UserPermission.SURVEY_COMMUNICATIONS_TEMPLATE_EDIT,
    UserPermission.SURVEY_COMMUNICATIONS_TEMPLATE_DELETE,
    UserPermission.SURVEY_COMMUNICATIONS_REMINDER_SEND,
    UserPermission.SURVEY_COMMUNICATIONS_REMINDER_VIEW,
    UserPermission.SURVEY_COMMUNICATIONS_REMINDER_EDIT,
    UserPermission.SURVEY_COMMUNICATIONS_SETTINGS_VIEW,
  ],
  [UserRole.ORG_SUB_ADMIN]: [
    UserPermission.SURVEY_CREATE,
    UserPermission.SURVEY_UPDATE,
    UserPermission.SURVEY_TRACK,
    // Tab access - limited (no Communications or Audit Logs)
    UserPermission.SURVEY_VIEW_SUMMARY,
    UserPermission.SURVEY_VIEW_BUILDER,
    UserPermission.SURVEY_VIEW_PARTICIPANTS,
    UserPermission.SURVEY_VIEW_REPORTS,
    // Summary
    UserPermission.SURVEY_SUMMARY_EDIT,
    // Builder - Questions only (NO page CRUD)
    UserPermission.SURVEY_BUILDER_QUESTION_CREATE,
    UserPermission.SURVEY_BUILDER_QUESTION_EDIT,
    UserPermission.SURVEY_BUILDER_QUESTION_DELETE,
    // Preview
    UserPermission.SURVEY_PREVIEW,
    // Participants - Add and Edit only (NO upload or delete)
    UserPermission.SURVEY_PARTICIPANTS_ADD,
    UserPermission.SURVEY_PARTICIPANTS_EDIT,
    // Communications - NONE (can be granted via User Management)
    // Reports - View access via SURVEY_VIEW_REPORTS
  ],
  [UserRole.PARTICIPANT]: [
    UserPermission.NOMINATION_VIEW,
    UserPermission.SURVEY_PARTICIPATE,
  ],
};

export const getDefaultPermissionsForRole = (
  role: UserRole = UserRole.PARTICIPANT,
  override?: UserPermission[],
): UserPermission[] => {
  if (override && override.length > 0) {
    return Array.from(new Set(override));
  }
  return [...(DEFAULT_ROLE_PERMISSIONS[role] || [])];
};

export const ensureMandatoryPermissions = (
  role: UserRole,
  permissions: UserPermission[] = [],
): UserPermission[] => {
  const normalized = new Set<UserPermission>(permissions);
  if (role === UserRole.ORG_SUB_ADMIN) {
    normalized.add(UserPermission.SURVEY_TRACK);
  }
  return Array.from(normalized);
};

