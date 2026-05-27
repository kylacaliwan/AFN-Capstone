import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { MapContainer, TileLayer, Circle, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiDownload,
  FiFileText,
  FiImage,
  FiMap,
  FiMapPin,
  FiRefreshCw,
  FiSearch,
} from 'react-icons/fi';
import { fetchCompletedJobsHistory, fetchServiceTypes } from '../../api/api';
import {
  CALABARZON_BOUNDS,
  CALABARZON_CENTER,
  CALABARZON_MIN_ZOOM,
  MAP_ATTRIBUTION,
  MAP_TILE_URL
} from '../../utils/mapRegion';
import { formatTicketId } from '../../utils/roleIds';

const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const priorityTone = {
  Urgent: 'bg-red-100 text-red-800 ring-red-200',
  High: 'bg-orange-100 text-orange-800 ring-orange-200',
  Normal: 'bg-slate-100 text-slate-700 ring-slate-200',
  Low: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

const getHeatmapColor = (count, max) => {
  const intensity = max > 0 ? count / max : 0;
  if (intensity > 0.8) return '#dc2626';
  if (intensity > 0.6) return '#ea580c';
  if (intensity > 0.4) return '#ca8a04';
  if (intensity > 0.2) return '#16a34a';
  return '#22c55e';
};

const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function FlyTo({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    map.setMaxBounds(CALABARZON_BOUNDS);
    map.options.maxBoundsViscosity = 1.0;
    map.setMinZoom(CALABARZON_MIN_ZOOM);

    if (center) {
      map.flyTo(center, zoom || 14, { duration: 0.8 });
    }
  }, [center, zoom, map]);

  return null;
}

function FitBounds({ points, trigger }) {
  const map = useMap();

  useEffect(() => {
    map.setMaxBounds(CALABARZON_BOUNDS);
    map.options.maxBoundsViscosity = 1.0;
    map.setMinZoom(CALABARZON_MIN_ZOOM);

    const boundedPoints = Array.isArray(points)
      ? points.filter((point) => CALABARZON_BOUNDS.contains(point))
      : [];

    if (boundedPoints.length === 0) {
      map.setView(CALABARZON_CENTER, CALABARZON_MIN_ZOOM);
      return;
    }

    if (boundedPoints.length === 1) {
      map.setView(boundedPoints[0], 13);
      return;
    }
    map.fitBounds(boundedPoints, { padding: [40, 40], maxZoom: 13 });
  }, [map, points, trigger]);

  return null;
}

function ChecklistDetail({ inspection }) {
  if (!inspection) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No inspection checklist was submitted for this job.
      </div>
    );
  }

  const boolBadge = (value, yesLabel = 'Yes', noLabel = 'No') =>
    value ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        <FiCheckCircle size={12} /> {yesLabel}
      </span>
    ) : (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{noLabel}</span>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Site Assessment</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Site Accessible</span>
            {boolBadge(inspection.site_accessible)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Electrical Available</span>
            {boolBadge(inspection.electrical_available)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Electrical Adequate</span>
            {boolBadge(inspection.electrical_adequate)}
          </div>
          {inspection.roof_condition ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Roof Condition</span>
              <span className="font-medium text-slate-800">{inspection.roof_condition}</span>
            </div>
          ) : null}
          {inspection.recommendation ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Recommendation</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  inspection.recommendation === 'Approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : inspection.recommendation === 'Rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {inspection.recommendation}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Safety & Compliance</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Safety Equipment</span>
            {boolBadge(inspection.safety_equipment_present, 'Present', 'Missing')}
          </div>
          {inspection.safety_hazards ? (
            <div>
              <span className="text-slate-600">Hazards</span>
              <p className="mt-1 rounded bg-red-50 p-2 text-xs text-red-700">{inspection.safety_hazards}</p>
            </div>
          ) : null}
          {inspection.structural_assessment ? (
            <div>
              <span className="text-slate-600">Structural</span>
              <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-600">{inspection.structural_assessment}</p>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Checklist Completed</span>
            {boolBadge(inspection.is_completed, 'Complete', 'Incomplete')}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Maintenance & Warranty</h5>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Maintenance Required</span>
            {boolBadge(inspection.maintenance_required)}
          </div>
          {inspection.maintenance_required && inspection.maintenance_profile ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Profile</span>
              <span className="font-medium capitalize text-slate-800">{inspection.maintenance_profile.replace('_', ' ')}</span>
            </div>
          ) : null}
          {inspection.maintenance_required && inspection.maintenance_interval_days ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Interval</span>
              <span className="font-medium text-slate-800">{inspection.maintenance_interval_days} days</span>
            </div>
          ) : null}
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Warranty Provided</span>
              {boolBadge(inspection.warranty_provided)}
            </div>
          </div>
          {inspection.warranty_provided && inspection.warranty_period_days ? (
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Warranty Period</span>
              <span className="font-medium text-slate-800">{inspection.warranty_period_days} days</span>
            </div>
          ) : null}
        </div>
      </div>

      {inspection.follow_up_required ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 md:col-span-2 xl:col-span-3">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-600">After-Sales Handoff</h5>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold capitalize text-amber-900">
              {(inspection.follow_up_case_type || '').replace('_', ' ')}
            </span>
            {inspection.follow_up_due_date ? (
              <span className="text-amber-800">Due: {formatDate(inspection.follow_up_due_date)}</span>
            ) : null}
          </div>
          {inspection.follow_up_summary ? (
            <p className="mt-2 text-sm text-amber-900">{inspection.follow_up_summary}</p>
          ) : null}
        </div>
      ) : null}

      {inspection.proof_media_count > 0 ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 md:col-span-2 xl:col-span-3">
          <FiImage className="text-blue-500" />
          <span>{inspection.proof_media_count} proof media file{inspection.proof_media_count > 1 ? 's' : ''} attached</span>
        </div>
      ) : null}

      {inspection.additional_notes ? (
        <div className="md:col-span-2 xl:col-span-3">
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{inspection.additional_notes}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminJobHistory() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [sortField, setSortField] = useState('completed_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [daysFilter, setDaysFilter] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [mapFitTrigger, setMapFitTrigger] = useState(0);
  const searchTimeout = useRef(null);
  const hasLoadedOnce = useRef(false);

  const loadData = async () => {
    setLoading(true);

    try {
      const filters = {};
      if (daysFilter) filters.days = daysFilter;
      if (serviceTypeFilter) filters.serviceType = serviceTypeFilter;
      if (clientFilter) filters.client = clientFilter;
      if (technicianFilter) filters.technician = technicianFilter;
      if (search.trim()) filters.search = search.trim();

      const result = await fetchCompletedJobsHistory(filters);
      setData(result);
      setError('');
    } catch (loadError) {
      setData(null);
      setError(loadError.message || 'Unable to load job history.');
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchServiceTypes().then(setServiceTypes).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, daysFilter, serviceTypeFilter, clientFilter, technicianFilter]);

  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (!hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
      loadData();
      return () => clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      loadData();
    }, 400);

    return () => clearTimeout(searchTimeout.current);
  }, [search, daysFilter, serviceTypeFilter, clientFilter, technicianFilter]);

  const jobs = data?.results || [];

  const sortedJobs = useMemo(() => {
    const getSortValue = (job) => {
      switch (sortField) {
        case 'ticket_id':
          return Number(job.ticket_id || job.id || 0);
        case 'client':
          return String(job.client || '').toLowerCase();
        case 'service_type':
          return String(job.service_type || '').toLowerCase();
        case 'technician':
          return String(job.technician || '').toLowerCase();
        case 'location':
          return `${job.city || ''} ${job.address || ''}`.trim().toLowerCase();
        case 'client_rating':
          return Number(job.client_rating || 0);
        case 'completed_date':
        default:
          return new Date(job.completed_date || job.scheduled_date || 0).getTime();
      }
    };

    return [...jobs].sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);

      if (leftValue === rightValue) return 0;

      const result = leftValue > rightValue ? 1 : -1;
      return sortDirection === 'asc' ? result : -result;
    });
  }, [jobs, sortDirection, sortField]);

  const totalJobs = sortedJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalJobs / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const paginatedJobs = sortedJobs.slice(pageStartIndex, pageStartIndex + pageSize);
  const selectedJob = sortedJobs.find((job) => job.id === selectedJobId) || null;

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

  useEffect(() => {
    if (!sortedJobs.length) {
      setSelectedJobId(null);
      setFlyTarget(null);
      return;
    }

    if (!selectedJobId || !sortedJobs.some((job) => job.id === selectedJobId)) {
      const firstJob = sortedJobs[0];
      setSelectedJobId(firstJob.id);
      if (
        firstJob.latitude !== null &&
        firstJob.latitude !== undefined &&
        firstJob.longitude !== null &&
        firstJob.longitude !== undefined &&
        CALABARZON_BOUNDS.contains([firstJob.latitude, firstJob.longitude])
      ) {
        setFlyTarget([firstJob.latitude, firstJob.longitude]);
      } else {
        setFlyTarget(null);
      }
    }
  }, [selectedJobId, sortedJobs]);

  const heatmapData = useMemo(() => {
    const density = {};

    for (const job of sortedJobs) {
      if (job.latitude === null || job.latitude === undefined || job.longitude === null || job.longitude === undefined) continue;
      if (!CALABARZON_BOUNDS.contains([job.latitude, job.longitude])) continue;

      const key = `${job.latitude.toFixed(4)},${job.longitude.toFixed(4)}`;
      if (!density[key]) {
        density[key] = {
          lat: job.latitude,
          lng: job.longitude,
          count: 0,
          services: new Set(),
          address: job.address,
        };
      }

      density[key].count += 1;
      density[key].services.add(job.service_type);
    }

    return Object.values(density).map((point) => ({
      ...point,
      services: [...point.services],
    }));
  }, [sortedJobs]);

  const mappedJobCount = heatmapData.reduce((total, point) => total + point.count, 0);
  const unmappedJobs = sortedJobs.filter((job) => (
    job.latitude === null ||
    job.latitude === undefined ||
    job.longitude === null ||
    job.longitude === undefined ||
    !CALABARZON_BOUNDS.contains([job.latitude, job.longitude])
  ));
  const duplicateLocationCount = Math.max(0, mappedJobCount - heatmapData.length);
  const maxDensity = heatmapData.length ? Math.max(...heatmapData.map((point) => point.count)) : 0;
  const mapPoints = useMemo(() => heatmapData.map((point) => [point.lat, point.lng]), [heatmapData]);
  const mapCenter = flyTarget
    ? flyTarget
    : heatmapData.length
      ? [heatmapData[0].lat, heatmapData[0].lng]
      : CALABARZON_CENTER;

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDirection(field === 'completed_date' || field === 'ticket_id' || field === 'client_rating' ? 'desc' : 'asc');
  };

  const handleRowClick = (job) => {
    setSelectedJobId(job.id);

    if (
      job.latitude !== null &&
      job.latitude !== undefined &&
      job.longitude !== null &&
      job.longitude !== undefined &&
      CALABARZON_BOUNDS.contains([job.latitude, job.longitude])
    ) {
      setFlyTarget([job.latitude, job.longitude]);
    } else {
      setFlyTarget(null);
    }
  };

  const handleExportCsv = () => {
    if (!sortedJobs.length) return;

    const rows = [
      [
        'Ticket ID',
        'Completed Date',
        'Client',
        'Technician',
        'Service',
        'Priority',
        'Rating',
        'Address',
        'City',
        'Province',
        'Checklist',
        'Warranty',
        'Completion Notes',
      ].map(escapeCsvValue).join(','),
      ...sortedJobs.map((job) => [
        job.ticket_id || job.id,
        job.completed_date || job.scheduled_date || '',
        job.client || '',
        job.technician || '',
        job.service_type || '',
        job.priority || '',
        job.client_rating ?? '',
        job.address || '',
        job.city || '',
        job.province || '',
        job.inspection ? 'Yes' : 'No',
        job.inspection?.warranty_provided ? 'Yes' : 'No',
        job.completion_notes || '',
      ].map(escapeCsvValue).join(',')),
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `completed-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <FiChevronDown className="text-slate-300" size={14} />;
    }

    return sortDirection === 'asc'
      ? <FiChevronUp className="text-slate-500" size={14} />
      : <FiChevronDown className="text-slate-500" size={14} />;
  };

  return (
    <Layout>
      <section className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200">Service Intelligence</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl lg:text-4xl">Job History &amp; Heatmap</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/70 sm:text-base">
              Review completed jobs in a table built for large history views, then inspect the selected checklist and service location on the map.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            <FiRefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">Completed Jobs</p>
          <p className="mt-1.5 text-3xl font-bold text-slate-800">{data?.total ?? '-'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">Mapped Locations</p>
          <p className="mt-1.5 text-3xl font-bold text-blue-600">{heatmapData.length}</p>
          <p className="mt-1 text-xs text-slate-500">{mappedJobCount} mapped job{mappedJobCount === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">Service Types</p>
          <p className="mt-1.5 text-3xl font-bold text-purple-600">{data?.service_types_served ?? '-'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">With Checklist</p>
          <p className="mt-1.5 text-3xl font-bold text-emerald-600">{data?.jobs_with_checklist ?? '-'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[13px] font-medium text-slate-500">With Warranty</p>
          <p className="mt-1.5 text-3xl font-bold text-amber-600">{data?.jobs_with_warranty ?? '-'}</p>
        </div>
      </section>

      <section className="mt-5 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search client, technician, address, service..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
        <select
          value={daysFilter}
          onChange={(event) => setDaysFilter(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="">All Time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="180">Last 6 months</option>
          <option value="365">Last year</option>
        </select>
        <select
          value={serviceTypeFilter}
          onChange={(event) => setServiceTypeFilter(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="">All Services</option>
          {serviceTypes.map((serviceType) => (
            <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>
          ))}
        </select>
        <select
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="">All Clients</option>
          {(data?.client_options || []).map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
        <select
          value={technicianFilter}
          onChange={(event) => setTechnicianFilter(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="">All Technicians</option>
          {(data?.technician_options || []).map((technician) => (
            <option key={technician.id} value={technician.id}>{technician.name}</option>
          ))}
        </select>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FiFileText className="text-sky-500" /> Completed Jobs
                </h2>
                <p className="text-sm text-slate-500">Paginated table view built to stay useful even when the history grows large.</p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!sortedJobs.length}
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiDownload className="mr-2" /> Export CSV
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
            </div>
          ) : !totalJobs ? (
            <div className="px-6 py-16 text-center">
              <FiFileText className="mx-auto mb-4 text-slate-300" size={48} />
              <p className="text-lg font-semibold text-slate-600">No completed jobs found</p>
              <p className="mt-1 text-sm text-slate-400">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:px-5">
                <div className="text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{pageStartIndex + 1}-{Math.min(pageStartIndex + pageSize, totalJobs)}</span> of <span className="font-semibold text-slate-900">{totalJobs}</span> jobs
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-slate-500">
                    Rows
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    >
                      {[25, 50, 100, 250].map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </label>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                    {selectedJob ? `Selected ${formatTicketId(selectedJob.ticket_id)}` : 'No row selected'}
                  </span>
                </div>
              </div>

              <div className="max-h-[34rem] overflow-auto">
                <table className="min-w-full table-fixed text-sm">
                  <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_0_#e2e8f0]">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="w-24 px-4 py-3 sm:px-5">
                        <button type="button" onClick={() => handleSort('ticket_id')} className="inline-flex items-center gap-1">
                          Ticket {renderSortIcon('ticket_id')}
                        </button>
                      </th>
                      <th className="w-32 px-4 py-3">
                        <button type="button" onClick={() => handleSort('completed_date')} className="inline-flex items-center gap-1">
                          Completed {renderSortIcon('completed_date')}
                        </button>
                      </th>
                      <th className="min-w-[12rem] px-4 py-3">
                        <button type="button" onClick={() => handleSort('client')} className="inline-flex items-center gap-1">
                          Client {renderSortIcon('client')}
                        </button>
                      </th>
                      <th className="min-w-[13rem] px-4 py-3">
                        <button type="button" onClick={() => handleSort('service_type')} className="inline-flex items-center gap-1">
                          Service {renderSortIcon('service_type')}
                        </button>
                      </th>
                      <th className="min-w-[11rem] px-4 py-3">
                        <button type="button" onClick={() => handleSort('technician')} className="inline-flex items-center gap-1">
                          Technician {renderSortIcon('technician')}
                        </button>
                      </th>
                      <th className="min-w-[14rem] px-4 py-3">
                        <button type="button" onClick={() => handleSort('location')} className="inline-flex items-center gap-1">
                          Location {renderSortIcon('location')}
                        </button>
                      </th>
                      <th className="w-24 px-4 py-3">Checklist</th>
                      <th className="w-20 px-4 py-3">
                        <button type="button" onClick={() => handleSort('client_rating')} className="inline-flex items-center gap-1">
                          Rating {renderSortIcon('client_rating')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedJobs.map((job, index) => {
                      const isSelected = selectedJob?.id === job.id;
                      const hasLocation =
                        job.latitude !== null && job.latitude !== undefined && job.longitude !== null && job.longitude !== undefined;

                      return (
                        <tr
                          key={job.id}
                          onClick={() => handleRowClick(job)}
                          className={`cursor-pointer border-b border-slate-200 transition ${
                            isSelected
                              ? 'bg-sky-50'
                              : index % 2 === 0
                                ? 'bg-white hover:bg-slate-50'
                                : 'bg-slate-50/40 hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold text-sky-700 sm:px-5">{formatTicketId(job.ticket_id)}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div className="flex items-center gap-2">
                              <FiClock className="text-slate-400" size={13} />
                              <span>{formatDate(job.completed_date || job.scheduled_date)}</span>
                            </div>
                          </td>
                          <td className="truncate px-4 py-3 text-slate-800">{job.client}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${priorityTone[job.priority] || priorityTone.Normal}`}>
                                {job.priority}
                              </span>
                              <span className="truncate text-slate-700">{job.service_type}</span>
                            </div>
                          </td>
                          <td className="truncate px-4 py-3 text-slate-700">{job.technician}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div className="flex items-center gap-2">
                              {hasLocation ? <FiMapPin className="shrink-0 text-blue-400" size={13} /> : null}
                              <span className="truncate">{job.address || 'No address'}{job.city ? `, ${job.city}` : ''}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {job.inspection ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                <FiCheckCircle size={11} /> Yes
                              </span>
                            ) : (
                              <span className="text-slate-400">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{job.client_rating ? `${job.client_rating}/5` : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm sm:px-5">
                <div className="text-slate-500">
                  Page <span className="font-semibold text-slate-900">{currentPage}</span> of <span className="font-semibold text-slate-900">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Selected Job Details</h3>
                    <p className="mt-1 text-sm text-slate-500">Review the checklist and completion notes for the selected row.</p>
                  </div>
                  {selectedJob ? (
                    <div className="flex flex-wrap gap-2 text-sm">
                      {selectedJob.client_rating ? (
                        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                          Rating {selectedJob.client_rating}/5
                        </span>
                      ) : null}
                      {selectedJob.completion_proof_images?.length > 0 ? (
                        <span className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                          <FiImage size={12} /> {selectedJob.completion_proof_images.length} proof image{selectedJob.completion_proof_images.length > 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {selectedJob ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Ticket</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatTicketId(selectedJob.ticket_id)}</p>
                        <p className="mt-1 text-sm text-slate-600">{selectedJob.service_type}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Client & Technician</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{selectedJob.client}</p>
                        <p className="mt-1 text-sm text-slate-600">{selectedJob.technician}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Completed</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatDate(selectedJob.completed_date || selectedJob.scheduled_date)}</p>
                        <p className="mt-1 text-sm text-slate-600">{selectedJob.priority} priority</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Location</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{selectedJob.address || 'No address'}</p>
                        <p className="mt-1 text-sm text-slate-600">{[selectedJob.city, selectedJob.province].filter(Boolean).join(', ') || 'No city/province set'}</p>
                      </div>
                    </div>

                    {selectedJob.completion_notes ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <span className="font-medium text-slate-800">Completion notes: </span>
                        {selectedJob.completion_notes}
                      </div>
                    ) : null}

                    <ChecklistDetail inspection={selectedJob.inspection} />
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    Select a completed job row to inspect its details.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FiMap className="text-blue-500" /> Service Location Heatmap
                </h2>
                <p className="text-sm text-slate-500">
                  {mappedJobCount} of {totalJobs} completed job{totalJobs === 1 ? '' : 's'} mapped across {heatmapData.length} location{heatmapData.length === 1 ? '' : 's'}.
                </p>
                {(unmappedJobs.length > 0 || duplicateLocationCount > 0) && (
                  <p className="mt-1 text-xs text-amber-700">
                    {unmappedJobs.length > 0 ? `${unmappedJobs.length} job${unmappedJobs.length === 1 ? '' : 's'} missing usable coordinates. ` : ''}
                    {duplicateLocationCount > 0 ? `${duplicateLocationCount} job${duplicateLocationCount === 1 ? '' : 's'} share a mapped location.` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFlyTarget(null);
                  setMapFitTrigger((current) => current + 1);
                }}
                disabled={mapPoints.length === 0}
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiMapPin className="mr-2" /> Center map
              </button>
            </div>
          </div>

          {unmappedJobs.length > 0 && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Missing map coordinates: {unmappedJobs.slice(0, 4).map((job) => formatTicketId(job.ticket_id || job.id)).join(', ')}
              {unmappedJobs.length > 4 ? ` and ${unmappedJobs.length - 4} more` : ''}.
            </div>
          )}

          <div className="h-[60vh] min-h-[400px]">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
              </div>
            ) : (
              <MapContainer
                center={mapCenter}
                zoom={11}
                minZoom={CALABARZON_MIN_ZOOM}
                maxBounds={CALABARZON_BOUNDS}
                maxBoundsViscosity={1.0}
                className="h-full w-full"
                key="job-history-map"
              >
                <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                <FlyTo center={flyTarget} zoom={14} />
                {!flyTarget ? <FitBounds points={mapPoints} trigger={mapFitTrigger} /> : null}

                {heatmapData.map((point, index) => (
                  <Circle
                    key={`heatmap-${index}`}
                    center={[point.lat, point.lng]}
                    radius={Math.max(200, Math.min(500, point.count * 100))}
                    pathOptions={{
                      color: getHeatmapColor(point.count, maxDensity),
                      fillColor: getHeatmapColor(point.count, maxDensity),
                      fillOpacity: 0.55,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-center">
                        <strong>{point.count} completed job{point.count > 1 ? 's' : ''}</strong>
                        <br />
                        <small>{point.address}</small>
                        <br />
                        <small className="text-slate-500">Services: {point.services.join(', ')}</small>
                      </div>
                    </Popup>
                  </Circle>
                ))}
              </MapContainer>
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-600" />
                <span>High (80%+)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-orange-600" />
                <span>Medium-High</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-yellow-600" />
                <span>Medium</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-green-600" />
                <span>Low</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
