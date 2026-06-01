import { useEffect, useState } from 'react';
import {
  FiRefreshCw
} from 'react-icons/fi';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Layout from '../../components/layout/Layout';
import { fetchAdminAnalytics, fetchDashboardStats } from '../../api/api';
import { api } from '../../api/core';
import {
  AUTO_REFRESH_MS,
  formatCompactNumber,
  formatDateTime,
  demandTone
} from '../../utils/dashboardHelpers';
import { formatTechnicianId } from '../../utils/roleIds';

/* ───────────────────────── Charts ───────────────────────── */

function EmptyChart({ title, description }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
      <div>
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function ChartFrame({ title, description, children, right }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        {right}
      </div>
      <div className="mt-4 h-[260px]">{children}</div>
    </div>
  );
}

function AnalyticsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <p key={entry.dataKey} style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{formatCompactNumber(entry.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/* ─── Key Metrics horizontal bar chart (replaces stat cards) ─── */
function KeyMetricsBar({ data }) {
  const items = [
    { label: 'Total Service Requests', value: Number(data.total || 0), color: '#0ea5e9', helper: 'Customer requests created in the selected period.' },
    { label: 'Completed Service Requests', value: Number(data.completed || 0), color: '#10b981', helper: 'Requests closed as completed in the selected period.' },
    { label: 'Requests Pending Approval', value: Number(data.pending || 0), color: '#f59e0b', helper: 'Selected-period requests still waiting for approval.' },
    { label: 'Available Field Technicians', value: Number(data.technicians || 0), color: '#8b5cf6', helper: 'Technicians currently counted as active or available.' }
  ];

  const maxValue = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">Key Metrics</h3>
      <p className="mt-1 text-xs text-slate-500">At-a-glance comparison of core request figures.</p>

      <div className="mt-5 space-y-3">
        {items.map((item) => {
          const width = Math.max(8, (item.value / maxValue) * 100);
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="font-semibold text-slate-900">{formatCompactNumber(item.value)}</span>
              </div>
              <p className="mb-1.5 text-xs text-slate-500">{item.helper}</p>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${width}%`, backgroundColor: item.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Operational Focus signals (counts can overlap) ─── */
function OperationalFocusPanel({ segments }) {
  const safe = Array.isArray(segments)
    ? segments
      .filter((segment) => Number(segment.value || 0) > 0)
      .sort((left, right) => Number(right.value || 0) - Number(left.value || 0))
    : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">Operational Focus</h3>
      <p className="mt-1 text-xs text-slate-500">
        Separate signals to review today. A single ticket can appear in more than one line.
      </p>

      <div className="mt-5 space-y-2">
        {safe.length ? safe.map((segment) => (
          <div
            key={segment.label}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{segment.label}</p>
                {segment.description ? (
                  <p className="mt-0.5 text-xs text-slate-500">{segment.description}</p>
                ) : null}
              </div>
            </div>
            <span
              className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: segment.color }}
            >
              {formatCompactNumber(segment.value)}
            </span>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No priority signals right now.
          </div>
        )}
      </div>
    </div>
  );
}

function OperationalFocusDonut({ segments }) {
  const chartData = Array.isArray(segments)
    ? segments
      .filter((segment) => Number(segment.value || 0) > 0)
      .map((segment) => ({
        name: segment.label,
        value: Number(segment.value || 0),
        color: segment.color,
      }))
    : [];

  if (!chartData.length) {
    return <EmptyChart title="No active risk signals" description="SLA, inventory, maintenance, and schedule queues are currently clear." />;
  }

  return (
    <ChartFrame
      title="Risk Signal Mix"
      description="Relative weight of active operational issues needing review."
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={54}
            outerRadius={92}
            paddingAngle={3}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<AnalyticsTooltip />} />
          <Legend iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* ─── Monthly Request Trend ─── */
function MonthlyServiceChart({ data, filterDays }) {
  const chartData = Array.isArray(data)
    ? data.slice(-8).map((item) => ({
      label: item.label,
      Created: Number(item.requestCount || 0),
      Completed: Number(item.completedCount || 0),
    }))
    : [];

  if (!chartData.length) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="Monthly trend unavailable" description={`No request history in the last ${periodLabel}.`} />;
  }

  return (
    <ChartFrame
      title="Request Completion Trend"
      description="Created requests compared with completed requests across recent periods."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Legend iconType="circle" />
          <Line type="monotone" dataKey="Created" stroke="#0f172a" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="Completed" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* ─── Top Services Bar ─── */
function ServiceBarChart({ data, filterDays }) {
  const chartData = Array.isArray(data)
    ? data.slice(0, 6).map((item) => ({
      service: item.serviceType || item.name || 'Unknown',
      Requests: Number(item.requestCount ?? item.count ?? 0),
      Completed: Number(item.completedCount ?? item.completedRequests ?? 0),
    }))
    : [];

  if (!chartData.length) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="Top services unavailable" description={`No service requests in the last ${periodLabel}.`} />;
  }

  return (
    <ChartFrame
      title="Top Requested Services"
      description="Ranked demand by service type with completed work shown beside total requests."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 44, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="service" width={92} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Legend iconType="circle" />
          <Bar dataKey="Requests" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
          <Bar dataKey="Completed" fill="#10b981" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* ─── 7-Day Demand Forecast ─── */
function ForecastAreaChart({ data, serviceForecast, filterDays }) {
  const chartData = Array.isArray(data)
    ? data.slice(0, 7).map((item) => ({
      label: item.label,
      date: item.date,
      Forecast: Number(item.predictedRequests || 0),
      demandLevel: item.demandLevel,
    }))
    : [];
  const serviceData = Array.isArray(serviceForecast) ? serviceForecast : [];

  if (!chartData.length) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="Forecast unavailable" description={`Forecast requires historical data from the last ${periodLabel}.`} />;
  }

  const busiest = [...chartData].sort((a, b) => Number(b.Forecast || 0) - Number(a.Forecast || 0))[0];

  // Calculate capacity info from service forecast
  const totalCapacityGap = serviceData.reduce((sum, s) => sum + (Number(s.capacityGap || 0)), 0);
  const highRiskServices = serviceData.filter((s) => s.riskLevel === 'high').length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">7-Day Demand Forecast</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${demandTone[busiest?.demandLevel] || 'bg-slate-100 text-slate-700'}`}>
          Peak: {busiest?.label || 'N/A'}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="h-[260px] min-w-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 18, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<AnalyticsTooltip />} />
              <Area type="monotone" dataKey="Forecast" stroke="#2563eb" strokeWidth={3} fill="url(#forecastFill)" />
              {busiest ? <ReferenceDot x={busiest.label} y={busiest.Forecast} r={6} fill="#f97316" stroke="#fff" strokeWidth={2} /> : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {chartData.slice(0, 3).map((item) => (
          <div key={item.date || item.label} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-600">{item.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{item.Forecast || 0}</p>
            <p className="text-[11px] text-slate-400">forecasted service requests</p>
          </div>
        ))}
      </div>

      {(totalCapacityGap > 0 || highRiskServices > 0) && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-900">Capacity Alert</p>
          <div className="mt-2 space-y-1 text-xs text-amber-800">
            {totalCapacityGap > 0 && (
              <p>📊 <strong>{totalCapacityGap} technician{totalCapacityGap !== 1 ? 's' : ''} needed</strong> to handle forecasted demand</p>
            )}
            {highRiskServices > 0 && (
              <p>⚠️ <strong>{highRiskServices} service type{highRiskServices !== 1 ? 's' : ''}</strong> at high risk of insufficient capacity</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Seasonal Inventory Demand ─── */
function SeasonalInventoryDemand({ data, filterDays }) {
  const topItems = Array.isArray(data?.topItems) ? data.topItems : [];
  const categories = Array.isArray(data?.categoryDemand) ? data.categoryDemand : [];
  const totalTransactions = data?.totalTransactions ?? 0;
  const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';

  const hasData = (topItems.length > 0 || categories.length > 0) && totalTransactions > 0;

  if (!hasData) {
    return <EmptyChart title="Inventory analysis unavailable" description={`No inventory transactions in the last ${periodLabel}. Usage data will appear when items are consumed.`} />;
  }

  const demandColors = {
    High: '#ef4444',
    Medium: '#f59e0b',
    Low: '#10b981',
  };

  const demandBgColors = {
    High: 'bg-red-50 border-red-200',
    Medium: 'bg-amber-50 border-amber-200',
    Low: 'bg-green-50 border-green-200',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">Seasonal Inventory Demand</h3>
      <p className="mt-1 text-xs text-slate-500">Top items consumed in the last {periodLabel} - plan your stock accordingly.</p>

      <div className="mt-5 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={categories.slice(0, 6).map((cat) => ({
              category: cat.category,
              Quantity: Number(cat.quantity || 0),
            }))}
            margin={{ top: 4, right: 16, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="category" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Bar dataKey="Quantity" fill="#14b8a6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Top Items */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Top Items in Demand</h4>
          <div className="space-y-2">
            {topItems.slice(0, 5).map((item) => (
              <div key={item.item} className={`rounded-lg border p-3 ${demandBgColors[item.demand]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{item.item}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{item.category}</p>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: demandColors[item.demand] }}
                  >
                    {item.demand}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  <strong>{item.quantity}</strong> units used (<strong>{item.transactions}</strong> transactions)
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* By Category */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Demand by Category</h4>
          <div className="space-y-2">
            {categories.slice(0, 5).map((cat) => (
              <div key={cat.category} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{cat.category}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{cat.itemCount} items</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{cat.quantity}</p>
                    <p className="text-xs text-slate-500">units</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                  <div
                    className="h-1.5 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(100, (cat.quantity / Math.max(...categories.map(c => c.quantity), 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Technician Performance Table ─── */
function TechnicianPerformanceTable({ data, filterDays }) {
  // Validate data is actually an array with items
  const hasData = Array.isArray(data) && data.length > 0;

  if (!hasData) {
    const periodLabel = filterDays === 7 ? '7 days' : filterDays === 30 ? '30 days' : filterDays === 90 ? '90 days' : '365 days';
    return <EmptyChart title="No performance data" description={`No completed jobs in the last ${periodLabel}. Data will appear once technicians complete work.`} />;
  }

  const chartData = data.slice(0, 8).map((tech) => ({
    technician: tech.username,
    Active: Number(tech.active_jobs || 0),
    Completed: Number(tech.completed_jobs || 0),
    Total: Number(tech.total_jobs || 0),
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">Technician Performance Monitoring</h3>
      <p className="mt-1 text-xs text-slate-500">Detailed breakdown per technician for the selected period.</p>
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="technician" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend iconType="circle" />
            <Bar dataKey="Active" stackId="jobs" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Completed" stackId="jobs" fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Technician</th>
              <th className="px-3 py-2.5">Active</th>
              <th className="px-3 py-2.5">Completed</th>
              <th className="px-3 py-2.5">Total</th>
              <th className="px-3 py-2.5">Avg Duration</th>
              <th className="px-3 py-2.5">Avg Response</th>
              <th className="px-3 py-2.5">Rating</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Skills</th>
            </tr>
          </thead>
          <tbody>
            {data.map((tech) => (
              <tr key={tech.technician_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-900">{tech.username}</div>
                  <div className="text-xs font-semibold text-slate-400">{formatTechnicianId(tech.technician_id)}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    {tech.active_jobs}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {tech.completed_jobs}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{tech.total_jobs}</td>
                <td className="px-3 py-2.5 text-slate-600">{tech.avg_duration_hours ? `${tech.avg_duration_hours}h` : '—'}</td>
                <td className="px-3 py-2.5 text-slate-600">{tech.avg_response_hours ? `${tech.avg_response_hours}h` : '—'}</td>
                <td className="px-3 py-2.5">
                  {tech.avg_rating ? (
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      tech.avg_rating >= 4 ? 'bg-emerald-100 text-emerald-700' :
                      tech.avg_rating >= 3 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      ⭐ {tech.avg_rating}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    tech.is_available ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tech.is_available ? 'Available' : 'Busy'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(tech.skills || []).slice(0, 3).map((skill) => (
                      <span key={skill} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {skill}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [techPerformance, setTechPerformance] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Date filter state
  const [filterPeriod, setFilterPeriod] = useState('monthly');
  const [filterDays, setFilterDays] = useState(30);

  const PERIOD_OPTIONS = [
    { value: 'weekly', label: 'Last 7 Days', days: 7 },
    { value: 'monthly', label: 'Last 30 Days', days: 30 },
    { value: 'quarterly', label: 'Last 90 Days', days: 90 },
    { value: 'yearly', label: 'Last 365 Days', days: 365 },
  ];

  const handlePeriodChange = (period) => {
    const opt = PERIOD_OPTIONS.find((p) => p.value === period) || PERIOD_OPTIONS[1];
    setFilterPeriod(opt.value);
    setFilterDays(opt.days);
  };

  const loadAnalytics = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError('');
      const [analyticsData, dashboardData] = await Promise.all([
        fetchAdminAnalytics(filterDays),
        fetchDashboardStats('admin')
      ]);
      setAnalytics(analyticsData || {});
      setDashboardStats(dashboardData || {});
      setLastUpdated(analyticsData?.generatedAt || new Date().toISOString());

      // Load technician performance breakdown
      try {
        const { data } = await api.get('/services/technician-performance/performance_breakdown/', {
          params: { days: filterDays },
        });
        setTechPerformance(data);
      } catch { /* non-critical */ }
    } catch (err) {
      setError(err.message || 'Unable to load admin analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();

    const intervalId = window.setInterval(() => {
      loadAnalytics({ silent: true });
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [filterDays]);

  const overview = analytics?.overview || {};
  const monthlyServiceTrend = Array.isArray(analytics?.monthlyServiceTrend) ? analytics.monthlyServiceTrend : [];
  const topServices = Array.isArray(analytics?.topRequestedServiceTypes) && analytics.topRequestedServiceTypes.length
    ? analytics.topRequestedServiceTypes
    : (Array.isArray(analytics?.jobCountByService) ? analytics.jobCountByService : []);
  const dailyForecast = Array.isArray(analytics?.dailyForecast) ? analytics.dailyForecast : [];
  const serviceForecast = Array.isArray(analytics?.serviceForecasts) ? analytics.serviceForecasts : [];
  const seasonalInventoryDemand = analytics?.seasonalInventoryDemand || {};
  const pendingRequests = Array.isArray(dashboardStats?.pending_requests) ? dashboardStats.pending_requests : [];
  const clientSchedule = Array.isArray(dashboardStats?.client_schedule) ? dashboardStats.client_schedule : [];
  const slaOverview = dashboardStats?.sla_overview || {};
  const dashOverview = dashboardStats?.overview || {};
  const pendingApprovalsCount = Number(dashOverview.pending_approvals ?? pendingRequests.length ?? 0);
  const scheduledJobsCount = Number(dashOverview.scheduled_jobs ?? clientSchedule.length ?? 0);

  /* Data for the new Key Metrics bar chart */
  const keyMetricsData = {
    total: analytics?.totalRequests ?? overview.totalRequests ?? 0,
    completed: analytics?.completedRequests ?? overview.completedRequests ?? 0,
    pending: analytics?.pendingRequests ?? overview.pendingRequests ?? 0,
    technicians:
      analytics?.availableTechnicians
      ?? overview.availableTechnicians
      ?? dashOverview.active_technicians
      ?? analytics?.activeTechnicians
      ?? overview.activeTechnicians
      ?? 0
  };

  /* Data for Operational Focus signals */
  const focusSegments = [
    {
      label: 'Overdue SLA',
      value: Number(slaOverview.overdue_count || 0),
      color: '#ef4444',
      description: 'Requests or tickets already outside their tracked SLA window.'
    },
    {
      label: 'Warning SLA',
      value: Number(slaOverview.warning_count || 0),
      color: '#f97316',
      description: 'Items approaching an SLA breach soon.'
    },
    {
      label: 'Low Stock',
      value: Number(dashOverview.low_stock_items || 0),
      color: '#f59e0b',
      description: 'Inventory items at or below the minimum stock threshold.'
    },
    {
      label: 'Due Maintenance',
      value: Number(dashOverview.due_maintenance || 0),
      color: '#8b5cf6',
      description: 'Maintenance records currently marked due.'
    },
    {
      label: 'Pending Approvals',
      value: pendingApprovalsCount,
      color: '#0ea5e9',
      description: 'Service requests still waiting for admin or supervisor approval.'
    },
    {
      label: 'Scheduled Jobs',
      value: scheduledJobsCount,
      color: '#06b6d4',
      description: 'Active tickets with a scheduled visit date on the admin board.'
    }
  ];

  return (
    <Layout>
      <div className="space-y-5">
        {/* ── Header with date filters ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              Last updated:{' '}
              <span className="text-slate-400">{formatDateTime(lastUpdated)}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
              {formatCompactNumber(analytics?.avgResponseTime ?? overview.avgResponseTimeHours)}h avg assignment delay
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
              {formatCompactNumber(analytics?.avgCompletionTime ?? overview.avgCompletionTimeHours)}h avg work duration
            </span>
            <button
              type="button"
              onClick={() => loadAnalytics({ silent: true })}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <FiRefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── Date Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="mr-1 text-sm font-medium text-slate-700">Period:</span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filterPeriod === opt.value
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* ── Row 1: Key Metrics bar + Operational Focus signals ── */}
        <div className="grid gap-5 xl:grid-cols-3">
          <KeyMetricsBar data={keyMetricsData} />
          <OperationalFocusDonut segments={focusSegments} />
          <OperationalFocusPanel segments={focusSegments} />
        </div>

        {/* ── Row 2: Monthly trend + Top services ── */}
        <div className="grid gap-5 xl:grid-cols-2">
          <MonthlyServiceChart data={monthlyServiceTrend} filterDays={filterDays} />
          <ServiceBarChart data={topServices} filterDays={filterDays} />
        </div>

        {/* ── Row 3: Forecast (full width) ── */}
        <ForecastAreaChart data={dailyForecast} serviceForecast={serviceForecast} filterDays={filterDays} />

        {/* ── Row 4: Technician Performance Monitoring ── */}
        <TechnicianPerformanceTable data={techPerformance} filterDays={filterDays} />

        {/* ── Row 5: Seasonal Inventory Demand ── */}
        <SeasonalInventoryDemand data={seasonalInventoryDemand} filterDays={filterDays} />

        {loading && !analytics ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            Loading analytics…
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
