import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertCircle,
  FiArrowRight,
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiLayers,
  FiMapPin,
  FiPlusSquare,
  FiRefreshCw
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatsCard from '../../components/ui/StatsCard';
import { fetchDashboardStats } from '../../api/api';
import { AUTO_REFRESH_MS, formatDate, formatDateTime } from '../../utils/dashboardHelpers';
import { clientTechnicianDisplayOrDash } from '../../utils/clientTechnicianDisplay';

export default function ClientDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      setError('');
      const data = await fetchDashboardStats('client');
      setStats(data || {});
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setStats({});
      setError(err.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const id = window.setInterval(() => loadDashboard({ silent: true }), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const overview = stats?.overview || {};
  const statusBreakdown = stats?.status_breakdown || {};
  const alerts = Array.isArray(stats?.alerts) ? stats.alerts : [];
  const recommendations = Array.isArray(stats?.recommendations) ? stats.recommendations : [];
  const activeRequests = Array.isArray(stats?.active_requests) ? stats.active_requests : [];
  const activeTickets = Array.isArray(stats?.active_tickets) ? stats.active_tickets : [];
  const recentHistory = Array.isArray(stats?.recent_history) ? stats.recent_history : [];
  const performance = stats?.performance || {};
  const nextAppointment = activeTickets.find((ticket) => ticket.scheduled_date) || activeTickets[0] || null;

  const openTicketDetail = (ticket) => {
    navigate(`/client/requests/${ticket.id}?entity=ticket`);
  };

  const handleRecommendation = (item) => {
    const action = String(item?.action || '').toLowerCase();
    if (action.includes('create') || action.includes('request') || action.includes('schedule')) {
      navigate('/client/service-requests');
    } else {
      navigate('/client/requests');
    }
  };

  const pipelineItems = [
    { label: 'Pending approval', value: statusBreakdown.pending ?? 0 },
    { label: 'Approved', value: statusBreakdown.approved ?? 0 },
    { label: 'In progress', value: statusBreakdown.in_progress ?? 0 },
    { label: 'On hold', value: statusBreakdown.on_hold ?? 0 }
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Last updated: <span className="font-medium text-slate-700">{formatDateTime(lastUpdated)}</span>
          </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/client/service-history')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
              >
                History <FiArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/client/notifications')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
              >
                Updates <FiArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/client/notifications')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
              >
                Alerts <FiBell className="h-3.5 w-3.5" />
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/client/service-requests')}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 min-[360px]:flex-none"
            >
              <FiPlusSquare className="h-4 w-4" />
              New request
            </button>
            <button
              type="button"
              onClick={() => navigate('/client/requests')}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-surface-50 min-[360px]:flex-none"
            >
              <FiClipboard className="h-4 w-4" />
              My requests
            </button>
          </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {nextAppointment && (
          <button
            type="button"
            onClick={() => openTicketDetail(nextAppointment)}
            className="flex w-full flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-5 text-left transition hover:border-sky-300 hover:bg-sky-50 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Next Appointment</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">{nextAppointment.service_type}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Technician: {clientTechnicianDisplayOrDash(nextAppointment)}
              </p>
            </div>
            <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:min-w-[360px]">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100">
                <FiCalendar className="h-4 w-4 text-sky-600" />
                {nextAppointment.scheduled_date ? formatDate(nextAppointment.scheduled_date) : 'Schedule pending'}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100">
                <FiMapPin className="h-4 w-4 text-sky-600" />
                {nextAppointment.location || nextAppointment.address || 'Location on request'}
              </span>
            </div>
          </button>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="All requests"
            value={overview.total_requests ?? 0}
            icon={FiClipboard}
            accent="blue"
            trendLabel="Lifetime service requests you submitted"
          />
          <StatsCard
            title="Active requests"
            value={overview.active_requests ?? 0}
            icon={FiClock}
            accent="amber"
            color="text-amber-600"
            trendLabel="Awaiting approval or not yet ticketed"
          />
          <StatsCard
            title="Open tickets"
            value={overview.active_tickets ?? 0}
            icon={FiLayers}
            accent="sky"
            color="text-sky-600"
            trendLabel="Jobs in the field service pipeline"
          />
          <StatsCard
            title="Completed"
            value={overview.completed_services ?? 0}
            icon={FiCheckCircle}
            accent="emerald"
            color="text-emerald-600"
            trendLabel="Finished services on your account"
          />
        </div>

        {alerts.length > 0 && (
          <div className="grid gap-3">
            {alerts.map((alert) => (
              <div
                key={alert.message}
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                <FiAlertCircle className="mt-0.5 shrink-0" />
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Active requests</h2>
                <button
                  type="button"
                  onClick={() => navigate('/client/requests')}
                  className="hidden items-center gap-1.5 text-sm font-medium text-brand-500 transition hover:text-brand-600 sm:inline-flex"
                >
                  View all <FiArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">Waiting for approval or assignment.</p>
              <div className="mt-4 space-y-2">
                {loading && !stats ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="skeleton h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : activeRequests.length > 0 ? (
                  activeRequests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => navigate(`/client/requests/${request.id}`)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-left transition hover:bg-surface-100"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{request.service_type}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{request.description}</p>
                        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                          Submitted {formatDate(request.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-surface-200 bg-white px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {request.status}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-surface-200 py-8 text-center text-sm text-slate-500">
                    No active requests.
                  </p>
                )}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <FiCheckCircle className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Recent history</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">Latest completed work.</p>
              <div className="mt-4 space-y-2">
                {loading && !stats ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="skeleton h-14 w-full rounded-xl" />
                    ))}
                  </div>
                ) : recentHistory.length > 0 ? (
                  recentHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-surface-200 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{item.service_type}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          Technician: {clientTechnicianDisplayOrDash(item)}
                        </p>
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <p>{formatDate(item.completed_date)}</p>
                        <p className="mt-0.5">{item.rating != null ? `${item.rating}/5` : '-'}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-surface-200 py-8 text-center text-sm text-slate-500">
                    Completed services will show here.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="text-lg font-semibold text-slate-900">Request & ticket pipeline</h2>
              <p className="mt-0.5 text-sm text-slate-500">Counts by request/ticket stage.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {pipelineItems.map((item) => (
                  <div key={item.label} className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-surface-200 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service rating</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {performance.avg_rating != null ? `${performance.avg_rating}/5` : '-'}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{performance.total_rated ?? 0} rated services</p>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="text-lg font-semibold text-slate-900">Live tickets</h2>
              <p className="mt-0.5 text-sm text-slate-500">Current jobs in progress.</p>
              <div className="mt-4 space-y-2">
                {loading && !stats ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="skeleton h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : activeTickets.length > 0 ? (
                  activeTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => openTicketDetail(ticket)}
                      className="w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-left transition hover:bg-surface-100"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{ticket.service_type}</p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            Technician: {clientTechnicianDisplayOrDash(ticket)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-surface-200">
                          {ticket.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {ticket.scheduled_date ? `Scheduled ${formatDate(ticket.scheduled_date)}` : 'Schedule pending'}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-surface-200 py-8 text-center text-sm text-slate-500">
                    No active tickets.
                  </p>
                )}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="text-lg font-semibold text-slate-900">Suggestions</h2>
              <p className="mt-0.5 text-sm text-slate-500">Based on your account activity.</p>
              <div className="mt-4 space-y-2">
                {recommendations.length > 0 ? (
                  recommendations.map((item) => (
                    <button
                      key={item.message}
                      type="button"
                      onClick={() => handleRecommendation(item)}
                      className="w-full rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-left transition hover:bg-surface-100"
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.action}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-surface-200 py-8 text-center text-sm text-slate-500">
                    You are up to date.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
