import { UserRole } from './enums/user-role.enum';

export enum UserPermission {
  ORG_USER_MANAGE = 'org:user:manage',
  SURVEY_CREATE = 'survey:create',
  SURVEY_UPDATE = 'survey:update',
  SURVEY_DELETE = 'survey:delete',
  SURVEY_TRACK = 'survey:track',
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
  ],
  [UserRole.ORG_SUB_ADMIN]: [
    UserPermission.SURVEY_CREATE,
    UserPermission.SURVEY_UPDATE,
    UserPermission.SURVEY_TRACK,
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

