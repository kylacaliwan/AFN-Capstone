import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiAlertCircle, FiCheckCircle, FiClock, FiRefreshCw } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/ui/StatusBadge';
import {
  createFollowUpCase,
  fetchFollowUpCases,
  fetchServiceTickets,
  updateFollowUpCase
} from '../../api/api';
import { formatTicketId } from '../../utils/roleIds';

const CASE_TYPE_OPTIONS = [
  { value: 'follow_up', label: 'After Sales' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'revisit', label: 'Revisit' },
  { value: 'feedback', label: 'Feedback' }
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open_work', label: 'Open work' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
];

const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'completion_flow', label: 'Technician' },
  { value: 'maintenance_alert', label: 'Maintenance' },
  { value: 'manual', label: 'Manual' }
];

const CASE_TYPE_LABELS = Object.fromEntries(CASE_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const CASE_TYPE_VALUES = CASE_TYPE_OPTIONS.map((option) => option.value);
const PRIORITY_VALUES = PRIORITY_OPTIONS.map((option) => option.value);
const SOURCE_VALUES = SOURCE_FILTER_OPTIONS.map((option) => option.value).filter((value) => value !== 'all');

const SOURCE_LABELS = {
  manual: 'Manual',
  completion_flow: 'Technician',
  maintenance_alert: 'Maintenance'
};

const emptyForm = {
  service_ticket: '',
  case_type: 'follow_up',
  priority: 'normal',
  summary: '',
  details: '',
  due_date: '',
  requires_revisit: false
};

const formatDate = (value) => {
  if (!value) return 'No date';

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const formatCaseType = (value) => CASE_TYPE_LABELS[value] || String(value || '').replace('_', ' ');

const TYPE_CHIP_CLASSES = {
  follow_up: 'bg-sky-50 text-sky-700 ring-sky-200',
  maintenance: 'bg-violet-50 text-violet-700 ring-violet-200',
  complaint: 'bg-rose-50 text-rose-700 ring-rose-200',
  warranty: 'bg-amber-50 text-amber-700 ring-amber-200',
  revisit: 'bg-orange-50 text-orange-700 ring-orange-200',
  feedback: 'bg-emerald-50 text-emerald-700 ring-emerald-200'
};

const SOURCE_CHIP_CLASSES = {
  completion_flow: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  maintenance_alert: 'bg-violet-50 text-violet-700 ring-violet-200',
  manual: 'bg-slate-100 text-slate-700 ring-slate-200'
};

const getCaseTitle = (caseItem) => {
  const summary = String(caseItem.summary || '').trim();
  const weakSummary = !summary || summary.length < 8 || /^[a-z]{1,4}$/i.test(summary);

  if (!weakSummary && /^scheduled maintenance is approaching/i.test(summary)) {
    return `Scheduled maintenance for ${caseItem.client_full_name || caseItem.client_name || 'client'}`;
  }

  if (!weakSummary) return summary;

  const typeLabel = formatCaseType(caseItem.case_type);
  const serviceName = caseItem.service_type_name || 'service';
  return `${typeLabel} case for ${serviceName}`;
};

const getContactLine = (caseItem) => (
  [caseItem.client_phone, caseItem.client_email].filter(Boolean).join(' / ') || 'No contact'
);

const getSourceLabel = (caseItem) => (
  caseItem.creation_source_label || SOURCE_LABELS[caseItem.creation_source] || 'Manual'
);

export default function FollowUpCases() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cases, setCases] = useState([]);
  const [completedTickets, setCompletedTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const statusFilter = searchParams.get('status') || 'all';
  const caseTypeFilter = searchParams.get('case_type') || 'all';
  const priorityFilter = searchParams.get('priority') || 'all';
  const sourceFilter = searchParams.get('source') || 'all';
  const appliedSearch = searchParams.get('search') || '';
  const [searchTerm, setSearchTerm] = useState(appliedSearch);
  const [form, setForm] = useState(emptyForm);

  const load = async ({ preserveMessage = false } = {}) => {
    const requestFilters = {};

    if (statusFilter !== 'all') requestFilters.status = statusFilter;
    if (CASE_TYPE_VALUES.includes(caseTypeFilter)) requestFilters.caseType = caseTypeFilter;
    if (PRIORITY_VALUES.includes(priorityFilter)) requestFilters.priority = priorityFilter;
    if (SOURCE_VALUES.includes(sourceFilter)) requestFilters.creationSource = sourceFilter;
    if (appliedSearch.trim()) requestFilters.search = appliedSearch.trim();
    requestFilters.ordering = statusFilter === 'overdue' ? 'due_date' : '-created_at';

    setLoading(true);
    try {
      const [caseList, ticketList] = await Promise.all([
        fetchFollowUpCases(requestFilters),
        fetchServiceTickets({ workspace: 'after_sales' })
      ]);
      const eligibleTickets = ticketList.filter((ticket) => ticket.status === 'completed');

      setCases(caseList);
      setCompletedTickets(eligibleTickets);
      setForm((current) => ({
        ...current,
        service_ticket: current.service_ticket || eligibleTickets[0]?.id || ''
      }));
      if (!preserveMessage) setMessage('');
    } catch (error) {
      setCases([]);
      setCompletedTickets([]);
      setMessage(error.message || 'Unable to load after-sales cases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter, caseTypeFilter, priorityFilter, sourceFilter, appliedSearch]);

  useEffect(() => {
    setSearchTerm(appliedSearch);
  }, [appliedSearch]);

  const updateFilter = (key, value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (!value || value === 'all') {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }
    setSearchParams(nextParams);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const applySearch = (event) => {
    event.preventDefault();
    updateFilter('search', searchTerm.trim());
  };

  const createCase = async () => {
    try {
      await createFollowUpCase({
        ...form,
        service_ticket: Number(form.service_ticket),
        due_date: form.due_date || null
      });
      setMessage('After-sales case created.');
      setShowCreateForm(false);
      setForm({
        ...emptyForm,
        service_ticket: completedTickets[0]?.id || ''
      });
      await load({ preserveMessage: true });
    } catch (error) {
      setMessage(error.message || 'Unable to create after-sales case.');
    }
  };

  const updateStatus = async (caseItem, status) => {
    try {
      await updateFollowUpCase(caseItem.id, { status });
      setMessage('After-sales case updated.');
      await load({ preserveMessage: true });
    } catch (error) {
      setMessage(error.message || 'Unable to update after-sales case.');
    }
  };

  const hasFilters = [statusFilter, caseTypeFilter, priorityFilter, sourceFilter].some((value) => value !== 'all') || Boolean(appliedSearch);

  const openCases = cases.filter((c) => c.status === 'open');
  const inProgressCases = cases.filter((c) => c.status === 'in_progress');
  const overdueCases = cases.filter((c) => c.status === 'overdue');
  const resolvedCases = cases.filter((c) => c.status === 'resolved');

  return (
    <Layout>
      <section className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-200">After-Sales Management</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl lg:text-4xl">Case Queue</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
              Manage after-sales cases from completed service tickets. Track maintenance schedules, warranty claims, and follow-up services.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:max-w-md lg:justify-end">
            <button
              onClick={() => load()}
              className="inline-flex items-center justify-center rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
            >
              <FiRefreshCw className="mr-2" /> Refresh
            </button>
            <button
              onClick={() => setShowCreateForm((current) => !current)}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
            >
              {showCreateForm ? 'Hide Form' : '+ New Case'}
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className={`mt-4 rounded-xl border p-4 text-sm ${
          message.includes('Unable')
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {message}
        </div>
      )}

      {/* Stats Cards */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-500">Total Cases</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{cases.length}</p>
            </div>
            <FiClock className="text-4xl text-slate-300" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-500">Open Work</p>
              <p className="mt-2 text-3xl font-bold text-amber-600">{openCases.length}</p>
            </div>
            <FiAlertCircle className="text-4xl text-amber-200" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-500">In Progress</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">{inProgressCases.length}</p>
            </div>
            <FiClock className="text-4xl text-blue-200" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-500">Resolved</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{resolvedCases.length}</p>
            </div>
            <FiCheckCircle className="text-4xl text-emerald-200" />
          </div>
        </div>
      </section>

      {/* Create Form */}
      {showCreateForm && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900">New Manual Case</h3>
            <p className="mt-1 text-sm text-slate-500">Use this for exceptions after a ticket is already completed.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Completed Ticket</label>
              <select
                value={form.service_ticket}
                onChange={(event) => setForm({ ...form, service_ticket: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {completedTickets.length > 0 ? (
                  completedTickets.map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>{formatTicketId(ticket.id)} {ticket.client} - {ticket.service}</option>
                  ))
                ) : (
                  <option value="">No completed tickets</option>
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
              <select
                value={form.case_type}
                onChange={(event) => setForm({ ...form, case_type: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {CASE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
              <select
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Summary</label>
              <input
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Short case summary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(event) => setForm({ ...form, due_date: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">Details</label>
              <textarea
                value={form.details}
                onChange={(event) => setForm({ ...form, details: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                rows="3"
                placeholder="Optional notes for the after-sales agent"
              />
            </div>
          </div>
          <button
            onClick={createCase}
            disabled={!form.service_ticket || !form.summary}
            className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Case
          </button>
        </section>
      )}

      {/* Filters Section */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={applySearch} className="grid gap-3 lg:grid-cols-[1fr_160px_170px_150px_170px_auto]">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Search cases..."
          />
          <select
            value={statusFilter}
            onChange={(event) => updateFilter('status', event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={caseTypeFilter}
            onChange={(event) => updateFilter('case_type', event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            {CASE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => updateFilter('priority', event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Priorities</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(event) => updateFilter('source', event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {SOURCE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Search
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Cases Table/Cards Section */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Cases ({cases.length})</h2>
            <span className="text-sm text-slate-500">{loading ? 'Loading...' : `${cases.length} shown`}</span>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-600">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No cases found. {!hasFilters && 'Complete a ticket with a handoff, wait for a maintenance alert, or create a manual case.'}
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="md:hidden">
              <div className="divide-y divide-slate-200">
                {cases.map((caseItem) => (
                  <div key={caseItem.id} className="p-4 hover:bg-slate-50">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Case #{caseItem.id}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${TYPE_CHIP_CLASSES[caseItem.case_type] || TYPE_CHIP_CLASSES.follow_up}`}>
                            {formatCaseType(caseItem.case_type)}
                          </span>
                        </div>
                        <div className="mt-1 font-semibold text-slate-950">{getCaseTitle(caseItem)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatTicketId(caseItem.ticket_id)} / {caseItem.service_type_name || 'Service'}
                        </div>
                      </div>
                      <StatusBadge status={caseItem.status} size="sm" />
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-slate-500">Client</span>
                        <div className="font-medium text-slate-800">{caseItem.client_full_name || caseItem.client_name || 'Client'}</div>
                        <div className="truncate text-xs text-slate-500">{getContactLine(caseItem)}</div>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Technician</span>
                        <div className="font-medium text-slate-800">{caseItem.technician_full_name || 'Unassigned'}</div>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Source</span>
                        <div className="font-medium text-slate-700">{getSourceLabel(caseItem)}</div>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Due</span>
                        <div className="font-medium text-slate-700">{formatDate(caseItem.due_date)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {caseItem.status === 'open' && (
                        <button
                          onClick={() => updateStatus(caseItem, 'in_progress')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Start
                        </button>
                      )}
                      {caseItem.status !== 'resolved' && caseItem.status !== 'closed' && (
                        <button
                          onClick={() => updateStatus(caseItem, 'resolved')}
                          className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600"
                        >
                          Resolve
                        </button>
                      )}
                      {caseItem.status !== 'closed' && (
                        <button
                          onClick={() => updateStatus(caseItem, 'closed')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Close
                        </button>
                      )}
                      {(caseItem.status === 'resolved' || caseItem.status === 'closed') && (
                        <button
                          onClick={() => updateStatus(caseItem, 'open')}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="w-[34%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Case</th>
                    <th className="w-[22%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Client</th>
                    <th className="w-[16%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Technician</th>
                    <th className="w-[16%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Case State</th>
                    <th className="w-[12%] px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {cases.map((caseItem, idx) => (
                    <tr key={caseItem.id} className={`transition hover:bg-sky-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="px-5 py-4 align-top">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">#{caseItem.id}</span>
                          <div className="min-w-0">
                            <div className="line-clamp-2 font-semibold leading-5 text-slate-950">{getCaseTitle(caseItem)}</div>
                            <div className="mt-1 truncate text-xs text-slate-500">
                              {formatTicketId(caseItem.ticket_id)} / {caseItem.service_type_name || 'Service'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="truncate font-medium text-slate-900">
                          {caseItem.client_full_name || caseItem.client_name || 'Client'}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">{getContactLine(caseItem)}</div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {caseItem.technician_full_name ? (
                          <div className="truncate font-medium text-slate-900">{caseItem.technician_full_name}</div>
                        ) : (
                          <div className="text-sm text-slate-400">Unassigned</div>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TYPE_CHIP_CLASSES[caseItem.case_type] || TYPE_CHIP_CLASSES.follow_up}`}>
                            {formatCaseType(caseItem.case_type)}
                          </span>
                          <StatusBadge status={caseItem.status} size="sm" />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${SOURCE_CHIP_CLASSES[caseItem.creation_source] || SOURCE_CHIP_CLASSES.manual}`}>
                            {getSourceLabel(caseItem)}
                          </span>
                          <span className="text-slate-500">{formatDate(caseItem.due_date)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap justify-end gap-2">
                          {caseItem.status === 'open' && (
                            <button
                              onClick={() => updateStatus(caseItem, 'in_progress')}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Start
                            </button>
                          )}
                          {caseItem.status !== 'resolved' && caseItem.status !== 'closed' && (
                            <button
                              onClick={() => updateStatus(caseItem, 'resolved')}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
                            >
                              Resolve
                            </button>
                          )}
                          {caseItem.status !== 'closed' && (
                            <button
                              onClick={() => updateStatus(caseItem, 'closed')}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Close
                            </button>
                          )}
                          {(caseItem.status === 'resolved' || caseItem.status === 'closed') && (
                            <button
                              onClick={() => updateStatus(caseItem, 'open')}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
