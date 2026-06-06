import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import TicketTimelineModal from '../../components/shared/TicketTimelineModal';
import StatusBadge, { formatStatusLabel } from '../../components/ui/StatusBadge';
import { useTechnicianJobs } from '../../hooks/useTechnicianJobs';
import { FiChevronDown, FiClipboard, FiClock, FiEye, FiMapPin, FiPackage, FiPlus, FiUpload, FiX } from 'react-icons/fi';
import { fetchTicketTimeline } from '../../api/api';
import { formatTicketId } from '../../utils/roleIds';

const formatDateLabel = (value) => {
  if (!value) {
    return 'Schedule pending';
  }

  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return 'Schedule pending';
  }

  return parsedValue.toLocaleDateString();
};

export default function TechnicianJobs() {
  const [timelineJob, setTimelineJob] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const {
    activeJob,
    actionMessage,
    closeJobDetails,
    completionJob,
    completionNotes,
    equipmentDropdownOpen,
    equipmentForm,
    equipmentSubmitting,
    error,
    handleCompleteJob,
    handleImageUpload,
    handleRequestEquipment,
    handleStatusUpdate,
    inventoryItems,
    jobs,
    loadJobs,
    materialUsage,
    openJobDetails,
    proofImages,
    removeImage,
    selectedInventoryItems,
    selectedJob,
    setCompletionJob,
    setCompletionNotes,
    setEquipmentDropdownOpen,
    setEquipmentForm,
    setMaterialUsage,
    setProofImages,
    toggleEquipmentItem,
    updateEquipmentQuantity
  } = useTechnicianJobs();

  const canRequestEquipment = ['not_started', 'in_progress', 'on_hold'].includes(selectedJob?.status);

  const selectedEquipmentLabel = selectedInventoryItems.length
    ? selectedInventoryItems.map((item) => item.name).join(', ')
    : 'Choose equipment';

  const requestAvailabilityLabel = selectedJob?.status === 'not_started'
    ? 'Can request before start'
    : selectedJob?.status === 'on_hold'
      ? 'Can add to hold request'
      : 'Requests go to admin';

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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">My Jobs ({jobs.length})</h2>

      </div>

      {/* Active Job Banner */}
      {activeJob && (
        <div className="mb-6 rounded-xl border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-blue-100 p-4 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Active Now</div>
              <div className="mt-1 text-lg font-bold text-blue-900">
                {formatTicketId(activeJob.ticketId || activeJob.id)} • {activeJob.client?.full_name || activeJob.client}
              </div>
              <div className="mt-1 text-sm text-blue-800">
                {activeJob.service} • <span className="font-semibold">{activeJob.status}</span>
              </div>
            </div>
            <div className="text-right">
              <button
                onClick={() => openJobDetails(activeJob)}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition"
              >
                View Details
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="mb-4 rounded border-l-4 border-green-500 bg-green-100 p-3 text-green-800">
          {actionMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>
      )}

      {jobs.length === 0 ? (
        <div className="py-12 text-center">
          <FiClipboard className="mx-auto mb-4 h-12 w-12 text-slate-400" />
          <h3 className="mb-2 text-lg font-medium text-slate-900">No jobs assigned</h3>
          <p className="text-slate-500">Check back later for new assignments.</p>
        </div>
      ) : (
        <>
          {/* Active / Pending Jobs - max 5 cards */}
          {(() => {
            const activeJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status?.toLowerCase()));
            const displayJobs = activeJobs.slice(0, 5);
            const hiddenCount = activeJobs.length - displayJobs.length;
            if (displayJobs.length === 0) return (
              <div className="mb-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No active jobs at the moment.
              </div>
            );
            return (
              <div className="mb-8">
                <h3 className="mb-3 text-lg font-semibold text-slate-800">
                  Active Jobs ({activeJobs.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {displayJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md flex flex-col"
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-slate-900 line-clamp-1">{job.service}</h3>
                          <p className="text-xs text-slate-600">{formatTicketId(job.ticketId)}</p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>

                      <div className="mb-3 space-y-1 text-xs">
                        <p className="text-slate-700 font-medium truncate">{job.client?.full_name || job.client}</p>
                        <p className="text-slate-500 line-clamp-1">{job.address}</p>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          job.assignmentRole === 'crew'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {job.assignmentRole === 'crew' ? 'Crew' : 'Lead'}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            job.priority === 'High'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {job.priority}
                        </span>
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                          {job.requestSourceLabel}
                        </span>
                      </div>

                      <div className="mb-3 text-xs">
                        <span className="text-slate-500">Scheduled: </span>
                        <span className="text-slate-900 font-medium">{formatDateLabel(job.scheduledDate)}</span>
                      </div>

                      <div className="mt-auto flex flex-col gap-2">
                        {job.status === 'not_started' && (
                          <button
                            onClick={() => handleStatusUpdate(job.id, 'in_progress')}
                            disabled={activeJob && activeJob.id !== job.id}
                            className={`rounded-lg px-3 py-2 text-xs font-medium text-white transition w-full ${
                              activeJob && activeJob.id !== job.id
                                ? 'bg-slate-300 cursor-not-allowed opacity-60'
                                : 'bg-blue-500 hover:bg-blue-600'
                            }`}
                            title={activeJob && activeJob.id !== job.id ? `Complete ${formatTicketId(activeJob.ticketId || activeJob.id)} first` : ''}
                          >
                            {activeJob && activeJob.id !== job.id ? 'Complete Other Job First' : 'Start Job'}
                          </button>
                        )}
                        {job.status === 'on_hold' && (
                          <button
                            onClick={() => handleStatusUpdate(job.id, 'in_progress')}
                            disabled={activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold'}
                            className={`rounded-lg px-3 py-2 text-xs font-medium text-white transition w-full ${
                              activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold'
                                ? 'bg-slate-300 cursor-not-allowed opacity-60'
                                : 'bg-orange-500 hover:bg-orange-600'
                            }`}
                          >
                            {activeJob && activeJob.id !== job.id && activeJob.status !== 'on_hold' ? 'Complete Other Job First' : 'Resume Job'}
                          </button>
                        )}
                        {job.status === 'in_progress' && job.checklistCompleted && (
                          <button
                            onClick={() => setCompletionJob(job)}
                            className="rounded-lg bg-green-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-600 w-full"
                          >
                            Complete (Proof)
                          </button>
                        )}
                        {job.status === 'in_progress' && !job.checklistCompleted && (
                          <Link
                            to={`/technician/checklist?ticketId=${job.ticketId}`}
                            className="flex w-full items-center justify-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-600"
                          >
                            <FiClipboard size={14} /> Complete Checklist First
                          </Link>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openJobDetails(job)}
                            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-slate-200 px-2 py-2 text-xs text-slate-700 hover:bg-slate-300 font-medium"
                          >
                            <FiEye size={14} /> Details
                          </button>
                          <Link
                            to={`/technician/map-navigation?ticketId=${job.ticketId}`}
                            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-500 px-2 py-2 text-xs text-white hover:bg-emerald-600 font-medium"
                          >
                            <FiMapPin size={14} /> Navigate
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {hiddenCount > 0 && (
                  <p className="mt-3 text-center text-sm text-slate-500">
                    + {hiddenCount} more active job{hiddenCount > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Completed Jobs Table */}
          {(() => {
            const completedJobs = jobs.filter(j => ['completed', 'cancelled'].includes(j.status?.toLowerCase()));
            if (completedJobs.length === 0) return null;
            return (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-3">
                  <h3 className="text-lg font-semibold text-slate-800">
                    Completed Jobs ({completedJobs.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Ticket</th>
                        <th className="px-4 py-3">Service</th>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedJobs.map((job) => (
                        <tr key={job.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{formatTicketId(job.ticketId)}</td>
                          <td className="px-4 py-3 text-slate-700">{job.service}</td>
                          <td className="px-4 py-3 text-slate-700">{job.client?.full_name || job.client}</td>
                          <td className="px-4 py-3 text-slate-500">{formatDateLabel(job.scheduledDate)}</td>
                          <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openJobDetails(job)}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              <FiEye size={13} /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{selectedJob.service}</h3>
                <p className="text-slate-600">
                  {formatTicketId(selectedJob.ticketId)} for {selectedJob.client?.full_name || selectedJob.client}
                </p>
              </div>
              <button
                type="button"
                onClick={closeJobDetails}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Status</div>
                <StatusBadge status={selectedJob.status} size="sm" />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Priority</div>
                <div className="text-slate-900">{selectedJob.priority}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Request Source</div>
                <div className="text-slate-900">{selectedJob.requestSourceLabel}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Scheduled Date</div>
                <div className="text-slate-900">
                  {formatDateLabel(selectedJob.scheduledDate)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Address</div>
                <div className="text-slate-900">{selectedJob.address || 'Location pending'}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Lead Technician</div>
                <div className="text-slate-900">{selectedJob.leadTechnician || 'Unassigned'}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Assignment Role</div>
                <div className="text-slate-900">
                  {selectedJob.assignmentRole === 'crew' ? 'Crew Member' : 'Lead Technician'}
                </div>
              </div>
            </div>

            {selectedJob.crewMembers?.length > 0 && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4">
                <div className="mb-1 text-sm font-medium text-emerald-700">Assigned Crew</div>
                <div className="text-sm text-emerald-900">
                  {selectedJob.crewMembers.map((member) => member.name).join(', ')}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FiPackage className="text-blue-500" />
                  Equipment to Bring
                </div>
                {canRequestEquipment && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {requestAvailabilityLabel}
                  </span>
                )}
              </div>
              {selectedJob.inventoryReservations?.length > 0 ? (
                <div className="space-y-2">
                  {selectedJob.inventoryReservations.map((reservation) => (
                    <div
                      key={reservation.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-slate-900">
                          {reservation.itemName} x{reservation.quantity}
                        </div>
                        <div className="text-xs text-slate-500">
                          {reservation.itemSku ? `SKU: ${reservation.itemSku}` : 'No SKU'}
                          {reservation.requiredDate ? ` - Needed: ${formatDateLabel(reservation.requiredDate)}` : ''}
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold capitalize text-blue-800">
                        {reservation.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No reserved equipment has been assigned for this ticket yet.
                </p>
              )}

              {canRequestEquipment ? (
                <form onSubmit={handleRequestEquipment} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <div className="space-y-3">
                    <div className="relative">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Additional equipment</span>
                      <button
                        type="button"
                        onClick={() => setEquipmentDropdownOpen((isOpen) => !isOpen)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                      >
                        <span className={selectedInventoryItems.length ? 'truncate' : 'text-slate-400'}>
                          {selectedEquipmentLabel}
                        </span>
                        <FiChevronDown className="shrink-0 text-slate-400" size={16} />
                      </button>
                      {equipmentDropdownOpen && (
                        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                          {inventoryItems.length === 0 ? (
                            <div className="px-3 py-2 text-slate-500">No available inventory equipment.</div>
                          ) : (
                            inventoryItems.map((item) => {
                              const itemId = String(item.id);
                              const isSelected = equipmentForm.itemIds.includes(itemId);
                              return (
                                <label
                                  key={item.id}
                                  className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleEquipmentItem(itemId)}
                                    className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>
                                    <span className="block font-medium text-slate-800">
                                      {item.name} {item.sku ? `(${item.sku})` : ''}
                                    </span>
                                    <span className="text-xs text-slate-500">{item.availableQuantity} available</span>
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {selectedInventoryItems.length > 0 && (
                      <div className="space-y-2">
                        {selectedInventoryItems.map((item) => {
                          const itemId = String(item.id);
                          return (
                            <div
                              key={item.id}
                              className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_110px_32px]"
                            >
                              <div>
                                <div className="text-sm font-medium text-slate-900">
                                  {item.name} {item.sku ? `(${item.sku})` : ''}
                                </div>
                                <div className="text-xs text-slate-500">{item.availableQuantity} available</div>
                              </div>
                              <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-500">Quantity</span>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.availableQuantity || 1}
                                  value={equipmentForm.quantities[itemId] || 1}
                                  onChange={(event) => updateEquipmentQuantity(itemId, event.target.value)}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => toggleEquipmentItem(itemId)}
                                className="self-end rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title={`Remove ${item.name}`}
                              >
                                <FiX size={16} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={equipmentForm.notes}
                    onChange={(event) => setEquipmentForm((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={2}
                    placeholder="Reason or details for admin"
                    className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={equipmentSubmitting || inventoryItems.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <FiPlus size={16} />
                    {equipmentSubmitting ? 'Sending...' : 'Request Equipment'}
                  </button>
                </form>
              ) : (
                <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
                  Additional equipment can be requested before work starts or while the job is active.
                </p>
              )}
            </div>

            {selectedJob.notes && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="mb-1 text-sm font-medium text-slate-500">Work Notes</div>
                <div className="text-sm text-slate-700">{selectedJob.notes}</div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => openTimeline(selectedJob)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                <FiClock size={16} /> View Timeline
              </button>
              <Link
                to={`/technician/map-navigation?ticketId=${selectedJob.ticketId}`}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
              >
                <FiMapPin size={16} /> Open Navigation
              </Link>
              <Link
                to={`/technician/checklist?ticketId=${selectedJob.ticketId}`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Open Checklist
              </Link>
            </div>
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

      {completionJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Complete Job - Upload Proof</h3>
                <p className="text-slate-600">
                  {formatTicketId(completionJob.ticketId)} for {completionJob.client?.full_name || completionJob.client}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompletionJob(null);
                  setProofImages([]);
                  setCompletionNotes('');
                }}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="space-y-6">
              {/* Proof Images Upload */}
              <div className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-6">
                <label className="block mб-2 text-sm font-semibold text-slate-900">
                  <FiUpload className="mr-2 inline" /> Upload Proof Images (Required)
                </label>
                <p className="mb-4 text-sm text-slate-600">
                  Upload photos showing the completed work as proof of service delivery.
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="mb-4 block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-blue-500 file:px-4 file:py-2 file:text-white hover:file:bg-blue-600"
                />

                {proofImages.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">
                      {proofImages.length} image(s) selected
                    </p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {proofImages.map((img, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={img}
                            alt={`Proof ${idx + 1}`}
                            className="h-24 w-full rounded-lg border border-slate-200 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Completion Notes */}
              <div>
                <label className="block mb-2 text-sm font-semibold text-slate-900">
                  Completion Notes (Optional)
                </label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Describe the work completed, any issues encountered, recommendations for client, etc."
                  className="h-24 w-full rounded-lg border border-slate-300 p-3 text-slate-800 placeholder-slate-400"
                />
              </div>

              {completionJob.inventoryReservations?.filter((reservation) => reservation.status === 'pending').length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">Materials Used</h4>
                    <p className="text-xs text-slate-500">
                      Confirm the quantity actually used. Unused reserved stock will be released.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {completionJob.inventoryReservations
                      .filter((reservation) => reservation.status === 'pending')
                      .map((reservation) => (
                        <div
                          key={reservation.id}
                          className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_120px]"
                        >
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {reservation.itemName} x{reservation.quantity}
                            </div>
                            <div className="text-xs text-slate-500">
                              {reservation.itemSku ? `SKU: ${reservation.itemSku}` : 'No SKU'}
                            </div>
                          </div>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-500">Used</span>
                            <input
                              type="number"
                              min="0"
                              max={reservation.quantity}
                              value={materialUsage[String(reservation.id)] ?? reservation.quantity}
                              onChange={(event) => {
                                const value = Math.min(
                                  reservation.quantity,
                                  Math.max(0, Number(event.target.value || 0))
                                );
                                setMaterialUsage((currentUsage) => ({
                                  ...currentUsage,
                                  [String(reservation.id)]: value
                                }));
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                            />
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {!completionJob.checklistCompleted && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Submit the job checklist before completing this job.
                  <Link
                    to={`/technician/checklist?ticketId=${completionJob.ticketId}`}
                    className="ml-2 font-semibold text-amber-900 underline"
                  >
                    Open checklist
                  </Link>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCompleteJob}
                  disabled={proofImages.length === 0 || !completionJob.checklistCompleted}
                  className={`flex-1 rounded-lg px-6 py-3 font-medium text-white transition ${
                    proofImages.length === 0 || !completionJob.checklistCompleted
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  Complete Job with Proof
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompletionJob(null);
                    setProofImages([]);
                    setCompletionNotes('');
                  }}
                  className="rounded-lg bg-slate-200 px-6 py-3 font-medium text-slate-700 transition hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>

              {proofImages.length === 0 && (
                <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                  ⚠️ At least one proof image is required to complete the job.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
