import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useFirebase } from './hooks/useFirebase';
import {
  ADMIN_JOB_HISTORY_CAPABILITIES,
  AFTER_SALES_CASE_CAPABILITIES,
  TECHNICIAN_CHECKLIST_CAPABILITIES,
  TECHNICIAN_DASHBOARD_CAPABILITIES,
  TECHNICIAN_HISTORY_CAPABILITIES,
  TECHNICIAN_JOBS_CAPABILITIES,
  TECHNICIAN_MESSAGES_CAPABILITIES,
  TECHNICIAN_NAVIGATION_CAPABILITIES,
  TECHNICIAN_PROFILE_CAPABILITIES,
  TECHNICIAN_SCHEDULE_CAPABILITIES,
  USER_DIRECTORY_CAPABILITIES,
  canAccessAdminWorkspace,
  hasAnyCapability
} from './rbac';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminCalendar = lazy(() => import('./pages/admin/AdminCalendar'));
const TechnicianDashboard = lazy(() => import('./pages/technician/TechnicianDashboard'));
const ClientDashboard = lazy(() => import('./pages/client/ClientDashboard'));
const FollowUpCases = lazy(() => import('./pages/follow_up/FollowUpCases'));
const ClientRequestTracking = lazy(() => import('./pages/client/ClientRequestTracking'));
const ClientRequestDetail = lazy(() => import('./pages/client/ClientRequestDetail'));
const ClientServiceHistory = lazy(() => import('./pages/client/ClientServiceHistory'));
const ClientNotifications = lazy(() => import('./pages/client/ClientNotifications'));
const ClientProfile = lazy(() => import('./pages/client/ClientProfile'));
const AdminServiceTickets = lazy(() => import('./pages/admin/AdminServiceTickets'));
const AdminTechnicianTracking = lazy(() => import('./pages/admin/AdminTechnicianTracking'));
const AdminServices = lazy(() => import('./pages/admin/AdminServices'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminOperationsReport = lazy(() => import('./pages/admin/AdminOperationsReport'));
const AdminUserManagement = lazy(() => import('./pages/admin/AdminUserManagement'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminActivityLogs = lazy(() => import('./pages/admin/AdminActivityLogs'));
const CoverageHeatmap = lazy(() => import('./pages/admin/CoverageHeatmap'));
const AdminDispatchBoard = lazy(() => import('./pages/admin/AdminDispatchBoard'));
const TechnicianJobs = lazy(() => import('./pages/technician/TechnicianJobs'));
const ClientServiceRequests = lazy(() => import('./pages/client/ClientServiceRequests'));
const TechnicianSchedule = lazy(() => import('./pages/technician/TechnicianSchedule'));
const TechnicianMapNavigation = lazy(() => import('./pages/technician/TechnicianMapNavigation'));
const TechnicianChecklist = lazy(() => import('./pages/technician/TechnicianChecklist'));
const TechnicianMessages = lazy(() => import('./pages/technician/TechnicianMessages'));
const TechnicianJobHistory = lazy(() => import('./pages/technician/TechnicianJobHistory'));
const TechnicianProfile = lazy(() => import('./pages/technician/TechnicianProfile'));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'));
const AdminJobHistory = lazy(() => import('./pages/admin/AdminJobHistory'));

const getDashboardPath = (user) => {
  if (!user) {
    return '/login';
  }

  if (canAccessAdminWorkspace(user)) {
    return '/admin/dashboard';
  }

  if (user.role === 'technician') {
    if (hasAnyCapability(user, TECHNICIAN_DASHBOARD_CAPABILITIES)) {
      return '/technician/dashboard';
    }
    if (hasAnyCapability(user, TECHNICIAN_JOBS_CAPABILITIES)) {
      return '/technician/my-jobs';
    }
    if (hasAnyCapability(user, TECHNICIAN_SCHEDULE_CAPABILITIES)) {
      return '/technician/schedule';
    }
    if (hasAnyCapability(user, TECHNICIAN_NAVIGATION_CAPABILITIES)) {
      return '/technician/map-navigation';
    }
    if (hasAnyCapability(user, TECHNICIAN_CHECKLIST_CAPABILITIES)) {
      return '/technician/checklist';
    }
    if (hasAnyCapability(user, TECHNICIAN_MESSAGES_CAPABILITIES)) {
      return '/technician/messages';
    }
    if (hasAnyCapability(user, TECHNICIAN_HISTORY_CAPABILITIES)) {
      return '/technician/job-history';
    }
    if (hasAnyCapability(user, TECHNICIAN_PROFILE_CAPABILITIES)) {
      return '/technician/profile';
    }
  }

  if (user.role === 'client') {
    return '/client/dashboard';
  }

  return '/login';
};

function RoleRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div>Loading...</div>;
  }

  const target = user ? getDashboardPath(user) : '/login';

  // STOP infinite redirect
  if (location.pathname === target) {
    return null;
  }

  return <Navigate to={target} replace />;
}

const ProtectedRoute = ({ role, allowedRoles = [], requiredAnyCapability = [], children }) => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const isRoleAllowed = role
    ? user.role === role
    : (allowedRoles.length > 0 ? allowedRoles.includes(user.role) : true);
  const isCapabilityAllowed =
    requiredAnyCapability.length > 0 ? hasAnyCapability(user, requiredAnyCapability) : true;

  if (!isRoleAllowed || !isCapabilityAllowed) {
    return <Navigate to={getDashboardPath(user)} replace />;
  }

  return children;
};

function FirebaseBootstrap() {
  const { fcmToken, registerToken } = useFirebase();

  useEffect(() => {
    if (!fcmToken) {
      return;
    }

    registerToken().catch(() => {});
  }, [fcmToken, registerToken]);

  return null;
}

function AppRoutes() {
  const { user, isAuthenticated } = useAuth();

  return (
    <>
      {isAuthenticated ? <FirebaseBootstrap /> : null}
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-600">Loading...</div>}>
        <Routes>
          <Route path="/" element={<RoleRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/calendar" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminCalendar /></ProtectedRoute>} />
          <Route path="/admin/service-tickets" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminServiceTickets /></ProtectedRoute>} />
          <Route path="/admin/dispatch-board" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminDispatchBoard /></ProtectedRoute>} />
          <Route path="/admin/technician-tracking" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminTechnicianTracking /></ProtectedRoute>} />
          <Route
            path="/admin/technicians"
            element={<ProtectedRoute role="superadmin"><Navigate to="/admin/user-management?role=technician" replace /></ProtectedRoute>}
          />
          <Route
            path="/admin/clients"
            element={<ProtectedRoute role="superadmin"><Navigate to="/admin/user-management?role=client" replace /></ProtectedRoute>}
          />
          <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminServices /></ProtectedRoute>} />
          <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminInventory /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminAnalytics /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminReports /></ProtectedRoute>} />
          <Route path="/admin/operations-report" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminOperationsReport /></ProtectedRoute>} />
          <Route path="/admin/after-sales-cases" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={AFTER_SALES_CASE_CAPABILITIES}><FollowUpCases /></ProtectedRoute>} />
          <Route path="/supervisor/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/supervisor/dispatch-board" element={<Navigate to="/admin/dispatch-board" replace />} />
          <Route path="/supervisor/technician-tracking" element={<Navigate to="/admin/technician-tracking" replace />} />
          <Route path="/supervisor/service-tickets" element={<Navigate to="/admin/service-tickets" replace />} />
          <Route path="/supervisor/user-access" element={<Navigate to="/admin/user-management" replace />} />
          <Route
            path="/admin/user-management"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={USER_DIRECTORY_CAPABILITIES}>
                <AdminUserManagement />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminSettings /></ProtectedRoute>} />
          <Route path="/admin/activity-logs" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><AdminActivityLogs /></ProtectedRoute>} />
          <Route path="/admin/messages" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><TechnicianMessages /></ProtectedRoute>} />
          <Route path="/admin/coverage-heatmap" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><CoverageHeatmap /></ProtectedRoute>} />
          <Route path="/admin/job-history" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredAnyCapability={ADMIN_JOB_HISTORY_CAPABILITIES}><AdminJobHistory /></ProtectedRoute>} />
          <Route path="/follow-up/dashboard" element={<Navigate to="/admin/dashboard#after-sales" replace />} />
          <Route path="/follow-up/cases" element={<Navigate to="/admin/after-sales-cases" replace />} />

          <Route path="/technician/dashboard" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_DASHBOARD_CAPABILITIES}><TechnicianDashboard /></ProtectedRoute>} />
          <Route path="/technician/my-jobs" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_JOBS_CAPABILITIES}><TechnicianJobs /></ProtectedRoute>} />
          <Route path="/technician/schedule" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_SCHEDULE_CAPABILITIES}><TechnicianSchedule /></ProtectedRoute>} />
          <Route path="/technician/map-navigation" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_NAVIGATION_CAPABILITIES}><TechnicianMapNavigation /></ProtectedRoute>} />
          <Route path="/technician/checklist" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_CHECKLIST_CAPABILITIES}><TechnicianChecklist /></ProtectedRoute>} />
          <Route path="/technician/messages" element={<ProtectedRoute allowedRoles={['technician', 'admin', 'superadmin']} requiredAnyCapability={TECHNICIAN_MESSAGES_CAPABILITIES}><TechnicianMessages /></ProtectedRoute>} />
          <Route path="/technician/job-history" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_HISTORY_CAPABILITIES}><TechnicianJobHistory /></ProtectedRoute>} />
          <Route path="/technician/profile" element={<ProtectedRoute role="technician" requiredAnyCapability={TECHNICIAN_PROFILE_CAPABILITIES}><TechnicianProfile /></ProtectedRoute>} />

          <Route path="/client/dashboard" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
          <Route path="/client/service-requests" element={<ProtectedRoute role="client"><ClientServiceRequests /></ProtectedRoute>} />
          <Route path="/client/requests" element={<ProtectedRoute role="client"><ClientRequestTracking /></ProtectedRoute>} />
          <Route path="/client/requests/:requestId" element={<ProtectedRoute role="client"><ClientRequestDetail /></ProtectedRoute>} />
          <Route path="/client/service-history" element={<ProtectedRoute role="client"><ClientServiceHistory /></ProtectedRoute>} />
          <Route path="/client/notifications" element={<ProtectedRoute role="client"><ClientNotifications /></ProtectedRoute>} />
          <Route path="/client/profile" element={<ProtectedRoute role="client"><ClientProfile /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
