import { FiClock, FiX } from 'react-icons/fi';
import StatusBadge from '../ui/StatusBadge';
import { formatTicketId } from '../../utils/roleIds';

const formatTimelineDate = (value) => {
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

const displayText = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => displayText(item, '')).filter(Boolean).join(', ') || fallback;
  if (typeof value === 'object') {
    return value.full_name || value.name || value.username || value.email || fallback;
  }
  return fallback;
};

export default function TicketTimelineModal({ ticket, events = [], loading = false, error = '', onClose }) {
  if (!ticket) return null;

  const ticketId = ticket.ticket_id || ticket.ticketId || ticket.id;
  const serviceName = displayText(ticket.service || ticket.service_type, 'Service');
  const clientName = displayText(ticket.clientFullname || ticket.client, 'Client');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-elevated">
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Ticket Activity Timeline</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{formatTicketId(ticketId)}</h2>
            <p className="mt-1 text-sm text-slate-500">{serviceName} for {clientName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-200 bg-white p-2 text-slate-500 transition hover:bg-surface-50 hover:text-slate-700"
            aria-label="Close timeline dialog"
          >
            <FiX />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              Loading timeline...
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-200 bg-surface-50 p-6 text-center text-sm text-slate-500">
              No timeline events have been recorded for this ticket yet.
            </div>
          ) : (
            <ol className="space-y-4">
              {events.map((event, index) => (
                <li key={event.id || `${event.status}-${event.timestamp}-${index}`} className="relative pl-9">
                  <span className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <FiClock size={13} />
                  </span>
                  {index < events.length - 1 && (
                    <span className="absolute left-3 top-8 h-[calc(100%+0.25rem)] w-px bg-surface-200" />
                  )}
                  <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge status={event.status} size="sm" />
                      <span className="text-xs font-medium text-slate-500">{formatTimelineDate(event.timestamp)}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-900">{event.actor}</p>
                    {event.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.notes}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
