import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiMapPin,
  FiRefreshCw,
  FiUser,
} from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import RescheduleTicketModal from '../../components/shared/RescheduleTicketModal';
import { formatTicketId } from '../../utils/roleIds';
import { fetchAdminCalendarEvents, rescheduleServiceTicket } from '../../api/api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const calendarStatusStyles = {
  pending_approval: {
    label: 'Pending Approval',
    event: 'border-slate-300 bg-slate-50 text-slate-900',
    dot: 'bg-slate-500',
  },
  unassigned: {
    label: 'Approved / Unassigned',
    event: 'border-amber-300 bg-amber-50 text-amber-900',
    dot: 'bg-amber-500',
  },
  missed_dispatch: {
    label: 'Missed Dispatch',
    event: 'border-rose-300 bg-rose-50 text-rose-900',
    dot: 'bg-rose-500',
  },
  scheduled: {
    label: 'Assigned / Scheduled',
    event: 'border-blue-300 bg-blue-50 text-blue-900',
    dot: 'bg-blue-500',
  },
  in_progress: {
    label: 'In Progress',
    event: 'border-violet-300 bg-violet-50 text-violet-900',
    dot: 'bg-violet-500',
  },
  completed: {
    label: 'Completed',
    event: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    event: 'border-rose-300 bg-rose-50 text-rose-900',
    dot: 'bg-rose-500',
  },
  requested: {
    label: 'Requested',
    event: 'border-sky-300 bg-sky-50 text-sky-900',
    dot: 'bg-sky-500',
  },
};

const getStatusStyle = (status) => calendarStatusStyles[status] || calendarStatusStyles.requested;

const getLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getCalendarDays = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const getMonthRange = (monthDate) => {
  const days = getCalendarDays(monthDate);
  return {
    start: getLocalDateKey(days[0]),
    end: getLocalDateKey(days[days.length - 1]),
  };
};

const formatEventTime = (event) => {
  if (event.time) {
    const date = new Date(`1970-01-01T${event.time}`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return event.time;
  }
  return event.time_slot || 'Time TBD';
};

export default function AdminCalendar() {
  const navigate = useNavigate();
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicketEvent, setSelectedTicketEvent] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const monthDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const monthRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = useMemo(() => new Date(), []);

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminCalendarEvents(monthRange);
      setEvents(data);
      setError('');
    } catch (err) {
      setEvents([]);
      setError(err.message || 'Unable to load admin calendar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, [monthRange.start, monthRange.end]);

  const eventsByDay = useMemo(() => {
    const groups = new Map();
    for (const event of events) {
      if (!event.date) continue;
      groups.set(event.date, [...(groups.get(event.date) || []), event]);
    }
    return groups;
  }, [events]);

  const goToPreviousMonth = () => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const goToCurrentMonth = () => {
    setCalendarMonth(new Date());
  };

  const openEvent = (event) => {
    if (event.ticket_id) {
      setSelectedTicketEvent(event);
      setSuccessMessage('');
      return;
    }
    navigate('/admin/service-tickets');
  };

  const handleRescheduleSubmit = async (ticketId, schedulingData) => {
    await rescheduleServiceTicket(ticketId, schedulingData);
    await loadCalendar();
    setSelectedTicketEvent(null);
    setSuccessMessage(`${formatTicketId(ticketId)} schedule updated.`);
  };

  return (
    <Layout>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={loadCalendar}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {successMessage && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {successMessage}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={goToPreviousMonth} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Previous month">
              <FiChevronLeft />
            </button>
            <div className="min-w-48 text-center">
              <h3 className="text-lg font-semibold text-slate-900">{monthLabel}</h3>
              <p className="text-xs text-slate-500">{events.length} calendar event{events.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" onClick={goToNextMonth} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-300 hover:text-blue-600" aria-label="Next month">
              <FiChevronRight />
            </button>
            <button type="button" onClick={goToCurrentMonth} className="ml-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
              Today
            </button>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {Object.entries(calendarStatusStyles).map(([key, style]) => (
              <div key={key} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                {style.label}
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[46rem] md:min-w-0">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-900 text-white">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {monthDays.map((day) => {
                    const key = getLocalDateKey(day);
                    const dayEvents = eventsByDay.get(key) || [];
                    const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                    const isToday = sameDay(day, today);

                    return (
                      <div
                        key={key}
                        className={`min-h-28 border-b border-r border-slate-200 p-1.5 sm:min-h-32 xl:min-h-40 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'}`}
                      >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-blue-500 text-white' : 'text-slate-700'}`}>
                        {day.getDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {dayEvents.map((event) => {
                        const style = getStatusStyle(event.calendar_status);
                        const statusLabel = getStatusStyle(event.calendar_status).label;
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => openEvent(event)}
                            className={`block w-full rounded-md border p-1.5 text-left text-[11px] shadow-sm transition hover:shadow-md ${style.event}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{event.service_type || 'Service'}</p>
                                <p className="truncate text-[10px] opacity-75">{event.client || 'Client'}</p>
                              </div>
                              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                            </div>

                            {event.is_missed_dispatch ? (
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">
                                <FiAlertCircle size={10} />
                                Missed Dispatch
                              </div>
                            ) : event.assignment_status === 'assigned' ? (
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                                <FiCheckCircle size={10} />
                                Assigned
                              </div>
                            ) : (
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                                <FiAlertCircle size={10} />
                                Unassigned
                              </div>
                            )}

                            {event.is_rescheduled && (
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700">
                                <FiRefreshCw size={10} />
                                Rescheduled
                              </div>
                            )}

                            <div className="mt-1 flex items-center gap-1 opacity-80">
                              <FiClock className="shrink-0" size={11} />
                              <span className="truncate">{formatEventTime(event)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 opacity-80">
                              <FiUser className="shrink-0" size={11} />
                              <span className="truncate">
                                {event.assigned_technician || (event.assignment_status === 'unassigned' ? 'No technician assigned' : 'TBD')}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 opacity-80">
                              <FiMapPin className="shrink-0" size={11} />
                              <span className="truncate">{event.location || 'Location pending'}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && events.length === 0 && (
          <div className="border-t border-slate-200 bg-white p-5 text-sm text-slate-500">
            No service appointments in this calendar range yet. New client requests with preferred dates will appear here after submission.
          </div>
        )}
      </section>

      <RescheduleTicketModal
        ticket={selectedTicketEvent}
        onClose={() => setSelectedTicketEvent(null)}
        onSubmit={handleRescheduleSubmit}
      />
    </Layout>
  );
}
