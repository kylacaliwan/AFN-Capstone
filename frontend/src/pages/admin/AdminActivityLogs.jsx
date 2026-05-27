import { useEffect, useMemo, useState } from 'react';
import { FiActivity, FiFilter, FiRefreshCw, FiSearch } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import { fetchActivityLogs } from '../../api/api';

const actionTone = {
  create: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  update: 'bg-sky-50 text-sky-700 ring-sky-200',
  delete: 'bg-rose-50 text-rose-700 ring-rose-200'
};

const modelOptions = [
  { value: '', label: 'All records' },
  { value: 'serviceticket', label: 'Tickets' },
  { value: 'servicerequest', label: 'Service Requests' },
  { value: 'user', label: 'Users' },
  { value: 'servicetype', label: 'Services' },
  { value: 'inventoryitem', label: 'Inventory Items' },
  { value: 'inventoryreservation', label: 'Inventory Reservations' },
  { value: 'inventorytransaction', label: 'Inventory Transactions' },
  { value: 'aftersalescase', label: 'After-Sales Cases' },
  { value: 'maintenanceschedule', label: 'Maintenance Schedules' }
];

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const formatModelLabel = (value = '') =>
  String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const shortValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const text = String(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
};

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    action: '',
    model: '',
    dateFrom: '',
    dateTo: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await fetchActivityLogs(filters);
      setLogs(data);
      setError('');
    } catch (loadError) {
      setLogs([]);
      setError(loadError.message || 'Unable to load activity logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const counts = useMemo(() => ({
    total: logs.length,
    create: logs.filter((log) => log.action === 'create').length,
    update: logs.filter((log) => log.action === 'update').length,
    delete: logs.filter((log) => log.action === 'delete').length
  }), [logs]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    loadLogs();
  };

  return (
    <Layout>
      <section className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loaded Logs</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{counts.total}</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{counts.create}</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</p>
            <p className="mt-2 text-2xl font-bold text-sky-600">{counts.update}</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deleted</p>
            <p className="mt-2 text-2xl font-bold text-rose-600">{counts.delete}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_180px_220px_160px_160px_auto]">
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <FiSearch /> Search
              </span>
              <input
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Actor, field, value, summary"
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Action</span>
              <select
                value={filters.action}
                onChange={(event) => updateFilter('action', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              >
                <option value="">All actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Record</span>
              <select
                value={filters.model}
                onChange={(event) => updateFilter('model', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">From</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => updateFilter('dateFrom', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">To</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter('dateTo', event.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <FiFilter /> Apply
              </button>
              <button
                type="button"
                onClick={loadLogs}
                className="inline-flex h-10 items-center rounded-lg border border-surface-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-surface-50"
                aria-label="Refresh logs"
              >
                <FiRefreshCw />
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <section className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-surface-200 px-4 py-3">
            <FiActivity className="text-brand-500" />
            <h2 className="text-base font-semibold text-slate-900">Activity Logs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Record</th>
                  <th className="px-3 py-3">Field</th>
                  <th className="px-3 py-3">Before</th>
                  <th className="px-3 py-3">After</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">Loading activity logs...</td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No activity logs match the current filters.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-surface-200 align-top hover:bg-surface-50/70">
                      <td className="px-3 py-3 text-xs font-medium text-slate-500">{formatDateTime(log.changedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{log.changedByName}</div>
                        <div className="text-xs capitalize text-slate-500">{log.changedByRole || 'system'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${actionTone[log.action] || actionTone.update}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{formatModelLabel(log.model)}</div>
                        <div className="max-w-[240px] truncate text-xs text-slate-500" title={log.objectLabel}>
                          #{log.objectId} {log.objectLabel}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{log.fieldName || 'record'}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[220px] whitespace-pre-wrap rounded-lg bg-surface-50 px-2 py-1 text-xs text-slate-600">
                          {shortValue(log.oldValue)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="max-w-[220px] whitespace-pre-wrap rounded-lg bg-surface-50 px-2 py-1 text-xs text-slate-600">
                          {shortValue(log.newValue)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </Layout>
  );
}
