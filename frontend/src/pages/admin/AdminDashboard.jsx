import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClipboard,
  FiRefreshCw,
  FiSearch,
  FiTrendingUp,
  FiUsers
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import ActiveTechnicianJobs from '../../components/shared/ActiveTechnicianJobs';
import StatsCard from '../../components/ui/StatsCard';
import { useAuth } from '../../context/AuthContext';
import { fetchDashboardStats, approveServiceRequest } from '../../api/api';
import { canViewAdminUserDirectory } from '../../rbac';
import {
  AUTO_REFRESH_MS,
  formatDate,
  formatDateTime,
  getDisplayText,
  getStatusTone
} from '../../utils/dashboardHelpers';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState('');
  const [approvingRequests, setApprovingRequests] = useState(new Set());

  const loadDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      setError('');
      const data = await fetchDashboardStats('admin');
      setStats(data || {});
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err.message || 'Unable to load the admin dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleApproveRequest = async (requestId) => {
    setApprovingRequests(prev => new Set(prev).add(requestId));
    try {
      await approveServiceRequest(requestId);
      // Refresh the dashboard to show updated stats
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(err.message || 'Unable to approve request.');
    } finally {
      setApprovingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  useEffect(() => {
    loadDashboard();
    const intervalId = window.setInterval(() => loadDashboard({ silent: true }), AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const overview = stats?.overview || {};
  const pendingRequests = Array.isArray(stats?.pending_requests) ? stats.pending_requests : [];
  const slaQueue = Array.isArray(stats?.sla_queue) ? stats.sla_queue : [];
  const clientSchedule = Array.isArray(stats?.client_schedule) ? stats.client_schedule : [];
  const activeTechnicianJobs = Array.isArray(stats?.operations?.active_technician_jobs)
    ? stats.operations.active_technician_jobs
    : (Array.isArray(stats?.active_technician_jobs) ? stats.active_technician_jobs : []);
  const slaOverview = stats?.sla_overview || {};
  const overdueCount = Number(slaOverview.overdue_count || 0);
  const warningCount = Number(slaOverview.warning_count || 0);
  const pendingApprovalsCount = Number(overview.pending_approvals ?? pendingRequests.length ?? 0);
  const activeTicketsCount = Number(overview.active_tickets ?? 0);
  const completedTodayCount = Number(overview.completed_today ?? 0);
  const activeTechniciansCount = Number(overview.active_technicians ?? 0);
  const lowStock = Number(overview.low_stock_items ?? 0);
  const dueMaintenance = Number(overview.due_maintenance ?? 0);
  const canOpenUsers = canViewAdminUserDirectory(user);

  const attentionItems = [
    { label: 'Overdue SLA', value: overdueCount, color: 'bg-rose-100 text-rose-700 border-rose-200' },
    { label: 'Warning SLA', value: warningCount, color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { label: 'Low Stock', value: lowStock, color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { label: 'Due Maintenance', value: dueMaintenance, color: 'bg-violet-100 text-violet-700 border-violet-200' }
  ];
  const totalAttention = attentionItems.reduce((s, i) => s + i.value, 0);
  const normalizedSearch = search.trim().toLowerCase();

  const matchesSearch = (item, fields) => {
    if (!normalizedSearch) return true;
    return fields.some((field) => String(item?.[field] || '').toLowerCase().includes(normalizedSearch));
  };

  const filteredPendingRequests = useMemo(
    () => pendingRequests.filter((request) => matchesSearch(request, ['id', 'client', 'service_type', 'status'])),
    [pendingRequests, normalizedSearch]
  );

  const filteredClientSchedule = useMemo(
    () => clientSchedule.filter((ticket) => matchesSearch(ticket, ['id', 'client', 'service_type', 'status', 'assigned_technician', 'location'])),
    [clientSchedule, normalizedSearch]
  );

  const filteredSlaQueue = useMemo(
    () => slaQueue.filter((item) => matchesSearch(item, ['id', 'client', 'service_type', 'status', 'entity_type'])),
    [slaQueue, normalizedSearch]
  );

  const filteredActiveTechnicianJobs = useMemo(
    () => activeTechnicianJobs.filter((job) => matchesSearch(job, ['id', 'ticket_id', 'client', 'service_type', 'status', 'technician', 'assigned_technician', 'location'])),
    [activeTechnicianJobs, normalizedSearch]
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Last updated: <span className="font-medium text-slate-700">{formatDateTime(lastUpdated)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
              {canOpenUsers && (
                <button
                  type="button"
                  onClick={() => navigate('/admin/user-management')}
                  className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
                >
                  Users
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/admin/analytics')}
                className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
              >
                Analytics
              </button>
              <button
                type="button"
                onClick={() => loadDashboard({ silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                <FiRefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing' : 'Refresh'}
              </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatsCard
            title="Pending Approvals"
            value={pendingApprovalsCount}
            icon={FiClipboard}
            accent="amber"
            color="text-amber-600"
          />
          <StatsCard
            title="Active Tickets"
            value={activeTicketsCount}
            icon={FiTrendingUp}
            accent="blue"
            color="text-brand-600"
          />
          <StatsCard
            title="Completed Today"
            value={completedTodayCount}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
          />
        </div>

        <div className="relative">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dashboard by client, ticket, service, technician, status, or location..."
            className="w-full rounded-2xl border border-surface-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-800 shadow-card outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          />
        </div>

        {/* ── Attention bar ── */}
        {totalAttention > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-surface-200 bg-white px-5 py-3.5 shadow-card">
            <span className="mr-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <FiAlertTriangle className="h-4 w-4 text-amber-500" />
              Attention
            </span>
            {attentionItems
              .filter((i) => i.value > 0)
              .map((item) => (
                <span
                  key={item.label}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${item.color}`}
                >
                  {item.value} {item.label}
                </span>
              ))}
          </div>
        )}

        {/* ── Active Technicians ── */}
        <div className="flex items-center gap-2.5 text-sm text-slate-500">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-500">
            <FiUsers className="h-4 w-4" />
          </div>
          <span>
            <span className="font-semibold text-slate-800">{activeTechniciansCount}</span> technicians currently active or available for field work
          </span>
        </div>

        {/* ── Two-column: Approvals + Schedule ── */}
        <div className="grid gap-5 xl:grid-cols-2">
          {/* Pending Approvals */}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Pending Approvals</h2>
              <button
                type="button"
                onClick={() => navigate('/admin/service-tickets')}
                className="text-sm font-medium text-brand-500 transition hover:text-brand-600"
              >
                View all →
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {loading && !stats ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
                </div>
              ) : filteredPendingRequests.length ? (
                filteredPendingRequests.slice(0, 5).map((req) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-50 px-4 py-3 transition hover:bg-surface-100">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{req.client || 'Client not set'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{req.service_type || 'Service not set'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusTone(req.status)}`}>
                        {req.status || 'Pending'}
                      </span>
                      <span className="text-xs text-slate-400">{formatDate(req.request_date)}</span>
                      <button
                        type="button"
                        onClick={() => handleApproveRequest(req.id)}
                        disabled={approvingRequests.has(req.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {approvingRequests.has(req.id) ? (
                          <>
                            <FiRefreshCw className="h-3 w-3 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <FiCheckCircle className="h-3 w-3" />
                            Approve
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  {normalizedSearch ? 'No pending approvals match your search.' : 'No approvals waiting.'}
                </p>
              )}
            </div>
          </div>

          {/* Upcoming Schedule */}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Upcoming Schedule</h2>
              <button
                type="button"
                onClick={() => navigate('/admin/dispatch-board')}
                className="text-sm font-medium text-brand-500 transition hover:text-brand-600"
              >
                Dispatch board →
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {loading && !stats ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
                </div>
              ) : filteredClientSchedule.length ? (
                filteredClientSchedule.slice(0, 5).map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-50 px-4 py-3 transition hover:bg-surface-100">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{ticket.client || 'Client not set'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {ticket.service_type || 'Service not set'}
                        {ticket.assigned_technician ? ` · ${ticket.assigned_technician}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusTone(ticket.status)}`}>
                        {ticket.status || 'Scheduled'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDate(ticket.scheduled_date)}
                        {ticket.scheduled_time ? ` ${ticket.scheduled_time}` : ''}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  {normalizedSearch ? 'No scheduled visits match your search.' : 'No scheduled visits yet.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Active Technician Jobs ── */}
        <ActiveTechnicianJobs
          jobs={filteredActiveTechnicianJobs}
          title="Technician Live Jobs"
        />

        {/* ── SLA Watchlist ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">SLA Watchlist</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-slate-600">
              <FiAlertTriangle className="h-3 w-3" />
              {filteredSlaQueue.length} items
            </span>
          </div>

          {loading && !stats ? (
            <div className="mt-4 space-y-2">
              {[1,2,3].map((i) => <div key={i} className="skeleton h-10 w-full" />)}
            </div>
          ) : filteredSlaQueue.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-xs font-medium uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pr-4">Client / Service</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">SLA</th>
                    <th className="pb-3">Schedule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {filteredSlaQueue.slice(0, 5).map((item) => {
                    const slaLabel = getDisplayText(item.sla) || 'SLA tracked';
                    return (
                      <tr key={`${item.entity_type || 'item'}-${item.id}`} className="text-slate-700 transition hover:bg-surface-50">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-800">{item.client || 'Not set'}</p>
                          <p className="text-xs text-slate-500">{item.service_type || ''}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs capitalize text-slate-500">
                          {item.entity_type === 'request' ? 'Request' : 'Ticket'}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusTone(item.status)}`}>
                            {item.status || 'Open'}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusTone(item.sla)}`}>
                            {slaLabel}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-slate-500">
                          {item.scheduled_date ? formatDate(item.scheduled_date) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 py-8 text-center text-sm text-slate-400">
              {normalizedSearch ? 'No SLA items match your search.' : 'SLA queue is clear.'}
            </p>
          )}
        </div>

        {/* ── After-Sales Section ── */}
        {stats?.after_sales && (
          <div id="after-sales" className="card scroll-mt-24 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">After-Sales Cases</h2>
                <p className="text-sm text-slate-500">
                  {stats.overview?.total_cases || 0} total follow-up cases
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin/after-sales-cases')}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Manage cases
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => navigate('/admin/after-sales-cases?status=open_work')}
                className="rounded-xl bg-surface-50 p-3 text-center transition hover:bg-surface-100"
              >
                <p className="text-2xl font-semibold text-slate-900">{stats.overview?.open_cases || 0}</p>
                <p className="text-xs text-slate-500">Open</p>
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/after-sales-cases?status=overdue')}
                className="rounded-xl bg-surface-50 p-3 text-center transition hover:bg-surface-100"
              >
                <p className="text-2xl font-semibold text-amber-600">{stats.overview?.overdue_cases || 0}</p>
                <p className="text-xs text-slate-500">Overdue</p>
              </button>
              <div className="rounded-xl bg-surface-50 p-3 text-center">
                <p className="text-2xl font-semibold text-emerald-600">{stats.overview?.resolved_this_week || 0}</p>
                <p className="text-xs text-slate-500">Resolved This Week</p>
              </div>
              <div className="rounded-xl bg-surface-50 p-3 text-center">
                <p className="text-2xl font-semibold text-slate-900">{stats.after_sales?.case_breakdown?.find(c => c.status === 'resolved')?.count || 0}</p>
                <p className="text-xs text-slate-500">Total Resolved</p>
              </div>
            </div>
            {stats.after_sales.recent_cases?.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Recent Cases</h3>
                <div className="space-y-2">
                  {stats.after_sales.recent_cases.slice(0, 3).map((caseItem) => (
                    <div key={caseItem.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-50 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{caseItem.summary}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{caseItem.client} · {caseItem.service_type}</p>
                      </div>
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        caseItem.status === 'resolved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                        caseItem.status === 'in_progress' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                        'bg-amber-50 text-amber-700 ring-amber-200'
                      }`}>
                        {caseItem.status?.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
