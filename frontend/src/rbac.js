export const CAPABILITIES = {
  afterSalesDashboardView: 'after_sales.dashboard.view',
  afterSalesCasesView: 'after_sales.cases.view',
  afterSalesCasesManage: 'after_sales.cases.manage',
  supervisorDashboardView: 'supervisor.dashboard.view',
  supervisorTicketsView: 'supervisor.tickets.view',
  supervisorDispatchView: 'supervisor.dispatch.view',
  supervisorTrackingView: 'supervisor.tracking.view',
  technicianDashboardView: 'technician.dashboard.view',
  technicianJobsView: 'technician.jobs.view',
  technicianScheduleView: 'technician.schedule.view',
  technicianNavigationView: 'technician.navigation.view',
  technicianChecklistView: 'technician.checklist.view',
  technicianMessagesView: 'technician.messages.view',
  technicianHistoryView: 'technician.history.view',
  technicianProfileView: 'technician.profile.view',
  manageStaffCapabilities: 'users.capabilities.manage_staff',
  userDirectoryView: 'users.directory.view',
  adminJobHistoryView: 'admin.job_history.view'
};

export const AFTER_SALES_DASHBOARD_CAPABILITIES = [
  CAPABILITIES.afterSalesDashboardView
];

export const AFTER_SALES_CASE_CAPABILITIES = [
  CAPABILITIES.afterSalesCasesView,
  CAPABILITIES.afterSalesCasesManage
];

export const AFTER_SALES_NAV_CAPABILITIES = [
  ...AFTER_SALES_DASHBOARD_CAPABILITIES,
  ...AFTER_SALES_CASE_CAPABILITIES
];

export const SUPERVISOR_DASHBOARD_CAPABILITIES = [
  CAPABILITIES.supervisorDashboardView
];

export const SUPERVISOR_TICKETS_CAPABILITIES = [
  CAPABILITIES.supervisorTicketsView
];

export const SUPERVISOR_DISPATCH_CAPABILITIES = [
  CAPABILITIES.supervisorDispatchView
];

export const SUPERVISOR_TRACKING_CAPABILITIES = [
  CAPABILITIES.supervisorTrackingView
];

export const SUPERVISOR_USER_ACCESS_CAPABILITIES = [
  CAPABILITIES.manageStaffCapabilities
];

export const USER_DIRECTORY_CAPABILITIES = [
  CAPABILITIES.userDirectoryView
];

export const ADMIN_JOB_HISTORY_CAPABILITIES = [
  CAPABILITIES.adminJobHistoryView
];

export const TECHNICIAN_DASHBOARD_CAPABILITIES = [
  CAPABILITIES.technicianDashboardView
];

export const TECHNICIAN_JOBS_CAPABILITIES = [
  CAPABILITIES.technicianJobsView
];

export const TECHNICIAN_SCHEDULE_CAPABILITIES = [
  CAPABILITIES.technicianScheduleView
];

export const TECHNICIAN_NAVIGATION_CAPABILITIES = [
  CAPABILITIES.technicianNavigationView
];

export const TECHNICIAN_CHECKLIST_CAPABILITIES = [
  CAPABILITIES.technicianChecklistView
];

export const TECHNICIAN_MESSAGES_CAPABILITIES = [
  CAPABILITIES.technicianMessagesView
];

export const TECHNICIAN_HISTORY_CAPABILITIES = [
  CAPABILITIES.technicianHistoryView
];

export const TECHNICIAN_PROFILE_CAPABILITIES = [
  CAPABILITIES.technicianProfileView
];

export const TECHNICIAN_ACCESS_CAPABILITIES = [
  ...TECHNICIAN_DASHBOARD_CAPABILITIES,
  ...TECHNICIAN_JOBS_CAPABILITIES,
  ...TECHNICIAN_SCHEDULE_CAPABILITIES,
  ...TECHNICIAN_NAVIGATION_CAPABILITIES,
  ...TECHNICIAN_CHECKLIST_CAPABILITIES,
  ...TECHNICIAN_MESSAGES_CAPABILITIES,
  ...TECHNICIAN_HISTORY_CAPABILITIES,
  ...TECHNICIAN_PROFILE_CAPABILITIES
];

export const ADMIN_WORKSPACE_ROLES = ['superadmin', 'admin'];
export const ADMIN_SCOPED_ROLES = [...ADMIN_WORKSPACE_ROLES];
export const DELEGATED_AUTHORITY_ROLES = ['technician'];

const getRoleValue = (roleOrUser) =>
  (typeof roleOrUser === 'string' ? roleOrUser : roleOrUser?.role) || '';

export const hasCapability = (user, capability) =>
  Array.isArray(user?.capabilities) && user.capabilities.includes(capability);

export const hasAnyCapability = (user, capabilities = []) =>
  capabilities.some((capability) => hasCapability(user, capability));

export const hasRoleCapability = (user, role, capabilities = []) =>
  user?.role === role && hasAnyCapability(user, capabilities);

export const canAccessAfterSalesFeatures = (user) =>
  (user?.role === 'superadmin' || user?.role === 'admin') && hasAnyCapability(user, AFTER_SALES_NAV_CAPABILITIES);

export const canAccessSupervisorFeatures = (user) =>
  (user?.role === 'superadmin' || user?.role === 'admin') && hasAnyCapability(user, [
    ...SUPERVISOR_DASHBOARD_CAPABILITIES,
    ...SUPERVISOR_TICKETS_CAPABILITIES,
    ...SUPERVISOR_DISPATCH_CAPABILITIES,
    ...SUPERVISOR_TRACKING_CAPABILITIES,
    ...SUPERVISOR_USER_ACCESS_CAPABILITIES
  ]);

export const canAccessTechnicianWorkspace = (user) =>
  hasRoleCapability(user, 'technician', TECHNICIAN_ACCESS_CAPABILITIES);

export const canAccessAdminWorkspace = (user) =>
  ADMIN_WORKSPACE_ROLES.includes(user?.role);

export const isAdminScopedRole = (roleOrUser) =>
  ADMIN_SCOPED_ROLES.includes(getRoleValue(roleOrUser));

export const canReceiveDelegatedAuthority = (roleOrUser) =>
  DELEGATED_AUTHORITY_ROLES.includes(getRoleValue(roleOrUser));

export const isSuperadmin = (user) =>
  user?.role === 'superadmin';

export const canViewAdminUserDirectory = (user) =>
  isSuperadmin(user) || (user?.role === 'admin' && hasAnyCapability(user, USER_DIRECTORY_CAPABILITIES));

export const canManageStaffAccess = (user) =>
  isSuperadmin(user);

export const canManageStaffTargetRole = (roleOrUser) =>
  canReceiveDelegatedAuthority(roleOrUser);
