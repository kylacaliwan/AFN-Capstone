import { useEffect, useState } from 'react';
import { FiUser, FiAlertCircle, FiFilter, FiCheckCircle } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/ui/StatusBadge';
import SLABadge, { formatSlaSummary } from '../../components/ui/SLABadge';
import { formatClientId, formatRoleId, formatTechnicianId, formatTicketId } from '../../utils/roleIds';
import {
  assignTechnician,
  autoAssignTechnician,
  fetchAdminTechnicians,
  fetchServiceInventoryRequirements,
  fetchServiceTicketSummary,
  fetchServiceTypes,
  fetchServiceTickets
} from '../../api/api';

const normalizeSkillValue = (value) => String(value || '').toLowerCase().replace(/\s+/g, '_');

const formatAssignedAt = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const technicianMatchesSkill = (technician, filterSkill) => {
  if (filterSkill === 'all') {
    return true;
  }

  const technicianSkills = [
    technician.skill,
    ...(Array.isArray(technician.skills) ? technician.skills : [])
  ]
    .map(normalizeSkillValue)
    .filter(Boolean);

  return technicianSkills.includes(normalizeSkillValue(filterSkill));
};

const technicianMatchesService = (technician, serviceTypeId) => {
  if (!serviceTypeId) {
    return true;
  }

  return Array.isArray(technician.skillDetails) && technician.skillDetails.some((skill) => (
    Number(skill.service_type) === Number(serviceTypeId) ||
    normalizeSkillValue(skill.service_type_name) === 'general_services'
  ));
};

const sortByDispatchUrgency = (firstTicket, secondTicket) => {
  if (firstTicket.isMissedDispatch !== secondTicket.isMissedDispatch) {
    return firstTicket.isMissedDispatch ? -1 : 1;
  }
  return new Date(firstTicket.scheduledDate || 0) - new Date(secondTicket.scheduledDate || 0);
};

export default function AdminDispatchBoard() {
  const [tickets, setTickets] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [materialTemplates, setMaterialTemplates] = useState([]);
  const [filterSkill, setFilterSkill] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);
  const [selectedCrewIds, setSelectedCrewIds] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [assignmentInsight, setAssignmentInsight] = useState('');
  const [ticketSummary, setTicketSummary] = useState(null);

  const loadData = async () => {
    try {
      const [ticketData, technicianData, requirementData, summaryData] = await Promise.all([
        fetchServiceTickets(),
        fetchAdminTechnicians(),
        fetchServiceInventoryRequirements(),
        fetchServiceTicketSummary()
      ]);
      const serviceTypeData = await fetchServiceTypes();
      setTickets(ticketData);
      setTechnicians(technicianData);
      setServiceTypes(serviceTypeData);
      setMaterialTemplates(requirementData);
      setTicketSummary(summaryData);
      setError('');
    } catch (err) {
      setTickets([]);
      setTechnicians([]);
      setServiceTypes([]);
      setMaterialTemplates([]);
      setTicketSummary(null);
      setError(err.message || 'Unable to load dispatch data.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedTicket) {
      setSelectedTech(null);
      setSelectedCrewIds([]);
      return;
    }

    const assignedLead = technicians.find((tech) => tech.id === selectedTicket.assignedTechnicianId) || null;
    setSelectedTech(assignedLead);
    setSelectedCrewIds(
      Array.isArray(selectedTicket.crewMembers)
        ? selectedTicket.crewMembers.map((member) => member.id)
        : []
    );
  }, [selectedTicket, technicians]);

  const selectLeadTechnician = (tech) => {
    setSelectedTech(tech);
    setSelectedCrewIds((currentCrewIds) => currentCrewIds.filter((crewId) => crewId !== tech.id));
  };

  const toggleCrewMember = (techId) => {
    if (selectedTech?.id === techId) {
      return;
    }

    setSelectedCrewIds((currentCrewIds) =>
      currentCrewIds.includes(techId)
        ? currentCrewIds.filter((crewId) => crewId !== techId)
        : [...currentCrewIds, techId]
    );
  };

  const assignTicket = async () => {
    if (!selectedTicket || !selectedTech) {
      setMessage('Select both a ticket and technician');
      return;
    }

    try {
      const selectedCrew = technicians.filter((tech) => selectedCrewIds.includes(tech.id));
      await assignTechnician({
        ticketId: selectedTicket.id,
        technicianId: selectedTech.id,
        crewIds: selectedCrewIds
      });
      await loadData();
      setMessage(
        `${selectedTicket.assignedTechnicianId ? 'Updated assignment for' : 'Assigned'} ${selectedTicket.service} (${formatTicketId(selectedTicket.id)}) to ${selectedTech.name}${
          selectedCrew.length ? ` with crew: ${selectedCrew.map((tech) => tech.name).join(', ')}` : ''
        }.`
      );
      setAssignmentInsight('');
      setSelectedTicket(null);
      setSelectedTech(null);
      setSelectedCrewIds([]);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(err.message || 'Assignment failed.');
    }
  };

  const editAssignment = (ticket) => {
    setSelectedTicket(ticket);
    setMessage('');
    setError('');
    window.setTimeout(() => {
      document.getElementById('assignment-control')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const autoAssignTicket = async () => {
    if (!selectedTicket) {
      setMessage('Select a job before auto-assigning.');
      return;
    }

    try {
      const result = await autoAssignTechnician({ ticketId: selectedTicket.id });
      await loadData();
      setMessage(`Auto-assigned ${formatTicketId(selectedTicket.id)} to ${result.technician?.username || 'technician'}.`);
      setAssignmentInsight(result.assignment_summary || '');
      setSelectedTicket(null);
      setSelectedTech(null);
      setSelectedCrewIds([]);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(err.message || 'Auto-assignment failed.');
      setAssignmentInsight('');
    }
  };

  const dispatchableTickets = tickets
    .filter((ticket) => !ticket.assignedTechnicianId && ['not_started', 'on_hold'].includes(ticket.status))
    .sort(sortByDispatchUrgency);
  const missedDispatchTickets = dispatchableTickets.filter((ticket) => ticket.isMissedDispatch);
  const assignedTickets = tickets
    .filter((ticket) => ticket.assignedTechnicianId && !['completed', 'cancelled'].includes(ticket.status))
    .sort((firstTicket, secondTicket) => new Date(secondTicket.assignedAt || 0) - new Date(firstTicket.assignedAt || 0));
  const skillOptions = [
    { value: 'all', label: 'All Skills' },
    ...serviceTypes.map((serviceType) => ({
      value: `service:${serviceType.id}`,
      label: serviceType.name
    }))
  ];
  const filterServiceTypeId = String(filterSkill).startsWith('service:')
    ? Number(String(filterSkill).replace('service:', ''))
    : null;
  const activeTechnicians = technicians.filter((tech) => tech.active || tech.isAvailable);
  const filteredTechs = activeTechnicians.filter((tech) => (
    filterServiceTypeId
      ? technicianMatchesService(tech, filterServiceTypeId)
      : technicianMatchesSkill(tech, filterSkill)
  ));
  const serviceMatchedTechs = filterSkill === 'all' || filterServiceTypeId
    ? filteredTechs
    : filteredTechs.filter((tech) => technicianMatchesService(tech, selectedTicket?.serviceTypeId));
  const selectedCrew = technicians.filter((tech) => selectedCrewIds.includes(tech.id));
  const selectedServiceMaterials = selectedTicket
    ? materialTemplates.filter((requirement) => Number(requirement.service_type) === Number(selectedTicket.serviceTypeId))
    : [];
  const selectedTicketReservations = Array.isArray(selectedTicket?.inventoryReservations)
    ? selectedTicket.inventoryReservations
    : [];
  const totalTicketsCount = ticketSummary?.totalTickets ?? tickets.length;
  const unassignedActiveCount = ticketSummary?.unassignedActive ?? tickets.filter((ticket) => !ticket.assignedTech && !['completed', 'cancelled'].includes(ticket.status)).length;
  const missedDispatchCount = ticketSummary?.missedDispatch ?? missedDispatchTickets.length;
  const dispatchableCount = ticketSummary?.dispatchable ?? dispatchableTickets.length;
  const assignedActiveCount = ticketSummary?.assignedActive ?? assignedTickets.length;

  return (
    <Layout>
      {message && (
        <div className={`mb-4 rounded-lg border p-3 ${
          message.toLowerCase().includes('failed')
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-green-200 bg-green-50 text-green-800'
        }`}>
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}
      {assignmentInsight && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          {assignmentInsight}
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <FiAlertCircle className="text-red-500" />
            Dispatchable Tickets ({dispatchableTickets.length})
          </h3>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {dispatchableTickets.length > 0 ? (
              dispatchableTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`cursor-pointer rounded-lg border-l-4 p-3 transition ${
                    selectedTicket?.id === ticket.id
                      ? 'border-r border-t border-b border-blue-300 border-l-blue-600 bg-blue-100'
                      : ticket.isMissedDispatch
                        ? 'border-r border-t border-b border-rose-200 border-l-rose-600 bg-rose-50 hover:bg-rose-100'
                        : 'border-r border-t border-b border-slate-200 border-l-orange-500 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold">{formatTicketId(ticket.id)}</div>
                      <div className="font-semibold">{ticket.service}</div>
                      <div className="text-xs text-slate-600">{ticket.clientFullname || ticket.client}</div>
                      <div className="mt-1 w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
                        {ticket.requestSourceLabel}
                      </div>
                      <div className={`mt-2 text-xs ${ticket.isMissedDispatch ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                        {ticket.isMissedDispatch ? 'Missed dispatch: assign now or reschedule' : 'Ready for technician assignment'}
                      </div>
                    </div>
                    <span className={`rounded px-2 py-1 text-xs font-bold ${
                      ticket.isMissedDispatch ? 'bg-rose-200 text-rose-800' :
                      ticket.priority === 'urgent' || ticket.priority === 'high' ? 'bg-red-200 text-red-800' :
                      ticket.priority === 'medium' ? 'bg-orange-200 text-orange-800' :
                      'bg-green-200 text-green-800'
                    }`}>
                      {ticket.isMissedDispatch ? 'MISSED' : ticket.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No dispatchable jobs right now.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <FiUser className="text-green-500" />
            {selectedTicket ? `Technicians for ${selectedTicket.service}` : 'Active Technicians'}
          </h3>
          <div className="mb-3">
            <label className="mb-1 flex items-center gap-1 text-xs font-medium">
              <FiFilter size={14} /> Filter by Skill
            </label>
            <select
              value={filterSkill}
              onChange={(e) => setFilterSkill(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {skillOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {serviceMatchedTechs.length > 0 ? (
              serviceMatchedTechs.map((tech) => (
                <div
                  key={tech.id}
                  className={`rounded-lg border-l-4 p-3 transition ${
                    selectedTech?.id === tech.id
                      ? 'border-r border-t border-b border-blue-300 border-l-blue-600 bg-blue-100'
                      : selectedCrewIds.includes(tech.id)
                        ? 'border-r border-t border-b border-emerald-300 border-l-emerald-600 bg-emerald-50'
                      : 'border-r border-t border-b border-slate-200 border-l-green-500 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{tech.name}</div>
                      <div className="space-y-1 text-xs">
                        <StatusBadge status={tech.technicianStatus || 'available'} size="sm" />
                        <div className="text-slate-600">Skill: {(tech.skill || 'general').replace('_', ' ')}</div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => selectLeadTechnician(tech)}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${
                          selectedTech?.id === tech.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {selectedTech?.id === tech.id ? 'Lead Selected' : 'Set Lead'}
                      </button>
                      {selectedTech?.id !== tech.id && (
                        <button
                          type="button"
                          onClick={() => toggleCrewMember(tech.id)}
                          className={`rounded-md px-3 py-1 text-xs font-semibold ${
                            selectedCrewIds.includes(tech.id)
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          }`}
                        >
                          {selectedCrewIds.includes(tech.id) ? 'Remove Crew' : 'Add Crew'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {tech.isAvailable ? 'Ready for dispatch' : 'Currently occupied or offline from queue work'}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                {selectedTicket ? 'No active technicians are assigned to this service.' : 'No matching active technicians.'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div id="assignment-control" className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-slate-50 p-4 scroll-mt-24">
          <h3 className="mb-4 text-lg font-semibold">Assignment Control</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Job Selected</label>
              {selectedTicket ? (
                <div className="rounded border-2 border-blue-400 bg-white p-2">
                  <div className="font-bold text-blue-900">{formatTicketId(selectedTicket.id)} {selectedTicket.service}</div>
                  <div className="mt-1 text-xs text-slate-600">Client: {selectedTicket.client}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Current lead: {selectedTicket.assignedTech || 'Unassigned'}
                  </div>
                  {selectedTicket.assignedTechnicianId && (
                    <div className="mt-1 text-xs font-medium text-blue-700">
                      Editing existing assignment. Choose a new lead or adjust crew, then confirm.
                    </div>
                  )}
                  <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    <div className="font-semibold text-slate-800">Service-linked materials</div>
                    {selectedServiceMaterials.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {selectedServiceMaterials.map((requirement) => (
                          <div key={requirement.id} className="flex justify-between gap-3">
                            <span>{requirement.item_name}</span>
                            <span className="font-medium">need {requirement.quantity}, available {requirement.available_quantity}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1">No auto-reserved materials configured for this service.</div>
                    )}
                  </div>
                  {selectedTicketReservations.length > 0 && (
                    <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                      <div className="font-semibold">Current ticket material reservations</div>
                      <div className="mt-1">
                        {selectedTicketReservations.map((reservation) => (
                          `${reservation.item_name} x${reservation.quantity} (${reservation.status})`
                        )).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-500">
                  Select a job from the list
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Technician Selected</label>
              {selectedTech ? (
                <div className="rounded border-2 border-green-400 bg-white p-2">
                  <div className="font-bold text-green-900">{selectedTech.name}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Skill: {(selectedTech.skill || 'general').replace('_', ' ')}
                  </div>
                </div>
              ) : (
                <div className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-500">
                  Select a technician from the list
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Crew Members</label>
              {selectedCrew.length > 0 ? (
                <div className="rounded border-2 border-emerald-300 bg-white p-2 text-sm text-slate-700">
                  {selectedCrew.map((tech) => tech.name).join(', ')}
                </div>
              ) : (
                <div className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-500">
                  No extra crew selected
                </div>
              )}
            </div>
            <button
              onClick={assignTicket}
              disabled={!selectedTicket || !selectedTech}
              className={`w-full rounded-lg py-2 font-semibold text-white transition ${
                selectedTicket && selectedTech
                  ? 'cursor-pointer bg-blue-600 hover:bg-blue-700'
                  : 'cursor-not-allowed bg-slate-300'
              }`}
            >
              {selectedTicket?.assignedTechnicianId ? 'Update Technician Assignment' : 'Confirm Dispatch Assignment'}
            </button>
            <button
              onClick={autoAssignTicket}
              disabled={!selectedTicket}
              className={`w-full rounded-lg py-2 font-semibold transition ${
                selectedTicket
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'cursor-not-allowed bg-slate-200 text-slate-500'
              }`}
            >
              Auto-Assign Nearest Match
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 p-4">
          <h3 className="mb-4 text-lg font-semibold">Dispatch Stats</h3>
          <div className="space-y-2">
            <div className="flex justify-between rounded border border-slate-200 bg-white p-2">
              <span className="font-medium">Total Service Tickets</span>
              <span className="text-lg font-bold text-blue-600">{totalTicketsCount}</span>
            </div>
            <div className="flex justify-between rounded border border-slate-200 bg-white p-2">
              <span className="font-medium">Unassigned Active Tickets</span>
              <span className="text-lg font-bold text-red-600">{unassignedActiveCount}</span>
            </div>
            <div className="flex justify-between rounded border border-slate-200 bg-white p-2">
              <span className="font-medium">Missed Dispatch</span>
              <span className="text-lg font-bold text-rose-600">{missedDispatchCount}</span>
            </div>
            <div className="flex justify-between rounded border border-slate-200 bg-white p-2">
              <span className="font-medium">Ready for Dispatch Tickets</span>
              <span className="text-lg font-bold text-blue-600">{dispatchableCount}</span>
            </div>
            <div className="flex justify-between rounded border border-slate-200 bg-white p-2">
              <span className="font-medium">Assigned Active Tickets</span>
              <span className="text-lg font-bold text-emerald-600">{assignedActiveCount}</span>
            </div>
            <div className="flex justify-between rounded border border-slate-200 bg-white p-2">
              <span className="font-medium">Matching Active Technicians</span>
              <span className="text-lg font-bold text-green-600">{serviceMatchedTechs.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <FiCheckCircle className="text-emerald-500" />
            Assigned Tickets ({assignedTickets.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Ticket</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Service / Client</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned To</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned By</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned Time</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Timing</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Crew</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {assignedTickets.length > 0 ? (
                assignedTickets.map((ticket, index) => (
                  <tr
                    key={ticket.id}
                    className={`border-b border-slate-100 ${
                      selectedTicket?.id === ticket.id
                        ? 'bg-blue-50'
                        : index % 2 === 1
                          ? 'bg-slate-50/60'
                          : ''
                    }`}
                  >
                    <td className="px-3 py-3 font-bold text-blue-700">{formatTicketId(ticket.id)}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{ticket.service}</div>
                      <div className="text-xs text-slate-500">
                        Client {formatClientId(ticket.clientId)} - {ticket.clientFullname || ticket.client}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-sky-700">{ticket.requestSourceLabel}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{ticket.technicianFullname || ticket.assignedTech}</div>
                      <div className="text-xs text-slate-500">Technician {formatTechnicianId(ticket.assignedTechnicianId)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{ticket.assignedByName || 'System'}</div>
                      <div className="text-xs text-slate-500">
                        {ticket.assignedById
                          ? `${ticket.assignedByRole || 'admin'} ${formatRoleId(ticket.assignedByRole || 'admin', ticket.assignedById)}`
                          : 'Auto or legacy assignment'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatAssignedAt(ticket.assignedAt)}</td>
                    <td className="px-3 py-3"><StatusBadge status={ticket.status} size="sm" /></td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[180px] flex-col gap-1.5">
                        <SLABadge sla={ticket.sla} size="sm" />
                        <span className="text-xs text-slate-500">{formatSlaSummary(ticket.sla)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{ticket.crewMembers?.length ? ticket.crewSummary : '-'}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => editAssignment(ticket)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Edit Assignment
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">
                    No assigned tickets yet. Confirm a dispatch assignment to move a ticket into this table.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
