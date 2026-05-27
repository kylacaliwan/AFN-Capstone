import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FiActivity,
  FiAlertTriangle,
  FiBell,
  FiCalendar,
  FiClipboard,
  FiFileText,
  FiHome,
  FiLayers,
  FiMap,
  FiMessageSquare,
  FiPackage,
  FiRefreshCw,
  FiSettings,
  FiTool,
  FiTrendingUp,
  FiUsers
} from 'react-icons/fi';
import { fetchDashboardStats } from '../../api/api';
import {
  ADMIN_JOB_HISTORY_CAPABILITIES,
  AFTER_SALES_CASE_CAPABILITIES,
  AFTER_SALES_DASHBOARD_CAPABILITIES,
  TECHNICIAN_CHECKLIST_CAPABILITIES,
  TECHNICIAN_DASHBOARD_CAPABILITIES,
  TECHNICIAN_JOBS_CAPABILITIES,
  TECHNICIAN_MESSAGES_CAPABILITIES,
  TECHNICIAN_NAVIGATION_CAPABILITIES,
  TECHNICIAN_PROFILE_CAPABILITIES,
  TECHNICIAN_SCHEDULE_CAPABILITIES,
  canAccessAfterSalesFeatures,
  canManageStaffAccess,
  hasAnyCapability
} from '../../rbac';
import { useAuth } from '../../context/AuthContext';

/* ─── Menu builders (unchanged logic, same as before) ─── */

const getAfterSalesItems = (stats, user) => {
  const overview = stats?.overview || {};
  const hasStats = Boolean(stats);
  const getBadge = (value) => (hasStats ? value ?? 0 : undefined);
  const canViewDashboard = hasAnyCapability(user, AFTER_SALES_DASHBOARD_CAPABILITIES);
  const canViewCases = hasAnyCapability(user, AFTER_SALES_CASE_CAPABILITIES);

  const items = [];

  if (canViewDashboard) {
    items.push({
      label: 'After Sales Cases',
      path: '/admin/after-sales-cases',
      icon: FiHome,
      badge: getBadge(overview.total_cases)
    });
  }

  if (canViewCases) {
    items.push(
      { label: 'Open Cases', path: '/admin/after-sales-cases?status=open_work', icon: FiClipboard, badge: getBadge(overview.open_cases), badgeTone: 'sky' },
      { label: 'Overdue', path: '/admin/after-sales-cases?status=overdue', icon: FiAlertTriangle, badge: getBadge(overview.overdue_cases), badgeTone: 'rose' }
    );
  }

  return items;
};


const getAdminMenu = (user, afterSalesItems) => {
  const canViewJobHistory = user?.role === 'superadmin' || hasAnyCapability(user, ADMIN_JOB_HISTORY_CAPABILITIES);
  const homeItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: FiHome },
    { label: 'Analytics', path: '/admin/analytics', icon: FiTrendingUp },
    { label: 'Reports', path: '/admin/reports', icon: FiFileText }
  ];
  const operationsItems = [
    { label: 'Calendar', path: '/admin/calendar', icon: FiCalendar },
    { label: 'Tickets', path: '/admin/service-tickets', icon: FiClipboard },
    { label: 'Dispatch Board', path: '/admin/dispatch-board', icon: FiLayers },
    { label: 'Live Map', path: '/admin/technician-tracking', icon: FiMap },
    { label: 'Coverage Heatmap', path: '/admin/coverage-heatmap', icon: FiTrendingUp },
    { label: 'Services', path: '/admin/services', icon: FiTool },
    { label: 'Inventory', path: '/admin/inventory', icon: FiPackage },
    canViewJobHistory ? { label: 'Job History', path: '/admin/job-history', icon: FiFileText } : null
  ].filter(Boolean);
  const communicationItems = [];
  communicationItems.push({ label: 'Messages', path: '/admin/messages', icon: FiMessageSquare });
  const accessItems = [];
  const canManageAccess = canManageStaffAccess(user);
  accessItems.push({
    label: 'User Management',
    path: '/admin/user-management',
    icon: FiUsers,
    disabled: !canManageAccess,
    title: canManageAccess ? 'Manage users and staff capabilities' : 'Superadmin must grant you access'
  });
  const setupItems = [
    { label: 'Activity Logs', path: '/admin/activity-logs', icon: FiActivity },
    { label: 'Settings', path: '/admin/settings', icon: FiSettings }
  ];

  const sections = [
      { title: 'Home', items: homeItems },
      { title: 'Operations', items: operationsItems },
      ...(afterSalesItems.length > 0 ? [{ title: 'After-Sales', items: afterSalesItems }] : []),
      ...(communicationItems.length > 0 ? [{ title: 'Communication', items: communicationItems }] : []),
      { title: 'Access', items: accessItems },
      { title: 'Setup', items: setupItems }
    ].filter((section) => section.items.length > 0);

  return {
    label: 'Admin',
    description:
      user.role === 'superadmin'
        ? 'Same operations hub as admins, plus full user and access control.'
        : 'Run day-to-day service operations and keep tickets moving.',
    sections
  };
};

const getTechnicianMenu = (user) => {
  const homeItems = [];
  const workItems = [];
  const accountItems = [];

  if (hasAnyCapability(user, TECHNICIAN_DASHBOARD_CAPABILITIES)) homeItems.push({ label: 'Dashboard', path: '/technician/dashboard', icon: FiHome });
  if (hasAnyCapability(user, TECHNICIAN_JOBS_CAPABILITIES)) workItems.push({ label: 'Jobs', path: '/technician/my-jobs', icon: FiClipboard });
  if (hasAnyCapability(user, TECHNICIAN_SCHEDULE_CAPABILITIES)) workItems.push({ label: 'Schedule', path: '/technician/schedule', icon: FiCalendar });
  if (hasAnyCapability(user, TECHNICIAN_NAVIGATION_CAPABILITIES)) workItems.push({ label: 'Navigation', path: '/technician/map-navigation', icon: FiMap });
  if (hasAnyCapability(user, TECHNICIAN_CHECKLIST_CAPABILITIES)) workItems.push({ label: 'Checklist', path: '/technician/checklist', icon: FiClipboard });
  if (hasAnyCapability(user, TECHNICIAN_MESSAGES_CAPABILITIES)) accountItems.push({ label: 'Messages', path: '/technician/messages', icon: FiMessageSquare });
  if (hasAnyCapability(user, TECHNICIAN_PROFILE_CAPABILITIES)) accountItems.push({ label: 'Profile', path: '/technician/profile', icon: FiSettings });

  return {
    label: '',
    description: "Today's jobs, routes, and updates at a glance.",
    sections: [
      { title: 'Home', items: homeItems },
      { title: 'My Work', items: workItems },
      { title: 'Account', items: accountItems }
    ].filter((section) => section.items.length > 0)
  };
};

const roleMenu = {
  client: {
    label: 'Client',
    description: 'Request service, track progress, and stay informed.',
    sections: [
      { title: 'Home', items: [{ label: 'Dashboard', path: '/client/dashboard', icon: FiHome }] },
      {
        title: 'Service',
        items: [
          { label: 'New Request', path: '/client/service-requests', icon: FiClipboard },
          { label: 'My Requests', path: '/client/requests', icon: FiClipboard },
          { label: 'Service History', path: '/client/service-history', icon: FiFileText }
        ]
      },
      {
        title: 'Account',
        items: [
          { label: 'Notifications', path: '/client/notifications', icon: FiBell },
          { label: 'Profile', path: '/client/profile', icon: FiSettings }
        ]
      }
    ]
  }
};

/* ─── Badge color mapping ─── */
const badgeColors = {
  sky:     'bg-sky-400/20 text-sky-300',
  rose:    'bg-rose-400/20 text-rose-300',
  emerald: 'bg-emerald-400/20 text-emerald-300',
  amber:   'bg-amber-400/20 text-amber-300',
  orange:  'bg-orange-400/20 text-orange-300',
  violet:  'bg-violet-400/20 text-violet-300',
  slate:   'bg-slate-400/20 text-slate-300',
};

/* ─── Component ─── */

export default function Sidebar({ user, isOpen, onClose }) {
  const { logout } = useAuth();
  const location = useLocation();
  const [afterSalesStats, setAfterSalesStats] = useState(null);
  const role = user?.role;
  const afterSalesItems = canAccessAfterSalesFeatures(user) ? getAfterSalesItems(afterSalesStats, user) : [];
  const shouldLoadAfterSalesStats =
    canAccessAfterSalesFeatures(user) && hasAnyCapability(user, AFTER_SALES_DASHBOARD_CAPABILITIES);

  useEffect(() => {
    let isMounted = true;

    if (!shouldLoadAfterSalesStats) {
      setAfterSalesStats(null);
      return () => { isMounted = false; };
    }

    fetchDashboardStats('admin')
      .then((data) => { if (isMounted) setAfterSalesStats(data); })
      .catch(() => { if (isMounted) setAfterSalesStats(null); });

    return () => { isMounted = false; };
  }, [location.pathname, location.search, shouldLoadAfterSalesStats]);

  if (!role) return null;

  const menu = role === 'admin' || role === 'superadmin'
    ? getAdminMenu(user, afterSalesItems)
    : role === 'technician'
      ? getTechnicianMenu(user)
      : roleMenu[role];

  if (!menu) return null;

  const isItemActive = (item) => {
    const [pathWithSearch, hashFragment = ''] = item.path.split('#');
    const [pathname, searchFragment = ''] = pathWithSearch.split('?');

    if (searchFragment || hashFragment) {
      const currentSearch = location.search.startsWith('?') ? location.search.slice(1) : location.search;
      const currentHash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
      return location.pathname === pathname && currentSearch === searchFragment && currentHash === hashFragment;
    }

    return location.pathname === pathname;
  };

  const displayName = user?.first_name?.trim() || user?.username || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-20 bg-slate-950/40 backdrop-blur-sm transition-opacity lg:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[min(17rem,calc(100vw-2rem))] flex-col overflow-y-auto border-r border-brand-800/40 bg-brand-900 transition-transform duration-300 ease-in-out lg:static lg:min-h-[calc(100vh-1rem)] lg:w-64 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo area */}
        <div className="px-4 pb-7 pt-8">
          <div className="flex items-start justify-center">
            <img
              src="/logo.png"
              alt="AFN Solar Power Engineering Services"
              className="h-auto w-[108px]"
            />
            <button
              className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-100 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={onClose}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 px-4 py-2">
          {menu.sections.map((section) => (
            <div key={section.title}>
              <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-200/70">
                {section.title}
              </div>
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const itemIsActive = isItemActive(item) && !item.disabled;

                  if (item.disabled) {
                    return (
                      <div
                        key={item.path}
                        title={item.title || ''}
                        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-slate-300"
                      >
                        <Icon size={16} className="shrink-0" />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </div>
                    );
                  }

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={() =>
                        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-all duration-200 ${
                          itemIsActive
                            ? 'bg-white/12 text-white'
                            : 'text-brand-100/70 hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      {/* Active indicator bar */}
                      {itemIsActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-300" />
                      )}

                      <Icon
                        size={16}
                        className={`shrink-0 transition-colors duration-200 ${
                          itemIsActive ? 'text-brand-200' : 'text-brand-100/60 group-hover:text-brand-100'
                        }`}
                      />
                      <span className="min-w-0 truncate">{item.label}</span>

                      {item.badge !== undefined && item.badge !== null && (
                        <span
                          className={`ml-auto inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            itemIsActive
                              ? 'bg-brand-300/20 text-brand-100'
                              : badgeColors[item.badgeTone] || 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom user section */}
        <div className="mt-auto border-t border-white/10 bg-brand-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/user-icon.png"
              alt=""
              className="h-9 w-9 shrink-0 rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-white">{displayName}</p>
              <p className="truncate text-[10px] uppercase text-brand-100/75">{role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full rounded-[8px] bg-white/10 px-4 py-2 text-[11px] font-medium text-white ring-1 ring-white/10 transition hover:bg-white/15"
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
