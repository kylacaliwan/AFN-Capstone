import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { FiCalendar, FiEye, FiImage, FiMapPin, FiMessageSquare, FiShield, FiStar, FiTool, FiUser } from 'react-icons/fi';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import { fetchClientRequests, fetchTicketTimeline } from '../../api/api';
import { clientTechnicianDisplayOrDash } from '../../utils/clientTechnicianDisplay';

export default function ClientServiceHistory() {
  const [history, setHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('all'); // all, completed, rated, pending_rating
  const [sortBy, setSortBy] = useState('recent'); // recent, oldest, highest_rating
  const [timelineService, setTimelineService] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadServiceHistory();
  }, []);

  useEffect(() => {
    filterAndSortHistory();
  }, [history, filterType, sortBy]);

  const loadServiceHistory = async () => {
    setLoading(true);
    try {
      const data = await fetchClientRequests();
      // Filter to show completed services
      const completedServices = data.filter(req => req.status === 'completed');
      setHistory(completedServices);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load service history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortHistory = () => {
    let filtered = history;

    // Apply filter
    if (filterType === 'rated') {
      filtered = filtered.filter(h => h.client_rating !== null && h.client_rating !== undefined);
    } else if (filterType === 'pending_rating') {
      filtered = filtered.filter(h => h.client_rating === null || h.client_rating === undefined);
    }

    // Apply sort
    if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.completed_date) - new Date(b.completed_date));
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.completed_date) - new Date(a.completed_date));
    } else if (sortBy === 'highest_rating') {
      filtered.sort((a, b) => (b.client_rating || 0) - (a.client_rating || 0));
    }

    setFilteredHistory(filtered);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderRating = (rating) => {
    if (rating === null || rating === undefined) {
      return <span className="text-sm text-slate-500">Not yet rated</span>;
    }
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <FiStar
            key={i}
            size={16}
            className={i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}
          />
        ))}
        <span className="ml-2 text-sm font-medium">{rating}/5</span>
      </div>
    );
  };

  const formatStatusLabel = (value) =>
    String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const getProofCount = (service) =>
    (service.completion_proof_images?.length || 0) + (service.proof_media?.length || 0);

  const openTimeline = async (service) => {
    if (!service.ticket_id) {
      return;
    }

    setTimelineService(service);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);
    try {
      const events = await fetchTicketTimeline(service.ticket_id);
      setTimelineEvents(events);
    } catch (loadError) {
      setTimelineError(loadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-500"></div>
            <p className="mt-4 text-slate-600">Loading service history...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Filters and Sort */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {/* Filter Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Filter</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">All Services</option>
              <option value="rated">Rated Services</option>
              <option value="pending_rating">Pending Rating</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="highest_rating">Highest Rated</option>
            </select>
          </div>

          {/* Stats */}
          <div className="col-span-1 md:col-span-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{history.length}</p>
                <p className="text-xs text-blue-700">Completed Services</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {history.filter(h => h.client_rating).length}
                </p>
                <p className="text-xs text-green-700">Rated Services</p>
              </div>
            </div>
          </div>
        </div>

{/* Service History Table */}
{filteredHistory.length === 0 ? (
  <div className="rounded-lg border-2 border-dashed border-slate-300 p-12 text-center">
    <p className="text-slate-500">No completed services yet</p>
  </div>
) : (
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full table-fixed divide-y divide-slate-200 overflow-y-scroll">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 w-60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Service
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Technician
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Address
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completed
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rating
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Warranty
            </th>
            <th className="px-2 py-3 w-20 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              Proof
            </th>
            <th className="px-8 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white">
          {filteredHistory.map((service) => (
            <tr key={service.id} className="hover:bg-slate-50">
              <td className="px-4 py-4">
                <div>
                  <p className="font-medium text-slate-900">
                    {service.service_type_name || service.service_type}
                  </p>

                  {service.description && (
                    <p className="mt-1 max-w-xs truncate text-sm text-slate-500">
                      {service.description}
                    </p>
                  )}
                </div>
              </td>

              <td className="px-4 py-4 text-sm text-slate-700">
                {clientTechnicianDisplayOrDash(service)}
              </td>

              <td className="px-4 py-4">
                <div className="max-w-xs truncate text-sm text-slate-700">
                  {service.address || '-'}
                </div>
              </td>

              <td className="px-4 py-4 text-sm text-slate-700">
                {formatDate(service.completed_date)}
              </td>

              <td className="px-4 py-4">
                {service.client_rating ? (
                  <div className="flex items-center gap-1">
                    {[...Array(service.client_rating)].map((_, i) => (
                      <FiStar
                        key={i}
                        size={14}
                        className="fill-yellow-400 text-yellow-400"
                      />
                    ))}
                    <span className="ml-1 text-sm font-medium">
                      {service.client_rating}/5
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">
                    Not Rated
                  </span>
                )}
              </td>

              <td className="px-4 py-4">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    service.warranty_status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {formatStatusLabel(
                    service.warranty_status || 'not_applicable'
                  )}
                </span>

                {service.warranty_end_date && (
                  <p className="mt-1 text-xs text-slate-500">
                    Until {formatDate(service.warranty_end_date)}
                  </p>
                )}
              </td>

              <td className="px-4 py-4 text-sm text-center text-slate-700">
                {getProofCount(service)}
              </td>

              <td className="px-4 py-4">
                <div className="flex flex-col justify-center gap-2">
                  {service.ticket_id && (
                    <button
                      onClick={() => openTimeline(service)}
                      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      History
                    </button>
                  )}

                  {!service.client_rating && (
                    <button
                      onClick={() =>
                        navigate(
                          `/client/requests/${service.id}?entity=request`
                        )
                      }
                      className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600"
                    >
                      Rate
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
      </div>
      <TicketTimelineModal
        ticket={timelineService}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineService(null)}
      />
    </Layout>
  );
}
