import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCalendar, FiCheck, FiClipboard, FiClock, FiMap, FiPlus, FiRefreshCw, FiX } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import RescheduleTicketModal from '../../components/shared/RescheduleTicketModal';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import StatusBadge, { formatStatusLabel } from '../../components/ui/StatusBadge';
import SLABadge, { formatSlaSummary } from '../../components/ui/SLABadge';
import { formatClientId, formatTechnicianId, formatTicketId } from '../../utils/roleIds';
import {
  approveServiceRequest,
  createServiceRequest,
  fetchAdminClients,
  fetchServiceTicketSummary,
  fetchServiceTickets,
  fetchServiceTypes,
  fetchTicketTimeline,
  rescheduleServiceTicket
} from '../../api/api';

const priorityTone = {
  high: 'bg-red-50 text-red-700 ring-red-200',
  medium: 'bg-orange-50 text-orange-700 ring-orange-200',
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  normal: 'bg-slate-100 text-slate-700 ring-slate-200'
};

const queueActionLabel = (ticket) => {
  if (ticket.isMissedDispatch) return ticket.dispatchAction || 'Assign technician or reschedule';
  if (!ticket.assignedTech) return 'Dispatch technician';
  if (ticket.status === 'not_started' || ticket.status === 'assigned') return 'Confirm arrival window';
  if (ticket.status === 'in_progress') return 'Monitor field progress';
  if (ticket.status === 'completed') return 'Review completion notes';
  if (ticket.status === 'on_hold') return 'Resolve blocker';
  return 'Monitor queue';
};

const initialWalkInForm = {
  client: '',
  serviceTypeIds: [],
  description: '',
  priority: 'Normal',
  preferredDate: '',
  preferredTimeSlot: '',
  schedulingNotes: '',
  address: '',
  city: '',
  province: '',
  latitude: '',
  longitude: '',
  approveNow: true
};

const priorityOptions = ['Low', 'Normal', 'High', 'Urgent'];

const timeSlotOptions = [
  { value: '', label: 'Any time' },
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' }
];

const getServiceTypeName = (serviceType) => serviceType?.name || serviceType?.service || `Service #${serviceType?.id}`;
const getClientLabel = (client) => {
  const mainLabel = client?.name || client?.full_name || client?.username || client?.email || `Client #${client?.id}`;
  return `${mainLabel}${client?.email ? ` (${client.email})` : ''}`;
};

const shortSourceLabel = (sourceLabel = '') =>
  String(sourceLabel).replace(/\s+Portal$/i, '').trim() || sourceLabel;

const normalizeStatus = (status) => String(status || '').toLowerCase().replace(/\s+/g, '_');
const CLOSED_QUEUE_STATUSES = new Set(['completed', 'cancelled']);
const isClosedTicket = (ticket) => CLOSED_QUEUE_STATUSES.has(normalizeStatus(ticket.status));

export default function AdminServiceTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [walkInForm, setWalkInForm] = useState(initialWalkInForm);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [walkInMessage, setWalkInMessage] = useState('');
  const [walkInError, setWalkInError] = useState('');
  const [rescheduleTicket, setRescheduleTicket] = useState(null);
  const [timelineTicket, setTimelineTicket] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [rescheduleMessage, setRescheduleMessage] = useState('');
  const [ticketSummary, setTicketSummary] = useState(null);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [ticketData, serviceTypeData, clientData, summaryData] = await Promise.all([
        fetchServiceTickets(),
        fetchServiceTypes(),
        fetchAdminClients(),
        fetchServiceTicketSummary()
      ]);
      setTickets(ticketData);
      setServiceTypes(serviceTypeData);
      setClients(clientData);
      setTicketSummary(summaryData);
      setError('');
    } catch (loadError) {
      setTickets([]);
      setTicketSummary(null);
      setError(loadError.message || 'Unable to load service tickets.');
    }
  };

  useEffect(() => { loadData(); }, []);

  const updateWalkInForm = (field, value) => {
    setWalkInForm((currentForm) => ({ ...currentForm, [field]: value }));
    setWalkInError('');
    setWalkInMessage('');
  };

  const toggleServiceType = (serviceTypeId) => {
    setWalkInForm((currentForm) => {
      const exists = currentForm.serviceTypeIds.includes(serviceTypeId);
      return {
        ...currentForm,
        serviceTypeIds: exists
          ? currentForm.serviceTypeIds.filter((id) => id !== serviceTypeId)
          : [...currentForm.serviceTypeIds, serviceTypeId]
      };
    });
    setWalkInError('');
    setWalkInMessage('');
  };

  const resetWalkInForm = () => {
    setWalkInForm(initialWalkInForm);
    setWalkInError('');
  };

  const openRescheduleModal = (ticket) => {
    setRescheduleTicket(ticket);
    setRescheduleMessage('');
    setError('');
  };

  const openTimelineModal = async (ticket) => {
    setTimelineTicket(ticket);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);

    try {
      const events = await fetchTicketTimeline(ticket.id);
      setTimelineEvents(events);
    } catch (timelineLoadError) {
      setTimelineError(timelineLoadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleRescheduleSubmit = async (ticketId, schedulingData) => {
    await rescheduleServiceTicket(ticketId, schedulingData);
    await loadData();
    setRescheduleTicket(null);
    setRescheduleMessage(`${formatTicketId(ticketId)} schedule updated.`);
  };

  const handleWalkInSubmit = async (event) => {
    event.preventDefault();
    const latitude = Number(walkInForm.latitude);
    const longitude = Number(walkInForm.longitude);

    if (!walkInForm.client) {
      setWalkInError('Please select the walk-in client.');
      return;
    }
    if (walkInForm.serviceTypeIds.length === 0) {
      setWalkInError('Please select at least one service.');
      return;
    }
    if (!walkInForm.description.trim()) {
      setWalkInError('Please add a short request description.');
      return;
    }
    if (!walkInForm.preferredDate) {
      setWalkInError('Please choose the preferred service date.');
      return;
    }
    if (!walkInForm.address.trim() || !walkInForm.city.trim() || !walkInForm.province.trim()) {
      setWalkInError('Please complete the service address, city, and province.');
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setWalkInError('Please enter valid latitude and longitude for dispatch.');
      return;
    }

    try {
      setWalkInSubmitting(true);
      setWalkInError('');
      setWalkInMessage('');

      const serviceIds = walkInForm.serviceTypeIds.map(Number);
      const createdRequest = await createServiceRequest({
        client: Number(walkInForm.client),
        service_type: serviceIds[0],
        service_types: serviceIds,
        description: walkInForm.description.trim(),
        priority: walkInForm.priority,
        request_source: 'walk_in',
        preferred_date: walkInForm.preferredDate,
        preferred_time_slot: walkInForm.preferredTimeSlot || null,
        scheduling_notes: walkInForm.schedulingNotes.trim() || null,
        location_address: walkInForm.address.trim(),
        location_city: walkInForm.city.trim(),
        location_province: walkInForm.province.trim(),
        latitude,
        longitude
      });

      if (walkInForm.approveNow) {
        await approveServiceRequest(createdRequest.id);
      }

      await loadData();
      setWalkInForm(initialWalkInForm);
      setWalkInMessage(
        walkInForm.approveNow
          ? `Walk-in request #${createdRequest.id} approved and added to dispatch.`
          : `Walk-in request #${createdRequest.id} saved for review.`
      );
    } catch (submitError) {
      setWalkInError(submitError.message || 'Unable to create walk-in request.');
    } finally {
      setWalkInSubmitting(false);
    }
  };

  const activeQueueTickets = tickets.filter((ticket) => !isClosedTicket(ticket));
  const completedTickets = tickets.filter((ticket) => normalizeStatus(ticket.status) === 'completed');
  const unassignedTickets = activeQueueTickets.filter((t) => !t.assignedTech);
  const missedDispatchTickets = activeQueueTickets.filter((t) => t.isMissedDispatch);
  const warningTickets = activeQueueTickets.filter((t) => t?.sla?.state === 'warning');
  const overdueTickets = activeQueueTickets.filter((t) => t?.sla?.state === 'overdue');
  const activeQueueCount = ticketSummary?.activeQueue ?? activeQueueTickets.length;
  const missedDispatchCount = ticketSummary?.missedDispatch ?? missedDispatchTickets.length;
  const slaRiskCount = ticketSummary?.slaRisk ?? (overdueTickets.length + warningTickets.length);
  const completedCount = ticketSummary?.completed ?? completedTickets.length;
  const sortedTickets = [...activeQueueTickets].sort((firstTicket, secondTicket) => {
    if (firstTicket.isMissedDispatch !== secondTicket.isMissedDispatch) {
      return firstTicket.isMissedDispatch ? -1 : 1;
    }
    return new Date(firstTicket.scheduledDate || 0) - new Date(secondTicket.scheduledDate || 0);
  });

  return (
    <Layout>
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-end">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
            <button
              onClick={() => setShowWalkInForm((isVisible) => !isVisible)}
              className="inline-flex items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100"
            >
              {showWalkInForm ? <FiX className="mr-2" /> : <FiPlus className="mr-2" />}
              {showWalkInForm ? 'Close Walk-in Form' : 'Create Walk-in Request'}
            </button>
            <button
              onClick={() => navigate('/admin/job-history')}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              <FiCheck className="mr-2" /> Job History
            </button>
        </div>
      </section>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {rescheduleMessage && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {rescheduleMessage}
        </div>
      )}

      {showWalkInForm && (
        <section className="mt-5">
          <form onSubmit={handleWalkInSubmit} className="card p-4 sm:p-5">
            <div className="flex flex-col gap-2 border-b border-surface-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Walk-in Request</h2>
                <p className="text-sm text-slate-500">For clients who request service in person or by phone.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={walkInForm.approveNow}
                  onChange={(event) => updateWalkInForm('approveNow', event.target.checked)}
                  className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Approve and create ticket now
              </label>
            </div>

            {walkInMessage && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                {walkInMessage}
              </div>
            )}
            {walkInError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {walkInError}
              </div>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Client
                <select
                  value={walkInForm.client}
                  onChange={(event) => updateWalkInForm('client', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{getClientLabel(client)}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Priority
                <select
                  value={walkInForm.priority}
                  onChange={(event) => updateWalkInForm('priority', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-slate-700">Services</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {serviceTypes.map((serviceType) => {
                  const serviceTypeId = String(serviceType.id);
                  const isSelected = walkInForm.serviceTypeIds.includes(serviceTypeId);
                  return (
                    <button
                      key={serviceType.id}
                      type="button"
                      onClick={() => toggleServiceType(serviceTypeId)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        isSelected
                          ? 'border-brand-300 bg-brand-50 text-brand-800'
                          : 'border-surface-200 bg-white text-slate-700 hover:bg-surface-50'
                      }`}
                    >
                      <span className="font-medium">{getServiceTypeName(serviceType)}</span>
                      {isSelected && <FiCheck className="shrink-0 text-brand-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Request Details
              <textarea
                value={walkInForm.description}
                onChange={(event) => updateWalkInForm('description', event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Describe what the client needs."
              />
            </label>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Preferred Date
                <input
                  type="date"
                  value={walkInForm.preferredDate}
                  onChange={(event) => updateWalkInForm('preferredDate', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Time Slot
                <select
                  value={walkInForm.preferredTimeSlot}
                  onChange={(event) => updateWalkInForm('preferredTimeSlot', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {timeSlotOptions.map((slot) => (
                    <option key={slot.value} value={slot.value}>{slot.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr_1fr]">
              <label className="block text-sm font-medium text-slate-700">
                Service Address
                <input
                  value={walkInForm.address}
                  onChange={(event) => updateWalkInForm('address', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="Street, barangay, landmark"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                City
                <input
                  value={walkInForm.city}
                  onChange={(event) => updateWalkInForm('city', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Province
                <input
                  value={walkInForm.province}
                  onChange={(event) => updateWalkInForm('province', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Latitude
                <input
                  type="number"
                  step="any"
                  value={walkInForm.latitude}
                  onChange={(event) => updateWalkInForm('latitude', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="11.6383"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Longitude
                <input
                  type="number"
                  step="any"
                  value={walkInForm.longitude}
                  onChange={(event) => updateWalkInForm('longitude', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="124.7417"
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Scheduling Notes
              <textarea
                value={walkInForm.schedulingNotes}
                onChange={(event) => updateWalkInForm('schedulingNotes', event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Optional notes for dispatch."
              />
            </label>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetWalkInForm}
                className="inline-flex items-center justify-center rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-surface-50"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={walkInSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {walkInSubmitting ? 'Saving...' : 'Save Walk-in Request'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Stats */}
      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">Active Queue</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">{activeQueueCount}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">Missed Dispatch</p>
          <p className="mt-1 text-3xl font-bold text-rose-600">{missedDispatchCount}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">SLA Risk</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{slaRiskCount}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-[13px] font-medium text-slate-500">Completed</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600">{completedCount}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/job-history')}
            className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            View history
          </button>
        </div>
      </section>

      {/* Main content */}
      <section className="mt-4">
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-surface-200 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 sm:text-xl">
                <FiClipboard className="text-brand-500" />
                Ticket Queue
              </h2>
              <p className="text-sm text-slate-500">Monitor active service demand, ownership, and progress. Completed jobs live in Job History.</p>
            </div>
            <div className="text-sm text-slate-400">Dispatch actions live on the dispatch board.</div>
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-3">
            <StatusBadge status="pending" size="sm" />
            <StatusBadge status="approved" size="sm" />
            <StatusBadge status="not_started" size="sm" />
            <StatusBadge status="assigned" size="sm" />
            <StatusBadge status="in_progress" size="sm" />
            <StatusBadge status="on_hold" size="sm" />
            <button
              type="button"
              onClick={() => navigate('/admin/job-history')}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Completed: Job History
            </button>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 px-3 pb-3 md:hidden">
            {sortedTickets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-6 text-center text-sm text-slate-500">
                No active tickets in the queue. Completed work is available in Job History.
              </div>
            ) : sortedTickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`rounded-xl border p-4 shadow-card ${
                  ticket.isMissedDispatch
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-surface-200 bg-gradient-to-b from-white to-surface-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-brand-600">{formatTicketId(ticket.id)}</div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Ticket ID</div>
                    <div className="font-semibold text-slate-900">{ticket.service}</div>
                    <div className="text-sm text-slate-600">{ticket.clientFullname}</div>
                    <div className="mt-1 w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                      {ticket.requestSourceLabel}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${priorityTone[ticket.priority] || priorityTone.normal}`}>
                    {String(ticket.priority || 'low').charAt(0).toUpperCase() + String(ticket.priority || 'low').slice(1)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket.status} />
                  {ticket.isMissedDispatch && (
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                      Missed Dispatch
                    </span>
                  )}
                  <SLABadge sla={ticket.sla} />
                  <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {ticket.assignedTech || 'Unassigned'}
                    {ticket.crewMembers?.length ? ` + ${ticket.crewMembers.length} crew` : ''}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-700">
                  <div><span className="font-medium text-slate-900">Client(ID):</span> {formatClientId(ticket.clientId)}</div>
                  <div><span className="font-medium text-slate-900">Client(Fullname):</span> {ticket.clientFullname}</div>
                  <div><span className="font-medium text-slate-900">Source:</span> {ticket.requestSourceLabel}</div>
                  <div><span className="font-medium text-slate-900">Technician:</span> {formatTechnicianId(ticket.assignedTechnicianId)}</div>
                  <div><span className="font-medium text-slate-900">Technician Fullname:</span> {ticket.technicianFullname || 'Unassigned'}</div>
                  <div><span className="font-medium text-slate-900">Queue Step:</span> {queueActionLabel(ticket)}</div>
                  {ticket.isMissedDispatch && (
                    <div className="font-medium text-rose-700">
                      Scheduled date already passed without assignment.
                    </div>
                  )}
                  <div><span className="font-medium text-slate-900">Display Status:</span> {formatStatusLabel(ticket.status)}</div>
                  <div><span className="font-medium text-slate-900">SLA:</span> {formatSlaSummary(ticket.sla)}</div>
                  {ticket.crewMembers?.length > 0 && (
                    <div><span className="font-medium text-slate-900">Crew:</span> {ticket.crewSummary}</div>
                  )}
                  {ticket.status === 'completed' && (
                    <div>
                      <span className="font-medium text-slate-900">Completion Notes:</span>{' '}
                      {ticket.completionNotes || 'No completion notes captured.'}
                    </div>
                  )}
                </div>

                {!ticket.assignedTech && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => openTimelineModal(ticket)}
                      className="inline-flex items-center rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-50"
                    >
                      <FiClock className="mr-2" /> Timeline
                    </button>
                    <button
                      onClick={() => navigate('/admin/dispatch-board')}
                      className="inline-flex items-center rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                    >
                      <FiMap className="mr-2" /> Assign in Dispatch
                    </button>
                    <button
                      onClick={() => openRescheduleModal(ticket)}
                      className="inline-flex items-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      <FiCalendar className="mr-2" /> Reschedule
                    </button>
                  </div>
                )}
                {ticket.assignedTech && ticket.status === 'not_started' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => openTimelineModal(ticket)}
                      className="inline-flex items-center rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-50"
                    >
                      <FiClock className="mr-2" /> Timeline
                    </button>
                    <button
                      onClick={() => openRescheduleModal(ticket)}
                      className="inline-flex items-center rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-50"
                    >
                      <FiCalendar className="mr-2" /> Reschedule
                    </button>
                  </div>
                )}
                {ticket.assignedTech && ticket.status !== 'not_started' && (
                  <button
                    onClick={() => openTimelineModal(ticket)}
                    className="mt-4 inline-flex items-center rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-50"
                  >
                    <FiClock className="mr-2" /> Timeline
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">ID</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Client</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Service</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Source</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Priority</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Schedule Notes</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">SLA</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Technician</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Next Step</th>
                </tr>
              </thead>
              <tbody>
                {sortedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                      No active tickets in the queue. Completed work is available in Job History.
                    </td>
                  </tr>
                ) : sortedTickets.map((ticket, idx) => (
                  <tr
                    key={ticket.id}
                    className={`border-b border-surface-200 transition hover:bg-brand-50/30 ${
                      ticket.isMissedDispatch
                        ? 'bg-rose-50'
                        : idx % 2 === 1
                          ? 'bg-surface-50/50'
                          : ''
                    }`}
                  >
                    <td className="px-2 py-2.5">
                      <div className="font-bold text-brand-600">{formatTicketId(ticket.id)}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="font-semibold text-slate-900">{ticket.clientFullname}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">{formatClientId(ticket.clientId)}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="max-w-[170px] font-medium text-slate-800">{ticket.service}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                        {shortSourceLabel(ticket.requestSourceLabel)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${priorityTone[ticket.priority] || priorityTone.normal}`}>
                        {String(ticket.priority || 'low').charAt(0).toUpperCase() + String(ticket.priority || 'low').slice(1)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-col gap-2">
                        <StatusBadge status={ticket.status} size="sm" />
                        {ticket.isMissedDispatch && (
                          <span className="w-fit rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                            Missed Dispatch
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="max-w-[180px] text-xs leading-5 text-slate-500">
                        {ticket.status === 'completed'
                          ? (ticket.completionNotes || 'No completion notes captured.')
                          : (ticket.schedulingNotes || '-')}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex min-w-[190px] flex-col gap-2">
                        <SLABadge sla={ticket.sla} size="sm" />
                        <span className="text-xs text-slate-500">{formatSlaSummary(ticket.sla)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 font-medium">
                      <div>{ticket.technicianFullname || 'Unassigned'}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">{formatTechnicianId(ticket.assignedTechnicianId)}</div>
                      {ticket.crewMembers?.length > 0 && (
                        <div className="text-xs font-normal text-slate-500">{ticket.crewSummary}</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {ticket.assignedTech ? (
                        <div className="flex min-w-[150px] flex-col items-start gap-2">
                          <span className="text-xs font-medium text-slate-500">{queueActionLabel(ticket)}</span>
                          <button
                            type="button"
                            onClick={() => openTimelineModal(ticket)}
                            className="inline-flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-surface-50"
                          >
                            <FiClock /> Timeline
                          </button>
                          {ticket.status === 'not_started' && (
                            <button
                              type="button"
                              onClick={() => openRescheduleModal(ticket)}
                              className="inline-flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-surface-50"
                            >
                              <FiCalendar /> Reschedule
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex min-w-[150px] flex-col items-start gap-2">
                          <button
                            type="button"
                            onClick={() => openTimelineModal(ticket)}
                            className="inline-flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-surface-50"
                          >
                            <FiClock /> Timeline
                          </button>
                          <button
                            onClick={() => navigate('/admin/dispatch-board')}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${
                              ticket.isMissedDispatch ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-500 hover:bg-brand-600'
                            }`}
                          >
                            {ticket.isMissedDispatch ? 'Fix Dispatch' : 'Send to Dispatch'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openRescheduleModal(ticket)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            <FiCalendar /> Reschedule
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <RescheduleTicketModal
        ticket={rescheduleTicket}
        onClose={() => setRescheduleTicket(null)}
        onSubmit={handleRescheduleSubmit}
      />
      <TicketTimelineModal
        ticket={timelineTicket}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineTicket(null)}
      />
    </Layout>
  );
}
