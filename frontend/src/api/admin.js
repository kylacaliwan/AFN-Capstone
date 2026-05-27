import {
  api,
  buildUserCreatePayload,
  buildUserUpdatePayload,
  getApiErrorMessage,
  normalizeTechnicianStatus,
  normalizeUser
} from './core';

const normalizeTechnicianRecord = (tech) => {
  const skillDetails = Array.isArray(tech?.skill_details)
    ? tech.skill_details.map((skill) => ({
        ...skill,
        service_type: Number(skill?.service_type),
        skill_level: skill?.skill_level || 'intermediate',
      }))
    : [];
  const skillNames = Array.isArray(tech?.skills)
    ? tech.skills
    : skillDetails.map((skill) => skill.service_type_name).filter(Boolean);

  return {
    ...normalizeUser(tech),
    status: normalizeTechnicianStatus(tech),
    skills: skillNames,
    skill: tech?.skill
      ? String(tech.skill).toLowerCase().replace(/\s+/g, '_')
      : (skillNames[0]
          ? String(skillNames[0]).toLowerCase().replace(/\s+/g, '_')
          : ''),
    skillDetails,
  };
};

export const fetchAdminUsers = async () => {
  try {
    const { data } = await api.get('/users/');
    const userArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(userArray) ? userArray.map(normalizeUser) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load users.'));
  }
};

export const createAdminUser = async (userData) => {
  try {
    const payload = buildUserCreatePayload(userData);
    const { data } = await api.post('/admin/users/', payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create user.'));
  }
};

export const updateAdminUser = async (userId, updates) => {
  try {
    const payload = buildUserUpdatePayload(updates);
    const { data } = await api.put(`/admin/users/${userId}/`, payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update user.'));
  }
};

export const deactivateAdminUser = async (userId) => {
  try {
    const { data } = await api.delete(`/admin/users/${userId}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to deactivate user.'));
  }
};

export const fetchAssignableCapabilities = async () => {
  try {
    const { data } = await api.get('/users/available_capabilities/');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load capabilities.'));
  }
};

export const fetchUserCapabilities = async (userId) => {
  try {
    const { data } = await api.get(`/users/${userId}/capabilities/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load user access.'));
  }
};

export const updateUserCapabilities = async (userId, capabilities) => {
  try {
    const payload = {
      capabilities: Array.isArray(capabilities) ? capabilities : []
    };
    const { data } = await api.put(`/users/${userId}/capabilities/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update user access.'));
  }
};

export const fetchAdminClients = async () => {
  try {
    const { data } = await api.get('/admin/clients/');
    const clientArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(clientArray) ? clientArray.map(normalizeUser) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load admin clients.'));
  }
};

export const createAdminClient = async (client) => {
  try {
    const payload = {
      ...buildUserCreatePayload(client),
      role: 'client'
    };
    const { data } = await api.post('/admin/clients/', payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create client.'));
  }
};

export const updateAdminClient = async (id, updates) => {
  try {
    const payload = buildUserUpdatePayload(updates);
    const { data } = await api.put(`/admin/clients/${id}/`, payload);
    return normalizeUser(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update client.'));
  }
};

export const deleteAdminClient = async (id) => {
  try {
    const { data } = await api.delete(`/admin/clients/${id}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete client.'));
  }
};

export const fetchAdminTechnicians = async () => {
  try {
    const { data } = await api.get('/admin/technicians/');
    const techArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(techArray) ? techArray.map(normalizeTechnicianRecord) : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technicians.'));
  }
};

export const fetchAdminTechnician = async (id) => {
  try {
    const { data } = await api.get(`/admin/technicians/${id}/`);
    return normalizeTechnicianRecord(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load technician details.'));
  }
};

export const createAdminTechnician = async (tech) => {
  try {
    const payload = {
      ...buildUserCreatePayload(tech),
      role: 'technician',
      status: tech.status === 'offline' ? 'inactive' : 'active',
      is_available: tech.status === 'available'
    };
    const { data } = await api.post('/admin/technicians/', payload);
    return normalizeTechnicianRecord(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create technician.'));
  }
};

export const updateAdminTechnician = async (id, updates) => {
  try {
    const payload = buildUserUpdatePayload({
      ...updates,
      technicianStatus: updates.status
    });
    const { data } = await api.put(`/admin/technicians/${id}/`, payload);
    return normalizeTechnicianRecord(data);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update technician.'));
  }
};

export const deleteAdminTechnician = async (id) => {
  try {
    const { data } = await api.delete(`/admin/technicians/${id}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete technician.'));
  }
};

export const fetchAdminCalendarEvents = async ({ start, end } = {}) => {
  try {
    const params = {};
    if (start) params.start = start;
    if (end) params.end = end;
    const { data } = await api.get('/admin/calendar/', { params });
    return Array.isArray(data?.events) ? data.events : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load admin calendar.'));
  }
};

export const assignTechnician = async ({ ticketId, technicianId, technicianName, crewIds = [] }) => {
  try {
    let resolvedTechnicianId = technicianId;
    if (!resolvedTechnicianId && technicianName) {
      const technicians = await fetchAdminTechnicians();
      resolvedTechnicianId = technicians.find((tech) => tech.name === technicianName)?.id;
    }
    if (!resolvedTechnicianId) {
      throw new Error('Please select a valid technician.');
    }
    const { data } = await api.post(`/services/service-tickets/${ticketId}/assign/`, {
      technician_id: resolvedTechnicianId,
      crew_ids: Array.isArray(crewIds) ? crewIds : []
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to assign technician.'));
  }
};

export const rescheduleServiceTicket = async (ticketId, schedulingData) => {
  try {
    const payload = {
      scheduled_date: schedulingData.scheduledDate,
      scheduled_time_slot: schedulingData.scheduledTimeSlot || null,
      scheduled_time: schedulingData.scheduledTime || null,
      notes: schedulingData.notes || ''
    };
    const { data } = await api.post(`/services/service-tickets/${ticketId}/reschedule/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to reschedule service ticket.'));
  }
};

export const autoAssignTechnician = async ({ ticketId }) => {
  try {
    const { data } = await api.post(`/services/service-tickets/${ticketId}/auto_assign/`, {});
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to auto-assign technician.'));
  }
};

export const fetchAdminSettings = async () => {
  try {
    const { data } = await api.get('/admin/settings/');
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load admin settings.'));
  }
};

export const updateAdminSettings = async (settings) => {
  try {
    const { data } = await api.put('/admin/settings/', settings);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update admin settings.'));
  }
};

export const fetchSlaRules = async () => {
  try {
    const { data } = await api.get('/services/sla-rules/');
    return Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load SLA rules.'));
  }
};

export const updateSlaRule = async (ruleId, updates) => {
  try {
    const { data } = await api.patch(`/services/sla-rules/${ruleId}/`, updates);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update SLA rule.'));
  }
};

export const fetchActivityLogs = async (filters = {}) => {
  try {
    const params = {};
    if (filters.search) params.search = filters.search;
    if (filters.action) params.action = filters.action;
    if (filters.model) params.model = filters.model;
    if (filters.changedBy) params.changed_by = filters.changedBy;
    if (filters.dateFrom) params.date_from = filters.dateFrom;
    if (filters.dateTo) params.date_to = filters.dateTo;

    const { data } = await api.get('/admin/activity-logs/', { params });
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return rows.map((log) => ({
      id: log.id,
      appLabel: log.app_label,
      model: log.model,
      objectId: log.object_id,
      objectLabel: log.object_label,
      action: log.action,
      fieldName: log.field_name,
      oldValue: log.old_value,
      newValue: log.new_value,
      changedBy: log.changed_by,
      changedByName: log.changed_by_name || 'System',
      changedByRole: log.changed_by_role,
      changedAt: log.changed_at,
      summary: log.summary
    }));
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load activity logs.'));
  }
};

export const fetchServices = async () => {
  try {
    const { data } = await api.get('/admin/services/');
    const serviceArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(serviceArray)
      ? serviceArray.map((service) => ({
          ...service,
          estimated_duration: Number(service?.estimated_duration || 0)
        }))
      : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load services.'));
  }
};

export const createService = async (service) => {
  try {
    const payload = {
      name: String(service.name || '').trim(),
      description: String(service.description || '').trim(),
      estimated_duration: Number(service.estimated_duration || 0),
      estimated_cost: Number(service.estimated_cost || 0),
      max_daily_assignments: Number(service.max_daily_assignments || 1),
      procedures: Array.isArray(service.procedures)
        ? service.procedures
            .map((procedure, index) => ({
              step: index + 1,
              title: String(procedure?.title || '').trim(),
              description: String(procedure?.description || '').trim()
            }))
            .filter((procedure) => procedure.title)
        : [],
      required_equipment: Array.isArray(service.required_equipment)
        ? service.required_equipment
            .map((item) => ({
              name: String(item?.name || '').trim(),
              quantity: Number(item?.quantity || 1)
            }))
            .filter((item) => item.name)
        : []
    };
    const { data } = await api.post('/admin/services/', payload);
    return {
      ...data,
      estimated_duration: Number(data?.estimated_duration || 0)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create service.'));
  }
};

export const updateService = async (id, updates) => {
  try {
    const payload = {
      name: String(updates.name || '').trim(),
      description: String(updates.description || '').trim(),
      estimated_duration: Number(updates.estimated_duration || 0),
      estimated_cost: Number(updates.estimated_cost || 0),
      max_daily_assignments: Number(updates.max_daily_assignments || 1),
      procedures: Array.isArray(updates.procedures)
        ? updates.procedures
            .map((procedure, index) => ({
              step: index + 1,
              title: String(procedure?.title || '').trim(),
              description: String(procedure?.description || '').trim()
            }))
            .filter((procedure) => procedure.title)
        : [],
      required_equipment: Array.isArray(updates.required_equipment)
        ? updates.required_equipment
            .map((item) => ({
              name: String(item?.name || '').trim(),
              quantity: Number(item?.quantity || 1)
            }))
            .filter((item) => item.name)
        : []
    };
    const { data } = await api.put(`/admin/services/${id}/`, payload);
    return {
      ...data,
      estimated_duration: Number(data?.estimated_duration || 0)
    };
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update service.'));
  }
};

export const deleteService = async (id) => {
  try {
    const { data } = await api.delete(`/admin/services/${id}/`);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete service.'));
  }
};

export const fetchAdminAnalytics = async (days = 30) => {
  try {
    const { data } = await api.get('/admin/analytics/', {
      params: { days: Math.max(7, Math.min(365, days)) }
    });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load admin analytics.'));
  }
};

export const fetchInventory = async () => {
  try {
    const { data } = await api.get('/inventory/items/');
    const inventoryArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(inventoryArray) ? inventoryArray : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load inventory.'));
  }
};

export const fetchServiceInventoryRequirements = async () => {
  try {
    const { data } = await api.get('/inventory/service-type-requirements/');
    const requirementArray = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    return Array.isArray(requirementArray) ? requirementArray : [];
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to load service inventory requirements.'));
  }
};

export const createServiceInventoryRequirement = async (requirement) => {
  try {
    const payload = {
      service_type: Number(requirement.service_type),
      item: Number(requirement.item),
      quantity: Number(requirement.quantity || 0),
      auto_reserve: requirement.auto_reserve !== false,
      notes: requirement.notes || ''
    };
    const { data } = await api.post('/inventory/service-type-requirements/', payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to create inventory requirement.'));
  }
};

export const updateServiceInventoryRequirement = async (id, requirement) => {
  try {
    const payload = {
      service_type: Number(requirement.service_type),
      item: Number(requirement.item),
      quantity: Number(requirement.quantity || 0),
      auto_reserve: requirement.auto_reserve !== false,
      notes: requirement.notes || ''
    };
    const { data } = await api.put(`/inventory/service-type-requirements/${id}/`, payload);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to update inventory requirement.'));
  }
};

export const deleteServiceInventoryRequirement = async (id) => {
  try {
    await api.delete(`/inventory/service-type-requirements/${id}/`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Unable to delete inventory requirement.'));
  }
};
