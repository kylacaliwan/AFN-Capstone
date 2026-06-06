import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiBell,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiMapPin,
  FiPackage,
  FiRefreshCw,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import StatsCard from '../../components/ui/StatsCard';
import { fetchNotifications, fetchTechnicianDashboard, getUnreadNotificationCount, updateJobStatus, updateTechnicianLocation } from '../../api/api';
import { useGPSTracking } from '../../hooks/useGPSTracking';
import GPSStatusIndicator from '../../components/ui/GPSStatusIndicator';
import { AUTO_REFRESH_MS, formatDateTime } from '../../utils/dashboardHelpers';
import {
  TECHNICIAN_CHECKLIST_CAPABILITIES,
  TECHNICIAN_HISTORY_CAPABILITIES,
  TECHNICIAN_JOBS_CAPABILITIES,
  TECHNICIAN_MESSAGES_CAPABILITIES,
  TECHNICIAN_NAVIGATION_CAPABILITIES,
  TECHNICIAN_SCHEDULE_CAPABILITIES,
  hasAnyCapability
} from '../../rbac';
import { formatTicketId } from '../../utils/roleIds';

const EMPTY_DASHBOARD = {
  technician: { is_available: false, current_location: null },
  stats: { total_assigned: 0, completed_today: 0, pending_jobs: 0, active_jobs: 0 },
  todays_schedule: [],
  active_jobs: [],
  recent_activity: []
};

const normalizeStatus = (status) => String(status || '').toLowerCase().replace(/\s+/g, '_');

const formatStatusLabel = (status) =>
  normalizeStatus(status).split('_').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || 'Unknown';

const formatTimeSlot = (value) => {
  const normalized = normalizeStatus(value);
  if (!normalized) return '';
  return normalized.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};

const formatDateLabel = (value) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatTimeLabel = (value) => {
  if (!value) return '';
  const date = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatNotificationTime = (value) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export default function TechnicianDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const techName = dashboard.technician?.full_name || user?.username || 'Technician';

  const { location, error: gpsError, permission: gpsPermission } = useGPSTracking({
    updateInterval: 20000,
    autoStart: true,
    onLocationUpdate: async (loc) => {
      try {
        await updateTechnicianLocation({ techName, lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy, speed: loc.speed, heading: loc.heading });
      } catch (err) { console.error('Failed to update location:', err); }
    }
  });

  const loadData = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [dData, nData, unreadCount] = await Promise.all([
        fetchTechnicianDashboard(techName),
        fetchNotifications(),
        getUnreadNotificationCount()
      ]);
      const sorted = [...nData].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setDashboard(dData || EMPTY_DASHBOARD);
      setNotifications(sorted.slice(0, 5));
      setUnreadNotificationCount(unreadCount || 0);
      setLastUpdated(new Date().toISOString());
      setError('');
    } catch (err) {
      setDashboard(EMPTY_DASHBOARD);
      setNotifications([]);
      setUnreadNotificationCount(0);
      setError(err.message || 'Unable to load technician dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const id = window.setInterval(() => loadData({ silent: true }), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [techName]);

  const todaysSchedule = Array.isArray(dashboard.todays_schedule) ? dashboard.todays_schedule : [];
  const activeJobs = Array.isArray(dashboard.active_jobs) ? dashboard.active_jobs : [];
  const recentActivity = Array.isArray(dashboard.recent_activity) ? dashboard.recent_activity : [];

  const canOpenJobs = hasAnyCapability(user, TECHNICIAN_JOBS_CAPABILITIES);
  const canOpenSchedule = hasAnyCapability(user, TECHNICIAN_SCHEDULE_CAPABILITIES);
  const canOpenNavigation = hasAnyCapability(user, TECHNICIAN_NAVIGATION_CAPABILITIES);
  const canOpenChecklist = hasAnyCapability(user, TECHNICIAN_CHECKLIST_CAPABILITIES);
  const canOpenMessages = hasAnyCapability(user, TECHNICIAN_MESSAGES_CAPABILITIES);
  const canOpenHistory = hasAnyCapability(user, TECHNICIAN_HISTORY_CAPABILITIES);

  const currentJob = activeJobs.find((j) => normalizeStatus(j.status) === 'in_progress') || todaysSchedule.find((j) => normalizeStatus(j.status) !== 'completed') || activeJobs[0] || null;
  const nextJob = todaysSchedule.find((j) => j.id !== currentJob?.id && normalizeStatus(j.status) !== 'completed') || null;
  const currentJobStatus = normalizeStatus(currentJob?.status);
  const currentJobHasCoordinates = Number.isFinite(Number(currentJob?.latitude)) && Number.isFinite(Number(currentJob?.longitude));
  const currentJobChecklistDone = Boolean(currentJob?.checklist_completed);
  const currentJobIsUrgent = ['urgent', 'high'].includes(String(currentJob?.priority || '').toLowerCase());

  const startCurrentJob = async () => {
    if (!currentJob) return;
    setActionMessage('');
    setError('');
    try {
      await updateJobStatus(currentJob.id, 'in_progress');
      setActionMessage(`${formatTicketId(currentJob.id)} is now in progress.`);
      await loadData({ silent: true });
    } catch (err) {
      setError(err.message || 'Unable to start job.');
    }
  };

  const gpsLatitude = toFiniteNumber(location?.latitude ?? dashboard.technician?.current_location?.latitude);
  const gpsLongitude = toFiniteNumber(location?.longitude ?? dashboard.technician?.current_location?.longitude);
  const gpsAccuracy = location?.accuracy;

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Last updated: <span className="font-medium text-slate-700">{formatDateTime(lastUpdated)}</span>
        </p>
        
      </div>

      {actionMessage && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{actionMessage}</div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Today's Jobs" value={todaysSchedule.length} color="text-brand-600" icon={FiCalendar} accent="blue" />
        <StatsCard title="Active Jobs" value={dashboard.stats?.active_jobs || 0} color="text-orange-600" icon={FiClipboard} accent="orange" />
        <StatsCard title="Completed Today" value={dashboard.stats?.completed_today || 0} color="text-emerald-600" icon={FiCheckSquare} accent="emerald" />
        <StatsCard title="Unread Alerts" value={unreadNotificationCount} color="text-rose-600" icon={FiBell} accent="rose" />
      </div>

      {/* Current Focus + GPS */}
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="card min-h-full p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Current Focus</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">
                {currentJob ? `${formatTicketId(currentJob.id)}: ${currentJob.service_type}` : 'No active field job right now'}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {currentJob
                  ? `${currentJob.client?.full_name || currentJob.client} - ${currentJob.location || 'Location pending'}`
                  : 'When a job is assigned or started, it will appear here.'}
              </p>
            </div>
            <div className="flex flex-col self-stretch items-end">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${currentJob ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-slate-500'}`}>
              {currentJob ? formatStatusLabel(currentJob.status) : 'Idle'}
              </span>
              <div className="mt-auto pt-4">
                {canOpenSchedule && <Link to="/technician/schedule" className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Check Schedule</Link>}
              </div>

            </div>
          </div>

          {currentJob ? (
            <>
              {currentJobIsUrgent && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {currentJob.priority} priority job
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Schedule</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{formatDateLabel(currentJob.scheduled_date)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatTimeLabel(currentJob.scheduled_time) || formatTimeSlot(currentJob.scheduled_time_slot) || 'Time not set'}</p>
                </div>
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Client</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{currentJob.client?.full_name || currentJob.client}</p>
                  <p className="mt-1 text-xs text-slate-500">{currentJob.priority || 'Normal'} priority</p>
                </div>
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Address</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{currentJob.location || 'Location pending'}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-xl border p-3 ${currentJobHasCoordinates ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                    <FiMapPin className="h-4 w-4" />
                    Route
                  </p>
                  <p className="mt-2 text-sm font-medium">{currentJobHasCoordinates ? 'Navigation ready' : 'Coordinates missing'}</p>
                </div>
                <div className={`rounded-xl border p-3 ${currentJobChecklistDone ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-sky-200 bg-sky-50 text-sky-800'}`}>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                    <FiCheckSquare className="h-4 w-4" />
                    Checklist
                  </p>
                  <p className="mt-2 text-sm font-medium">{currentJobChecklistDone ? 'Submitted' : 'Needs completion before closeout'}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {canOpenJobs && currentJobStatus === 'not_started' && (
                  <button
                    type="button"
                    onClick={startCurrentJob}
                    disabled={refreshing}
                    className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    Start Job
                  </button>
                )}
                {canOpenJobs && (
                  <Link to="/technician/my-jobs" className="rounded-xl border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-surface-50">
                    {currentJobStatus === 'in_progress' ? 'Continue Job' : 'Open My Jobs'}
                  </Link>
                )}
                {canOpenNavigation && (
                  <Link
                    to={`/technician/map-navigation?ticketId=${currentJob.id}`}
                    className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${currentJobHasCoordinates ? 'bg-emerald-500 hover:bg-emerald-600' : 'pointer-events-none bg-slate-300'}`}
                    aria-disabled={!currentJobHasCoordinates}
                  >
                    Navigate to Job
                  </Link>
                )}
                {canOpenChecklist && <Link to={`/technician/checklist?ticketId=${currentJob.id}`} className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">Open Checklist</Link>}
                {canOpenJobs && <Link to="/technician/my-jobs" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"><FiPackage className="h-4 w-4" /> Request Equipment</Link>}
              </div>
            </>
          ) : (
            <div className="hidden mt-5">
              {canOpenSchedule && <Link to="/technician/schedule" className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Check Schedule</Link>}
            </div>
          )}

          {nextJob && (
            <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-600">Up Next</p>
              <p className="mt-2 text-sm font-semibold text-navy-900">{formatTicketId(nextJob.id)}: {nextJob.service_type}</p>
              <p className="mt-1 text-sm text-slate-600">
                {nextJob.client?.full_name || nextJob.client} - {formatDateLabel(nextJob.scheduled_date)}
                {formatTimeLabel(nextJob.scheduled_time) ? ` - ${formatTimeLabel(nextJob.scheduled_time)}` : ''}
              </p>
            </div>
          )}
        </section>

        {/* GPS Section */}
        <section className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100">GPS Status</p>
              <h3 className="mt-2 text-xl font-semibold">Live Tracking</h3>
              <p className="mt-2 text-sm text-emerald-50/80">Supervisors rely on this feed for route visibility and dispatch.</p>
            </div>
            <GPSStatusIndicator status={gpsPermission} accuracy={gpsAccuracy} className="rounded-full bg-white/15 px-3 py-1.5" />
          </div>

          <div className="mt-5 space-y-3 rounded-xl bg-white/10 p-4 backdrop-blur">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">Availability</p>
              <p className="mt-1 text-sm font-medium">{dashboard.technician?.is_available ? 'Available for dispatch' : 'Currently on a job'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">Coordinates</p>
              <p className="mt-1 text-sm font-medium">
                {gpsLatitude !== null && gpsLongitude !== null ? `${gpsLatitude.toFixed(6)}, ${gpsLongitude.toFixed(6)}` : 'Waiting for GPS fix'}
              </p>
            </div>
            {gpsError && (
              <div className="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-white">{gpsError.message}</div>
            )}
          </div>
        </section>
      </div>

      {/* Schedule + Notifications */}
      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Today's Schedule</h3>
            {canOpenSchedule && <Link to="/technician/schedule" className="text-sm font-medium text-brand-500 hover:text-brand-600">View full schedule</Link>}
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="skeleton h-16 w-full" />)}</div>
            ) : todaysSchedule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-5 text-center text-sm text-slate-500">No jobs scheduled for today.</div>
            ) : (
              todaysSchedule.slice(0, 4).map((job) => (
                <div key={job.id} className="rounded-xl border border-surface-200 p-4 transition hover:bg-surface-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{job.service_type}</p>
                      <p className="text-sm text-slate-600">{job.client?.full_name || job.client}</p>
                    </div>
                    <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-semibold text-slate-600">{formatStatusLabel(job.status)}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {formatDateLabel(job.scheduled_date)}
                    {formatTimeLabel(job.scheduled_time) ? ` - ${formatTimeLabel(job.scheduled_time)}` : ''}
                    {!formatTimeLabel(job.scheduled_time) && job.scheduled_time_slot ? ` - ${formatTimeSlot(job.scheduled_time_slot)}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{job.location || 'Location pending'}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FiBell className="text-brand-500" /> Notifications
            </h3>
            {canOpenMessages && <Link to="/technician/messages" className="text-sm font-medium text-brand-500 hover:text-brand-600">Open messages</Link>}
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="skeleton h-16 w-full" />)}</div>
            ) : notifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-5 text-center text-sm text-slate-500">No recent notifications.</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`rounded-xl border p-4 transition ${n.status === 'unread' ? 'border-brand-200 bg-brand-50/50' : 'border-surface-200 hover:bg-surface-50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{n.title || formatStatusLabel(n.type)}</p>
                      <p className="mt-1 text-sm text-slate-600">{n.message}</p>
                    </div>
                    {n.status === 'unread' && (
                      <span className="rounded-full bg-brand-500 px-2.5 py-1 text-[10px] font-semibold text-white">Unread</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{formatNotificationTime(n.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Recent Activity */}
      <section className="mt-8 card p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
          {canOpenHistory && <Link to="/technician/job-history" className="text-sm font-medium text-brand-500 hover:text-brand-600">Open history</Link>}
        </div>
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
          ) : recentActivity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-5 text-center text-sm text-slate-500">No recent activity yet.</div>
          ) : (
            recentActivity.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-surface-200 p-4 transition hover:bg-surface-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{formatTicketId(item.id)}: {item.service_type}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.client?.full_name || item.client}</p>
                  </div>
                  <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-semibold text-slate-600">{formatStatusLabel(item.status)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </Layout>
  );
}
