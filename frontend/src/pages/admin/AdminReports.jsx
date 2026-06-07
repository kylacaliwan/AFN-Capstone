import { useEffect, useState, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { api } from '../../api/core';
import { formatDate } from '../../utils/formatDate';
import { formatTechnicianId, formatTicketId } from '../../utils/roleIds';

const convertToCSV = (rows) => {
  if (!rows.length) return '';
  const headers = ['ID', 'Date', 'Client', 'Client(Fullname)', 'Service', 'Priority', 'Status', 'SLA', 'Technician ID', 'Technician Fullname', 'Next Step'];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csvData = rows.map(row => [
    formatTicketId(row.id),
    formatDate(row.created_at),
    row.client,
    row.client_fullname,
    row.service,
    row.priority,
    row.status,
    JSON.stringify(row.sla) || '—',
    formatTechnicianId(row.technician_id),
    row.technician_fullname,
    row.next_step
  ]);
  const csv = [headers.join(','), ...csvData.map(row => row.map(h => escape(h)).join(','))].join('\n');
  return csv;
};

const getPriorityColor = (priority) => {
  switch (priority?.toLowerCase()) {
    case 'high': return 'bg-red-100 text-red-800';
    case 'medium': return 'bg-amber-100 text-amber-800';
    case 'low': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getStatusColor = (status) => {
  switch (normalizeReportValue(status)) {
    case 'completed': return 'bg-green-100 text-green-800';
    case 'in progress': return 'bg-blue-100 text-blue-800';
    case 'not started': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const normalizeReportValue = (value) =>
  String(value || '').trim().replace(/[_-]+/g, ' ').toLowerCase();

export default function AdminReports() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  

  // Filter states
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

const ITEMS_PER_PAGE = 10;
const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchServiceTickets();
  }, []);

  const fetchServiceTickets = async () => {
    try {
      setLoading(true);
      const response = await api.get('/services/service-tickets/report/');
      setTickets(response.data || []);
      setError('');
    } catch (err) {
      setTickets([]);
      setError(err.response?.data?.message || err.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  // Filter tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      // Date range filter
      if (dateFrom && new Date(ticket.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(ticket.created_at) > new Date(dateTo + 'T23:59:59')) return false;

      // Status filter
      if (statusFilter !== 'All' && normalizeReportValue(ticket.status) !== normalizeReportValue(statusFilter)) return false;

      // Priority filter
      if (priorityFilter !== 'All' && normalizeReportValue(ticket.priority) !== normalizeReportValue(priorityFilter)) return false;

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          ticket.client_fullname?.toLowerCase().includes(searchLower) ||
          ticket.service?.toLowerCase().includes(searchLower) ||
          ticket.technician_fullname?.toLowerCase().includes(searchLower) ||
          ticket.next_step?.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [tickets, dateFrom, dateTo, statusFilter, priorityFilter, searchTerm]);

  const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE);

const paginatedTickets = filteredTickets.slice(
  (currentPage - 1) * ITEMS_PER_PAGE,
  currentPage * ITEMS_PER_PAGE
);

  // Calculate summary stats from the same rows shown/exported by the report.
  const summaryStats = useMemo(() => {
    const total = filteredTickets.length;
    const completed = filteredTickets.filter(t => normalizeReportValue(t.status) === 'completed').length;
    const pending = filteredTickets.filter(t => ['not started', 'in progress', 'pending'].includes(normalizeReportValue(t.status))).length;
    const unassigned = filteredTickets.filter(t => !t.technician_id).length;

    return { total, completed, pending, unassigned };
  }, [filteredTickets]);

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setStatusFilter('All');
    setPriorityFilter('All');
    setSearchTerm('');
  };

  const downloadCSV = () => {
    const csv = convertToCSV(filteredTickets);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `service-tickets-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    window.print();
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Summary Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="text-2xl font-bold text-slate-900">{summaryStats.total}</div>
            <div className="text-sm text-slate-600 mt-1">Total Tickets</div>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="text-2xl font-bold text-green-600">{summaryStats.completed}</div>
            <div className="text-sm text-slate-600 mt-1">Completed</div>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="text-2xl font-bold text-blue-600">{summaryStats.pending}</div>
            <div className="text-sm text-slate-600 mt-1">Pending</div>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="text-2xl font-bold text-amber-600">{summaryStats.unassigned}</div>
            <div className="text-sm text-slate-600 mt-1">Unassigned</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[150px_150px_150px_150px_minmax(280px,1fr)_150px] xl:items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All</option>
                <option value="Completed">Completed</option>
                <option value="In Progress">In Progress</option>
                <option value="Not Started">Not Started</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
              <input
                type="text"
                placeholder="Client, service, technician, or next step..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex w-full justify-end gap-3">
            <button
              onClick={printReport}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              Print / PDF
            </button>
            <button
              onClick={downloadCSV}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center">
              <p className="text-slate-600">Loading tickets...</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-600">No service tickets to display.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Client(Fullname)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">SLA</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Technician ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Technician Fullname</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Next Step</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedTickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                        {formatTicketId(ticket.id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        {formatDate(ticket.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        {ticket.client}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        {ticket.client_fullname}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        {ticket.service}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          ticket.sla?.status === 'breached' ? 'bg-red-100 text-red-800' :
                          ticket.sla?.status === 'warning' ? 'bg-amber-100 text-amber-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {ticket.sla?.status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        {formatTechnicianId(ticket.technician_id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        {ticket.technician_fullname}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700">
                          {ticket.next_step}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
  <div className="text-sm text-slate-500">
    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} -
    {Math.min(currentPage * ITEMS_PER_PAGE, filteredTickets.length)}
    of {filteredTickets.length}
  </div>

  <div className="flex items-center gap-2">
    <button
      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
      disabled={currentPage === 1}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
    >
      Previous
    </button>

    <span className="px-3 text-sm font-medium">
      Page {currentPage} of {totalPages}
    </span>

    <button
      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      disabled={currentPage === totalPages}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
    >
      Next
    </button>
  </div>
</div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
