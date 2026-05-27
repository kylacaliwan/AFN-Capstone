import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import { fetchTechnicianHistory, fetchTicketTimeline } from '../../api/api';
import { FiDownload, FiEye, FiFileText, FiImage, FiMessageSquare, FiShield, FiStar, FiTool } from 'react-icons/fi';
import { formatTicketId } from '../../utils/roleIds';

const formatDate = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : 'Not scheduled';

const formatStatusLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getProofImages = (job) =>
  job.completionProofImages || job.completion_proof_images || [];

const buildHistoryReport = (job) => `AFN Technician Job Report
Ticket: ${formatTicketId(job.ticketId)}
Client: ${job.client?.full_name || job.client}
Service: ${job.service}
Completed: ${formatDate(job.scheduledDate)}
Priority: ${job.priority || 'Normal'}
Address: ${job.address || 'Not provided'}
Warranty: ${formatStatusLabel(job.warrantyStatus || job.warranty_status || 'not_applicable')}
Next Maintenance: ${job.maintenanceSchedule?.next_due_date ? formatDate(job.maintenanceSchedule.next_due_date) : 'Not scheduled'}

Notes:
${job.completionNotes || job.completion_notes || job.notes || 'No notes captured for this completed job.'}
`;

export default function TechnicianJobHistory() {
  const { user } = useAuth();
  const techName = user?.username || '';
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  const [timelineJob, setTimelineJob] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const data = await fetchTechnicianHistory(techName);
    setHistory(data);
    setLoading(false);
  };

  const downloadHistoryReport = (job) => {
    const reportBlob = new Blob([buildHistoryReport(job)], { type: 'text/plain;charset=utf-8' });
    const reportUrl = URL.createObjectURL(reportBlob);
    const link = document.createElement('a');
    link.href = reportUrl;
    link.download = `ticket-${job.ticketId}-report.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(reportUrl);
  };

  const openTimeline = async (job) => {
    setTimelineJob(job);
    setTimelineEvents([]);
    setTimelineError('');
    setTimelineLoading(true);
    try {
      const events = await fetchTicketTimeline(job.ticketId || job.id);
      setTimelineEvents(events);
    } catch (loadError) {
      setTimelineError(loadError.message || 'Unable to load ticket timeline.');
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <Layout>
      <div className="card mb-4 flex items-center justify-between p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Job History</h2>
          <p className="mt-1 text-sm text-slate-500">Review completed work and download service reports.</p>
        </div>
        <button
          onClick={loadHistory}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
        >
          <FiDownload /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-slate-400"></div>
          <p className="text-slate-500">Loading history...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <FiFileText className="mx-auto mb-6 h-16 w-16 text-slate-400" />
          <h3 className="mb-3 text-xl font-semibold text-slate-900">No completed jobs yet</h3>
          <p className="mx-auto mb-8 max-w-md text-slate-600">
            Your completed service history will appear here. Check My Jobs for current work.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {history.map((job) => (
            <div
              key={job.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-card-hover"
            >
              {/* Status Badge */}
              <div className="mb-3">
                <div className="inline-block rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  COMPLETED
                </div>
              </div>

              {/* Service Type */}
              <div className="mb-2">
                <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                  {job.service}
                </span>
              </div>

              {/* Client Name */}
              <h3 className="mb-3 text-lg font-bold text-slate-900 line-clamp-2">{job.client?.full_name || job.client}</h3>

              {/* Ticket Info */}
              <div className="mb-3 space-y-2 text-sm">
                <div>
                  <span className="text-slate-500 text-xs">Ticket ID</span>
                  <div className="font-semibold text-slate-900">{formatTicketId(job.ticketId)}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Completed</span>
                  <div className="font-semibold text-slate-900">{formatDate(job.scheduledDate)}</div>
                </div>
                {job.priority && (
                  <div>
                    <span className="text-slate-500 text-xs">Priority</span>
                    <div
                      className={`rounded-full px-2 py-1 text-xs font-semibold w-max ${
                        job.priority === 'High'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {job.priority}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              {job.notes && (
                <div className="mb-3 rounded-lg border-l-4 border-green-400 bg-green-50 p-2 flex-1">
                  <span className="block text-xs leading-relaxed text-green-700 line-clamp-2">{job.notes}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-auto flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedJob(job)}
                  className="flex items-center justify-center gap-1 rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-600"
                >
                  <FiEye size={14} /> Details
                </button>
                <button
                  type="button"
                  onClick={() => openTimeline(job)}
                  className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700 text-xs hover:bg-slate-200 transition-colors"
                >
                  <FiMessageSquare size={14} /> Timeline
                </button>
                {getProofImages(job).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setImageViewer(job)}
                    className="flex items-center justify-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 font-medium text-white text-xs hover:bg-emerald-600 transition-colors"
                  >
                    <FiImage size={14} /> Photos ({getProofImages(job).length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadHistoryReport(job)}
                  className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700 text-xs hover:bg-slate-200 transition-colors"
                >
                  <FiDownload size={14} /> Report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="card p-5 md:col-span-2">
          <h4 className="mb-4 text-lg font-semibold text-slate-900">Performance Summary</h4>
          <p className="leading-relaxed text-slate-600">
            {history.length > 0
              ? `Completed ${history.length} jobs across ${new Set(history.map((entry) => entry.service)).size} service types. Your work history demonstrates consistent quality.`
              : 'Your performance metrics will appear here as you complete more jobs.'}
          </p>
        </div>
        <div className="card p-5">
          <h4 className="mb-4 text-center text-lg font-semibold">Total Jobs</h4>
          <div className="text-center text-3xl font-bold text-slate-900">{history.length}</div>
        </div>
      </div>

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{selectedJob.service}</h3>
                <p className="text-slate-600">
                  {formatTicketId(selectedJob.ticketId)} for {selectedJob.client?.full_name || selectedJob.client}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Completed Date</div>
                <div className="text-slate-900">{formatDate(selectedJob.scheduledDate)}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Priority</div>
                <div className="text-slate-900">{selectedJob.priority || 'Normal'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-sm font-medium text-slate-500">Address</div>
                <div className="text-slate-900">{selectedJob.address || 'No address recorded.'}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="mb-1 text-sm font-medium text-slate-500">Completion Notes</div>
              <div className="text-sm text-slate-700">
                {selectedJob.completionNotes || selectedJob.completion_notes || selectedJob.notes || 'No notes were captured for this completed job.'}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FiShield className="text-blue-500" /> Warranty
                </div>
                <p className="text-sm text-slate-700">
                  {formatStatusLabel(selectedJob.warrantyStatus || selectedJob.warranty_status || 'not_applicable')}
                </p>
                {(selectedJob.warrantyEndDate || selectedJob.warranty_end_date) && (
                  <p className="mt-1 text-xs text-slate-500">
                    Ends {formatDate(selectedJob.warrantyEndDate || selectedJob.warranty_end_date)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FiTool className="text-emerald-500" /> Maintenance
                </div>
                <p className="text-sm text-slate-700">
                  {selectedJob.maintenanceSchedule?.next_due_date
                    ? formatDate(selectedJob.maintenanceSchedule.next_due_date)
                    : 'Not scheduled'}
                </p>
                {selectedJob.maintenanceSchedule?.status && (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatStatusLabel(selectedJob.maintenanceSchedule.status)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FiStar className="text-yellow-500" /> Client Rating
                </div>
                <p className="text-sm text-slate-700">
                  {selectedJob.clientRating ? `${selectedJob.clientRating}/5` : 'Not yet rated'}
                </p>
              </div>
            </div>

            {(selectedJob.inspection || selectedJob.afterSalesCases?.length > 0) && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {selectedJob.inspection && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Checklist Result</div>
                    <p className="text-sm text-slate-700">
                      {selectedJob.inspection.is_completed ? 'Completed' : 'Not completed'}
                    </p>
                    {selectedJob.inspection.additional_notes && (
                      <p className="mt-2 text-sm text-slate-600">{selectedJob.inspection.additional_notes}</p>
                    )}
                  </div>
                )}
                {selectedJob.afterSalesCases?.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FiMessageSquare className="text-blue-500" /> After-Sales
                    </div>
                    <div className="space-y-2">
                      {selectedJob.afterSalesCases.map((caseItem) => (
                        <div key={caseItem.id} className="rounded-lg bg-white p-2 text-sm">
                          <p className="font-medium text-slate-900">{caseItem.summary}</p>
                          <p className="text-xs text-slate-500">
                            {formatStatusLabel(caseItem.case_type)} - {formatStatusLabel(caseItem.status)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6">
              <button
                type="button"
                onClick={() => downloadHistoryReport(selectedJob)}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Download This Report
              </button>
            </div>
          </div>
        </div>
      )}

      {imageViewer && getProofImages(imageViewer).length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Proof Images</h3>
                <p className="text-slate-600">
                  {formatTicketId(imageViewer.ticketId)} - {imageViewer.client?.full_name || imageViewer.client}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImageViewer(null)}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {getProofImages(imageViewer).map((image, idx) => (
                <div
                  key={idx}
                  className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                >
                  <img
                    src={image}
                    alt={`Proof ${idx + 1}`}
                    className="h-48 w-full object-cover hover:scale-105 transition"
                  />
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-slate-900 to-transparent p-3 opacity-0 hover:opacity-100 transition">
                    <span className="text-sm font-medium text-white">Image {idx + 1}</span>
                  </div>
                </div>
              ))}
            </div>

            {(imageViewer.completionNotes || imageViewer.completion_notes) && (
              <div className="mt-6 rounded-xl border-l-4 border-blue-500 bg-blue-50 p-4">
                <h4 className="mb-2 font-semibold text-blue-900">Work Notes</h4>
                <p className="text-sm text-blue-800">
                  {imageViewer.completionNotes || imageViewer.completion_notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <TicketTimelineModal
        ticket={timelineJob}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelineJob(null)}
      />
    </Layout>
  );
}
