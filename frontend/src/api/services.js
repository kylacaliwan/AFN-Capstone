import { api, getApiErrorMessage, normalizeSla, normalizeTicket } from './core';

const normalizeCoordinateValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return numericValue.toFixed(6);
};

const normalizeCoordinatePayload = (payload) => ({
  ...payload,
  latitude: normalizeCoordinateValue(payload.latitude),
  longitude: normalizeCoordinateValue(payload.longitude),
  lat: normalizeCoordinateValue(payload.lat),
  lng: normalizeCoordinateValue(payload.lng),
});

export const fetchNavigationRoute = async (techLat, techLng, jobLat, jobLng) => {
  try {
    const start = `${techLng},${techLat}`;
    const end = `${jobLng},${jobLat}`;
    const { data } = await api.get('/services/ors/route/', { params: { start, end } });

    if (!data?.features || data.features.length === 0) {
      throw new Error('No route found');
    }

    const feature = data.features[0];
    const geometry = feature?.geometry;
    const properties = feature?.properties;
    const coords = geometry?.coordinates || [];
    const routeCoords = coords.map(([lng, lat]) => [lat, lng]);

    const segments = properties?.segments || [{}];
    const primarySegment = segments[0];

    let directions = [];
    if (primarySegment.steps) {
      directions = primarySegment.steps.map((step) => ({
        instruction: step.instruction || 'Continue',
        distance: step.distance || 0,
        duration: step.duration || 0,
        type: step.type || 0,
        modifier: step.modifier || ''
      }));
    }

    const distanceKm = primarySegment.distance
      ? Number((primarySegment.distance / 1000).toFixed(1))
      : 0;
    const estimatedTimeMin = primarySegment.duration
      ? Math.round(primarySegment.duration / 60)
      : 0;

    return {
      distanceKm,
      estimatedTimeMin,
      routeCoords,
      directions
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load navigation route.'));
  }
};

export const fetchDashboardStats = async (role) => {
  try {
    const { data } = await api.get('/dashboard/stats/', { params: { role } });
    const slaQueue = Array.isArray(data?.sla_queue)
      ? data.sla_queue.map((item) => ({
          ...item,
          sla: normalizeSla(item?.sla)
        }))
      : [];

    return {
      ...data,
      sla_queue: slaQueue
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load dashboard statistics.'));
  }
};

export const updateTechnicianLocation = async ({ techName, lat, lng, accuracy }) => {
  try {
    const { data } = await api.post('/services/technician/location/', {
      latitude: lat,
      longitude: lng,
      accuracy
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update technician location.'));
  }
};

export const fetchServiceTickets = async (filters = {}) => {
  try {
    const params = {};
    if (filters.workspace) {
      params.workspace = filters.workspace;
    }

    const { data } = await api.get('/services/service-tickets/', { params });
    const ticketArray = Array.isArray(data) ? data : (data.results || []);
    return ticketArray.map(normalizeTicket);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service tickets.'));
  }
};

export const fetchServiceTicketSummary = async (filters = {}) => {
  try {
    const params = {};
    if (filters.workspace) {
      params.workspace = filters.workspace;
    }

    const { data } = await api.get('/services/service-tickets/summary/', { params });
    return {
      totalTickets: Number(data?.total_tickets || 0),
      activeQueue: Number(data?.active_queue || 0),
      completed: Number(data?.completed || 0),
      cancelled: Number(data?.cancelled || 0),
      unassignedActive: Number(data?.unassigned_active || 0),
      dispatchable: Number(data?.dispatchable || 0),
      assignedActive: Number(data?.assigned_active || 0),
      missedDispatch: Number(data?.missed_dispatch || 0),
      slaWarning: Number(data?.sla_warning || 0),
      slaOverdue: Number(data?.sla_overdue || 0),
      slaRisk: Number(data?.sla_risk || 0)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service ticket summary.'));
  }
};

export const fetchTicketTimeline = async (ticketId) => {
  try {
    const { data } = await api.get('/services/status-history/', { params: { ticket: ticketId } });
    const events = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return events
      .map((event) => ({
        id: event.id,
        ticketId: event.ticket,
        status: event.status,
        actor: event.changed_by_name || 'System',
        actorId: event.changed_by || null,
        notes: event.notes || '',
        timestamp: event.timestamp
      }))
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0));
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load ticket timeline.'));
  }
};

export const fetchServiceTypes = async () => {
  try {
    const { data } = await api.get('/services/service-types/');
    const serviceTypes = Array.isArray(data) ? data : (data.results || []);
    return Array.isArray(serviceTypes) ? serviceTypes : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service types.'));
  }
};

export const createServiceRequest = async (requestData) => {
  try {
    const payload = normalizeCoordinatePayload(requestData);
    const { data } = await api.post('/services/service-requests/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create service request.'));
  }
};

export const searchLocations = async ({ query, viewbox, bounded = true, limit = 5 }) => {
  try {
    const params = {
      q: query,
      limit
    };
    if (viewbox) params.viewbox = viewbox;
    if (bounded) params.bounded = '1';
    const { data } = await api.get('/geocode/search/', { params });
    return Array.isArray(data?.results) ? data.results : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to search locations.'));
  }
};

export const reverseGeocodeLocation = async ({ lat, lng }) => {
  try {
    const { data } = await api.get('/geocode/reverse/', { params: { lat, lon: lng } });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to read the selected location.'));
  }
};

export const fetchCoverageHeatmap = async (filters = {}) => {
  try {
    const params = {};
    if (filters.client) params.client = filters.client;
    if (filters.technician) params.technician = filters.technician;
    if (filters.serviceType) params.service_type = filters.serviceType;
    const { data } = await api.get('/services/coverage-heatmap/service_density/', { params });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load coverage heatmap.'));
  }
};

export const fetchFollowUpCases = async (filters = {}) => {
  try {
    const params = {};

    if (filters.status) {
      params.status = filters.status;
    }
    if (filters.caseType) {
      params.case_type = filters.caseType;
    }
    if (filters.assignedOnly) {
      params.assigned_only = 'true';
    }
    if (filters.priority) {
      params.priority = filters.priority;
    }
    if (filters.creationSource) {
      params.creation_source = filters.creationSource;
    }
    if (filters.search) {
      params.search = filters.search;
    }
    if (filters.ordering) {
      params.ordering = filters.ordering;
    }

    const { data } = await api.get('/services/follow-up-cases/', { params });
    const caseArray = Array.isArray(data) ? data : (data.results || []);
    return Array.isArray(caseArray) ? caseArray : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load follow-up cases.'));
  }
};

export const approveServiceRequest = async (requestId) => {
  try {
    const { data } = await api.post(`/services/service-requests/${requestId}/approve/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to approve service request.'));
  }
};

export const createFollowUpCase = async (caseData) => {
  try {
    const { data } = await api.post('/services/follow-up-cases/', caseData);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create follow-up case.'));
  }
};

export const updateFollowUpCase = async (caseId, updates) => {
  try {
    const { data } = await api.patch(`/services/follow-up-cases/${caseId}/`, updates);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update follow-up case.'));
  }
};

export const fetchTechnicianCoverage = async (filters = {}) => {
  try {
    const params = {};
    if (filters.technician) params.technician = filters.technician;
    const { data } = await api.get('/services/coverage-heatmap/technician_coverage/', { params });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician coverage.'));
  }
};

export const fetchCompletedJobsHistory = async (filters = {}) => {
  try {
    const params = {};
    if (filters.days) params.days = filters.days;
    if (filters.serviceType) params.service_type = filters.serviceType;
    if (filters.client) params.client = filters.client;
    if (filters.technician) params.technician = filters.technician;
    if (filters.search) params.search = filters.search;

    const { data } = await api.get('/services/coverage-heatmap/completed_jobs/', { params });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load completed job history.'));
  }
};

export const fetchTrackingData = async () => {
  try {
    const { data } = await api.get('/tracking/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load tracking data.'));
  }
};

export const getGoogleMapsUrl = ({ lat, lng, zoom = 14 }) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&zoom=${zoom}`;
