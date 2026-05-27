import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/ui/StatusBadge';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import { FiMapPin, FiCalendar, FiUser, FiArrowLeft, FiStar, FiImage, FiX, FiClock } from 'react-icons/fi';
import { api, fetchRequestDetail, fetchTicketTimeline, requestTicketReschedule, submitRequestRating } from '../../api/api';
import { getLocalDateInputValue } from '../../utils/date';
import { clientTechnicianDisplayString } from '../../utils/clientTechnicianDisplay';
import { formatTicketId } from '../../utils/roleIds';

const TIME_SLOT_LABELS = {
  morning: 'Morning (8 AM - 11 AM)',
  midday: 'Midday (11 AM - 2 PM)',
  afternoon: 'Afternoon (2 PM - 5 PM)',
  evening: 'Evening (5 PM - 8 PM)'
};

export default function ClientRequestDetail() {
  const { requestId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [proofImages, setProofImages] = useState([]);
  const [loadingProofImages, setLoadingProofImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [notice, setNotice] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const entityType = searchParams.get('entity') || 'request';

  useEffect(() => {
    loadRequest();
  }, [requestId, entityType]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      window.addEventListener('keydown', handleEscKey);
      return () => window.removeEventListener('keydown', handleEscKey);
    }
  }, [selectedImage]);

  const loadRequest = async () => {
    setLoading(true);
    try {
      const data = await fetchRequestDetail(requestId, { entityType });
      setRequest(data);
      setRatingSubmitted(data.client_rating ? true : false);
      setRating(data.client_rating || 0);
      setFeedback(data.client_feedback || '');
      setRescheduleDate(data.preferred_date || data.scheduled_date || '');
      setRescheduleTimeSlot(data.preferred_time_slot || data.scheduled_time_slot || '');
      setRescheduleReason(data.reschedule_reason || data.scheduling_notes || '');
      setError(null);

      // Load proof images if ticket is completed
      if (data.status === 'completed' && data.ticket_id) {
        loadProofImages(data.ticket_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load request details');
    } finally {
      setLoading(false);
    }
  };

  const loadProofImages = async (ticketId) => {
    setLoadingProofImages(true);
    try {
      const response = await api.get(`/services/service-tickets/${ticketId}/proof_images/`);
      setProofImages(response.data.completion_proof_images || []);
    } catch {
      setProofImages([]);
    } finally {
      setLoadingProofImages(false);
    }
  };

  const handleRequestReschedule = async () => {
    setNotice(null);
    if (!request?.ticket_id) {
      setNotice({
        tone: 'warning',
        message: 'This request is still waiting for a linked service ticket before it can be rescheduled.'
      });
      return;
    }

    if (!rescheduleDate || !rescheduleTimeSlot || !rescheduleReason.trim()) {
      setNotice({
        tone: 'warning',
        message: 'Please choose a date, time slot, and reason for the schedule change.'
      });
      return;
    }

    setRescheduleSubmitting(true);
    try {
      await requestTicketReschedule(request.ticket_id, {
        preferred_date: rescheduleDate,
        preferred_time_slot: rescheduleTimeSlot,
        reason: rescheduleReason.trim()
      });
      setShowRescheduleForm(false);
      setNotice({ tone: 'success', message: 'Schedule change request sent.' });
      await loadRequest();
    } catch (err) {
      setNotice({
        tone: 'error',
        message: `Failed to request reschedule: ${err.message}`
      });
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  const handleSubmitRating = async () => {
    setNotice(null);
    if (!request?.ticket_id) {
      setNotice({
        tone: 'warning',
        message: 'Feedback becomes available after a service ticket has been completed.'
      });
      return;
    }

    if (rating === 0) {
      setNotice({ tone: 'warning', message: 'Please select a rating.' });
      return;
    }

    setSubmitting(true);
    try {
      await submitRequestRating(request.ticket_id, {
        rating,
        feedback
      });
      setRatingSubmitted(true);
      setShowRatingForm(false);
      setNotice({ tone: 'success', message: 'Thank you. Your rating was submitted.' });
      // Reload to show updated data
      await loadRequest();
    } catch (err) {
      setNotice({
        tone: 'error',
        message: `Failed to submit rating: ${err.message}`
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openTimeline = async () => {
    if (!request?.ticket_id) return;
    setTimelineOpen(true);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);

    try {
      const events = await fetchTicketTimeline(request.ticket_id);
      setTimelineEvents(events);
    } catch (loadError) {
      setTimelineError(loadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'text-blue-600 bg-blue-50',
      normal: 'text-gray-600 bg-gray-50',
      high: 'text-orange-600 bg-orange-50',
      urgent: 'text-red-600 bg-red-50'
    };
    return colors[priority?.toLowerCase()] || 'text-gray-600 bg-gray-50';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeSlot = (value) => TIME_SLOT_LABELS[value] || value || 'No specific window';

  if (loading) {
    return (
      <Layout>
        <div className="rounded-lg bg-white p-8 shadow-sm text-center">
          <div className="inline-block">
            <div className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-brand-500 animate-spin"></div>
          </div>
          <p className="mt-2 text-slate-600">Loading request details...</p>
        </div>
      </Layout>
    );
  }

  if (error || !request) {
    return (
      <Layout>
        <div className="rounded-lg bg-red-50 p-6 border border-red-200">
          <p className="text-red-700 font-medium mb-4">{error || 'Request not found'}</p>
          <button
            onClick={() => navigate('/client/requests')}
            className="text-red-600 hover:text-red-700 underline"
          >
            Back to requests
          </button>
        </div>
      </Layout>
    );
  }

  const isCompleted = request.status === 'completed';
  const canRequestReschedule = Boolean(request.ticket_id) && request.status !== 'completed' && request.status !== 'cancelled';
  const technicianLabel = clientTechnicianDisplayString(request);
  const noticeClassName = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-800'
  }[notice?.tone || 'warning'];

  return (
    <Layout>
      <div className="space-y-8 pb-8">
        {notice && (
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${noticeClassName}`}>
            {notice.message}
          </div>
        )}

        {/* Header with improved styling */}
        <div className="flex items-start gap-4 mb-8">
          <button
            onClick={() => navigate('/client/requests')}
            className="mt-1 p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            title="Back to requests"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-bold text-slate-900">
                Service Request #{request.request_id || request.id}
              </h1>
              <StatusBadge status={request.status} size="lg" />
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                {request.request_source_label}
              </span>
            </div>
            <p className="text-slate-600">
              {request.service_type_name || request.service_type}
              {request.ticket_id
                ? ` • ${formatTicketId(request.ticket_id)}`
                : request.status === 'pending'
                  ? ' • Pending review'
                  : ' • Awaiting dispatch'}
            </p>
          </div>
        </div>

        {/* Status Section - Enhanced */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 p-6 shadow-sm border border-blue-200">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Status</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={request.status} size="lg" />
                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                  request.priority?.toLowerCase() === 'urgent'
                    ? 'bg-red-100 text-red-700'
                    : request.priority?.toLowerCase() === 'high'
                    ? 'bg-orange-100 text-orange-700'
                    : request.priority?.toLowerCase() === 'low'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {request.priority?.toUpperCase()} PRIORITY
                </span>
              </div>
              {request.operational_status && request.operational_status !== request.status && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-500">Stage:</span>
                  <StatusBadge status={request.operational_status} size="sm" />
                </div>
              )}
            </div>
            {request.progress && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Progress</p>
                <div className="space-y-2">
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 rounded-full"
                      style={{ width: `${request.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{request.progress}% Complete</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column - Details */}
          <div className="space-y-6">
            {/* Service Details */}
            <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Service Details</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Description</p>
                  <p className="text-slate-800">{request.description || 'No description provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Service Type</p>
                  <p className="text-slate-800">{request.service_type_name || request.service_type}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Request Source</p>
                  <p className="text-slate-800">{request.request_source_label}</p>
                </div>
              </div>
            </div>

            {/* Location Details */}
            <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiMapPin className="text-slate-600" />
                Location
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Address</p>
                  <p className="text-slate-800">{request.address || 'Not specified'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">City</p>
                    <p className="text-slate-800">{request.city || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Province</p>
                    <p className="text-slate-800">{request.province || 'N/A'}</p>
                  </div>
                </div>
                {request.latitude && request.longitude && (
                  <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                    Coordinates: {request.latitude.toFixed(4)}, {request.longitude.toFixed(4)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Timeline & Assignment */}
          <div className="space-y-6">
            {/* Timeline */}
            <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiCalendar className="text-slate-600" />
                Timeline
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Requested On</p>
                  <p className="text-slate-800">{formatDate(request.request_date)}</p>
                </div>
                {request.scheduled_date && (
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Scheduled Date</p>
                    <p className="text-slate-800">{formatDate(request.scheduled_date)}</p>
                  </div>
                )}
                {request.scheduled_time_slot && (
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Scheduled Time Window</p>
                    <p className="text-slate-800">{formatTimeSlot(request.scheduled_time_slot)}</p>
                  </div>
                )}
                {(request.preferred_date || request.preferred_time_slot) && (
                  <div className="rounded bg-slate-50 p-3">
                    <p className="text-sm text-slate-600 mb-1">Preferred Appointment</p>
                    <p className="text-slate-800">
                      {request.preferred_date ? formatDate(request.preferred_date) : 'No date selected'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{formatTimeSlot(request.preferred_time_slot)}</p>
                  </div>
                )}
                {request.start_time && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Start Time</p>
                      <p className="text-slate-800">{formatTime(request.start_time)}</p>
                    </div>
                    {request.end_time && (
                      <div>
                        <p className="text-sm text-slate-600 mb-1">End Time</p>
                        <p className="text-slate-800">{formatTime(request.end_time)}</p>
                      </div>
                    )}
                  </div>
                )}
                {request.completed_date && (
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Completed On</p>
                    <p className="text-slate-800 text-green-600">{formatDate(request.completed_date)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Technician Assignment */}
            {technicianLabel && (
              <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <FiUser className="text-slate-600" />
                  Assigned Technician
                </h3>
                <p className="text-slate-800 font-medium">{technicianLabel}</p>
                {request.technician_contact && (
                  <p className="text-slate-600 text-sm mt-2">{request.technician_contact}</p>
                )}
              </div>
            )}

            {!request.ticket_id && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                This request is still in the request queue. Schedule changes and feedback will appear once a service
                ticket is linked.
              </div>
            )}

            {request.ticket_id && (
              <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
                  <FiClock className="text-slate-600" />
                  Service Timeline
                </h3>
                <button
                  type="button"
                  onClick={openTimeline}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View Ticket Timeline
                </button>
              </div>
            )}

            {canRequestReschedule && (
              <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Schedule Changes</h3>
                {request.reschedule_requested ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-medium">A schedule change request is already pending.</p>
                    {request.reschedule_reason && <p className="mt-2">{request.reschedule_reason}</p>}
                  </div>
                ) : !showRescheduleForm ? (
                  <button
                    onClick={() => setShowRescheduleForm(true)}
                    className="w-full px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition"
                  >
                    Request Reschedule
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">New Date</label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          min={getLocalDateInputValue()}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">Time Window</label>
                        <select
                          value={rescheduleTimeSlot}
                          onChange={(e) => setRescheduleTimeSlot(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded"
                        >
                          <option value="">Select time window</option>
                          {Object.entries(TIME_SLOT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">Reason</label>
                      <textarea
                        value={rescheduleReason}
                        onChange={(e) => setRescheduleReason(e.target.value)}
                        rows="3"
                        className="w-full px-3 py-2 border border-slate-300 rounded"
                        placeholder="Tell the team why you need another appointment window."
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRequestReschedule}
                        disabled={rescheduleSubmitting}
                        className="flex-1 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
                      >
                        {rescheduleSubmitting ? 'Submitting...' : 'Send Request'}
                      </button>
                      <button
                        onClick={() => setShowRescheduleForm(false)}
                        className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Warranty Coverage</h3>
              <div className="flex items-center gap-3">
                <StatusBadge status={request.warranty_status} size="sm" />
                {request.warranty_end_date && (
                  <span className="text-sm text-slate-600">Ends {formatDate(request.warranty_end_date)}</span>
                )}
              </div>
              {request.warranty_start_date && (
                <p className="mt-3 text-sm text-slate-600">Coverage started {formatDate(request.warranty_start_date)}</p>
              )}
              {request.warranty_notes && (
                <p className="mt-3 text-sm text-slate-700">{request.warranty_notes}</p>
              )}
            </div>

            {/* Proof Images Section */}
            {isCompleted && request.ticket_id && (
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 p-8 shadow-md border border-slate-200 overflow-hidden">
                {/* Header with Icon */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <FiImage className="text-white" size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Proof of Work</h3>
                    <p className="text-sm text-slate-600 mt-1">Technician-verified completion photos</p>
                  </div>
                </div>

                {loadingProofImages ? (
                  <div className="py-12 text-center">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-white shadow-md mb-4">
                      <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-300 border-t-blue-600"></div>
                    </div>
                    <p className="text-sm text-slate-600 font-medium">Loading proof images...</p>
                  </div>
                ) : proofImages.length > 0 ? (
                  <div className="space-y-5">
                    {/* Image Count Badge */}
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200">
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                        <span className="text-sm font-semibold text-slate-700">
                          {proofImages.length} image{proofImages.length !== 1 ? 's' : ''} verified
                        </span>
                      </span>
                    </div>

                    {/* Image Gallery Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 pt-2">
                      {proofImages.map((imageUrl, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedImage(imageUrl)}
                          className="group relative overflow-hidden rounded-xl bg-white border border-slate-200 hover:border-blue-400 aspect-square shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer transform hover:scale-105"
                        >
                          {imageUrl.toLowerCase().includes('.mp4') || imageUrl.toLowerCase().includes('.webm') ? (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                              <div className="text-center">
                                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-white/10 mb-2">
                                  <span className="text-sm font-semibold text-white">Play</span>
                                </div>
                                <span className="text-xs text-white font-semibold">Video</span>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={imageUrl}
                              alt={`Proof ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              onError={(e) => {
                                e.currentTarget.style.backgroundColor = '#f1f5f9';
                                e.currentTarget.alt = 'Image failed to load';
                              }}
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-3">
                            <span className="text-white text-sm font-semibold">View</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-white shadow-md mb-4">
                      <FiImage className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">No proof images found</p>
                    <p className="text-sm text-slate-500 mt-1">The technician did not upload proof images for this service</p>
                  </div>
                )}

                {/* Full Screen Image Modal */}
                {selectedImage && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
                    <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col">
                      {/* Close Button */}
                      <button
                        onClick={() => setSelectedImage(null)}
                        className="absolute -top-12 right-0 text-white hover:bg-white/20 p-2 rounded-lg transition-colors z-10"
                        title="Close"
                      >
                        <FiX size={28} />
                      </button>

                      {/* Media Container */}
                      <div className="flex-1 flex items-center justify-center overflow-auto bg-black/50 rounded-xl">
                        {selectedImage.toLowerCase().includes('.mp4') || selectedImage.toLowerCase().includes('.webm') ? (
                          <video
                            src={selectedImage}
                            controls
                            className="max-w-full max-h-[80vh] rounded-lg"
                            autoPlay
                          />
                        ) : (
                          <img
                            src={selectedImage}
                            alt="Proof"
                            className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl"
                          />
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between mt-4 px-2">
                        <p className="text-white/80 text-sm">
                          Click outside or press ESC to close
                        </p>
                        <a
                          href={selectedImage}
                          download
                          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rating Section (for completed requests) */}
            {isCompleted && request.ticket_id && (
              <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Rate This Service</h3>

                {ratingSubmitted ? (
                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <p className="text-sm text-green-700 font-medium mb-2">Rating submitted</p>
                    <div className="flex items-center gap-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <FiStar
                          key={i}
                          className={`w-5 h-5 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
                        />
                      ))}
                    </div>
                    {feedback && (
                      <p className="text-sm text-slate-700 mt-2">{feedback}</p>
                    )}
                    <button
                      onClick={() => setShowRatingForm(true)}
                      className="mt-2 text-sm font-medium text-brand-600 hover:underline"
                    >
                      Edit Rating
                    </button>
                  </div>
                ) : (
                  <>
                    {!showRatingForm && (
                      <button
                        onClick={() => setShowRatingForm(true)}
                        className="w-full rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
                      >
                        Leave Feedback
                      </button>
                    )}

                    {showRatingForm && (
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-slate-600 mb-3">How would you rate this service?</p>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setRating(star)}
                                className="transition"
                              >
                                <FiStar
                                  className={`w-8 h-8 ${
                                    star <= rating
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-slate-300 hover:text-yellow-400'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm text-slate-600 mb-2">
                            Additional Feedback (Optional)
                          </label>
                          <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Share your experience..."
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                            rows="3"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleSubmitRating}
                            disabled={submitting || rating === 0}
                            className="flex-1 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting ? 'Submitting...' : 'Submit Rating'}
                          </button>
                          <button
                            onClick={() => {
                              setShowRatingForm(false);
                              setRating(0);
                              setFeedback('');
                            }}
                            className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <TicketTimelineModal
        ticket={timelineOpen ? request : null}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineOpen(false)}
      />
    </Layout>
  );
}
