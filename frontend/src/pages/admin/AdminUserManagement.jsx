import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  api,
  createAdminClient,
  createAdminTechnician,
  createAdminUser,
  deactivateAdminUser,
  deleteAdminClient,
  deleteAdminTechnician,
  fetchAdminTechnician,
  fetchAdminUsers,
  fetchAssignableCapabilities,
  fetchUserCapabilities,
  updateAdminClient,
  updateAdminTechnician,
  updateAdminUser,
  updateUserCapabilities
} from '../../api/api';
import {
  CAPABILITIES,
  TECHNICIAN_ACCESS_CAPABILITIES,
  USER_DIRECTORY_CAPABILITIES,
  canReceiveDelegatedAuthority,
  canManageStaffAccess,
  canManageStaffTargetRole,
  hasAnyCapability
} from '../../rbac';
import { formatRoleId } from '../../utils/roleIds';

const ROLE_SECTIONS = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'admin', label: 'Administrators' },
  { value: 'technician', label: 'Technicians' },
  { value: 'client', label: 'Clients' }
];
const CREATE_ROLE_SECTIONS = ROLE_SECTIONS.filter((section) => section.value !== 'superadmin');
const TECH_CAP_SET = new Set(TECHNICIAN_ACCESS_CAPABILITIES);
const ACCESS_AREA_DEFINITIONS = [
  {
    roles: ['admin', 'superadmin'],
    label: 'Dashboard',
    capabilities: [CAPABILITIES.supervisorDashboardView, CAPABILITIES.afterSalesDashboardView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Tickets',
    capabilities: [CAPABILITIES.supervisorTicketsView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Dispatch',
    capabilities: [CAPABILITIES.supervisorDispatchView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Tracking',
    capabilities: [CAPABILITIES.supervisorTrackingView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'After Sales',
    capabilities: [
      CAPABILITIES.afterSalesDashboardView,
      CAPABILITIES.afterSalesCasesView,
      CAPABILITIES.afterSalesCasesManage
    ]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Job History',
    capabilities: [CAPABILITIES.adminJobHistoryView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'User Directory',
    capabilities: [CAPABILITIES.userDirectoryView]
  },
  {
    roles: ['admin', 'superadmin'],
    label: 'Access Control',
    capabilities: [CAPABILITIES.manageStaffCapabilities]
  },
  {
    roles: ['technician'],
    label: 'Dashboard',
    capabilities: [CAPABILITIES.technicianDashboardView]
  },
  {
    roles: ['technician'],
    label: 'Jobs',
    capabilities: [CAPABILITIES.technicianJobsView]
  },
  {
    roles: ['technician'],
    label: 'Schedule',
    capabilities: [CAPABILITIES.technicianScheduleView]
  },
  {
    roles: ['technician'],
    label: 'Navigation',
    capabilities: [CAPABILITIES.technicianNavigationView]
  },
  {
    roles: ['technician'],
    label: 'Checklist',
    capabilities: [CAPABILITIES.technicianChecklistView]
  },
  {
    roles: ['technician'],
    label: 'Messages',
    capabilities: [CAPABILITIES.technicianMessagesView]
  },
  {
    roles: ['technician'],
    label: 'History',
    capabilities: [CAPABILITIES.technicianHistoryView]
  },
  {
    roles: ['technician'],
    label: 'Profile',
    capabilities: [CAPABILITIES.technicianProfileView]
  }
];
const inputClass = 'rounded-xl border p-2';
const panelClass = 'rounded-2xl bg-white p-6 shadow-sm';
const emptyCreate = { username: '', name: '', role: 'technician', email: '', phone: '', address: '', status: 'available', password: '', passwordConfirm: '' };
const emptyEdit = { name: '', email: '', phone: '', address: '', status: 'available', lat: '', lng: '', skills: [] };
const emptySkillEntry = { service_type: '', skill_level: 'intermediate' };
const SKILL_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'expert', label: 'Expert' }
];

const getRoleLabel = (role) => ROLE_SECTIONS.find((section) => section.value === role)?.label || role || 'Unknown';
const getEntityLabel = (role) => (role === 'technician' ? 'Technician' : role === 'client' ? 'Client' : role === 'admin' ? 'Administrator' : 'User');
const isHardDeleteRole = (role) => ['technician', 'client'].includes(role);
const getAllowedRoleFilter = (canViewAllUsers, search) => {
  const requested = new URLSearchParams(search).get('role');
  const allowed = canViewAllUsers ? ['all', ...ROLE_SECTIONS.map((section) => section.value)] : ['technician'];
  return allowed.includes(requested) ? requested : (canViewAllUsers ? 'all' : 'technician');
};
const getTechnicianStatusLabel = (status) => (status === 'available' ? 'Available' : status === 'on_job' ? 'On job' : 'Offline');
const sanitizeCapabilities = (capabilities = [], availableCapabilities = []) => {
  const allowedCapabilities = new Set((availableCapabilities || []).map((item) => item.code));
  return capabilities.filter((capability) => allowedCapabilities.has(capability));
};
const matchesSearch = (user, query) => !query || [
  user.username,
  user.name,
  user.email,
  user.phone,
  user.address,
  user.role,
  getRoleLabel(user.role),
  user.role === 'technician' ? getTechnicianStatusLabel(user.technicianStatus) : '',
  user.active ? 'active' : 'inactive'
].some((value) => String(value || '').toLowerCase().includes(query));
const getDetails = (user) => {
  if (user.role === 'technician') {
    const hasCoords = Boolean(Number(user.lat) || Number(user.lng));
    return hasCoords ? `${getTechnicianStatusLabel(user.technicianStatus)} | ${Number(user.lat).toFixed(5)}, ${Number(user.lng).toFixed(5)}` : getTechnicianStatusLabel(user.technicianStatus);
  }
  if (user.role === 'client') return user.address || 'No address on file';
  return user.active ? 'Active account' : 'Inactive account';
};
const getAccessAreas = (record) => {
  if (record.role === 'superadmin') return ['All areas'];
  const capabilitySet = new Set(record.capabilities || []);
  return ACCESS_AREA_DEFINITIONS
    .filter((area) => area.roles.includes(record.role) && area.capabilities.some((capability) => capabilitySet.has(capability)))
    .map((area) => area.label);
};
const groupCapabilitiesByCategory = (capabilities = []) => capabilities.reduce((groups, capability) => {
  const category = capability.category || 'General';
  return {
    ...groups,
    [category]: [...(groups[category] || []), capability]
  };
}, {});

export default function AdminUserManagement() {
  const location = useLocation();
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const canViewAllUsers = isSuperadmin || (user?.role === 'admin' && hasAnyCapability(user, USER_DIRECTORY_CAPABILITIES));
  const allowCapabilityManagement = canManageStaffAccess(user);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [availableServiceTypes, setAvailableServiceTypes] = useState([]);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState(() => getAllowedRoleFilter(canViewAllUsers, location.search));
  const [showInactive, setShowInactive] = useState(false);
  const [editingProfileUser, setEditingProfileUser] = useState(null);
  const [editingAccessUser, setEditingAccessUser] = useState(null);
  const [viewingAccessUser, setViewingAccessUser] = useState(null);
  const [editingCapabilities, setEditingCapabilities] = useState([]);
  const [busyUserId, setBusyUserId] = useState(null);
  const [loadingProfileUserId, setLoadingProfileUserId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  const load = async ({ preserveFeedback = false } = {}) => {
    setLoading(true);
    try {
      const fetchedUsers = await fetchAdminUsers();
      setUsers([...fetchedUsers].sort((left, right) => Number(right.id || 0) - Number(left.id || 0)));
      if (!preserveFeedback) {
        setMessage('');
        setError('');
      }
    } catch (loadError) {
      setUsers([]);
      if (!preserveFeedback) setMessage('');
      setError(loadError.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setRoleFilter(getAllowedRoleFilter(canViewAllUsers, location.search)); }, [canViewAllUsers, location.search]);
  useEffect(() => {
    let isMounted = true;
    api.get('/services/service-types/').then(({ data }) => {
      if (!isMounted) return;
      const serviceTypes = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
      setAvailableServiceTypes(
        [...serviceTypes].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')))
      );
    }).catch(() => {
      if (isMounted) setAvailableServiceTypes([]);
    });
    return () => { isMounted = false; };
  }, []);
  useEffect(() => {
    let isMounted = true;
    if (!allowCapabilityManagement) {
      setCatalog([]);
      return () => { isMounted = false; };
    }
    fetchAssignableCapabilities().then((capabilities) => {
      if (isMounted) setCatalog(Array.isArray(capabilities) ? capabilities : []);
    }).catch(() => {
      if (isMounted) setCatalog([]);
    });
    return () => { isMounted = false; };
  }, [allowCapabilityManagement]);

  const filteredByAccess = canViewAllUsers ? users : users.filter((record) => canManageStaffTargetRole(record.role));
  const activeScopedUsers = filteredByAccess.filter((record) => showInactive || record.active);
  const inactiveCount = filteredByAccess.filter((record) => !record.active).length;
  const visibleUsers = activeScopedUsers
    .filter((record) => (roleFilter === 'all' || record.role === roleFilter) && matchesSearch(record, searchTerm.trim().toLowerCase()));
  const capabilityGroups = groupCapabilitiesByCategory(catalog);

  const canManageAccessTarget = (role) => isSuperadmin
    ? ['admin'].includes(role)
    : false;

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!isSuperadmin) return;
    setMessage('');
    setError('');
    if (!createForm.username.trim()) return setError('Username is required.');
    if (!createForm.password) return setError('Password is required.');
    if (createForm.password !== createForm.passwordConfirm) return setError('Passwords do not match.');
    const basePayload = { username: createForm.username, name: createForm.name, role: createForm.role, email: createForm.email, phone: createForm.phone, password: createForm.password, passwordConfirm: createForm.passwordConfirm };
    setIsSubmitting(true);
    try {
      if (createForm.role === 'technician') await createAdminTechnician({ ...basePayload, status: createForm.status });
      else if (createForm.role === 'client') await createAdminClient({ ...basePayload, address: createForm.address });
      else await createAdminUser(basePayload);
      setCreateForm(emptyCreate);
      setMessage(`${getEntityLabel(createForm.role)} created.`);
      await load({ preserveFeedback: true });
    } catch (createError) {
      setError(createError.message || 'Failed to create user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openProfileEditor = async (record) => {
    setMessage('');
    setError('');
    setLoadingProfileUserId(record.id);
    try {
      const resolvedRecord = record.role === 'technician'
        ? await fetchAdminTechnician(record.id)
        : record;
      setEditingProfileUser(resolvedRecord);
      setEditForm({
        ...emptyEdit,
        name: resolvedRecord.name || '',
        email: resolvedRecord.email || '',
        phone: resolvedRecord.phone || '',
        address: resolvedRecord.address || '',
        status: resolvedRecord.role === 'technician' ? resolvedRecord.technicianStatus || 'available' : 'available',
        lat: resolvedRecord.lat || '',
        lng: resolvedRecord.lng || '',
        skills: resolvedRecord.role === 'technician'
          ? (Array.isArray(resolvedRecord.skillDetails) && resolvedRecord.skillDetails.length > 0
              ? resolvedRecord.skillDetails.map((skill) => ({
                  service_type: String(skill.service_type),
                  skill_level: skill.skill_level || 'intermediate'
                }))
              : [])
          : [],
      });
    } catch (loadError) {
      setEditingProfileUser(null);
      setEditForm(emptyEdit);
      setError(loadError.message || 'Unable to load user details.');
    } finally {
      setLoadingProfileUserId(null);
    }
  };

  const saveProfile = async () => {
    if (!editingProfileUser || !isSuperadmin) return;
    const technicianSkills = editingProfileUser.role === 'technician'
      ? (Array.isArray(editForm.skills) ? editForm.skills : [])
      : [];
    if (editingProfileUser.role === 'technician') {
      const seenServiceTypes = new Set();
      for (let index = 0; index < technicianSkills.length; index += 1) {
        const skill = technicianSkills[index];
        const serviceTypeId = String(skill?.service_type || '').trim();
        if (!serviceTypeId) {
          setError(`Select a service type for skill #${index + 1}.`);
          return;
        }
        if (seenServiceTypes.has(serviceTypeId)) {
          setError('Each service type can only be assigned once per technician.');
          return;
        }
        seenServiceTypes.add(serviceTypeId);
      }
    }
    const updates = { name: editForm.name, email: editForm.email, phone: editForm.phone, active: editingProfileUser.active };
    setIsSavingProfile(true);
    setMessage('');
    setError('');
    try {
      if (editingProfileUser.role === 'technician') {
        await updateAdminTechnician(editingProfileUser.id, {
          ...updates,
          status: editForm.status,
          lat: editForm.lat,
          lng: editForm.lng,
          skills: technicianSkills.map((skill) => ({
            service_type: Number(skill.service_type),
            skill_level: skill.skill_level || 'intermediate'
          }))
        });
      }
      else if (editingProfileUser.role === 'client') await updateAdminClient(editingProfileUser.id, { ...updates, address: editForm.address });
      else await updateAdminUser(editingProfileUser.id, updates);
      setEditingProfileUser(null);
      setEditForm(emptyEdit);
      setMessage(`${getEntityLabel(editingProfileUser.role)} updated.`);
      await load({ preserveFeedback: true });
    } catch (saveError) {
      setError(saveError.message || 'Unable to update user.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const addSkillRow = () => {
    setEditForm((current) => ({
      ...current,
      skills: [...(Array.isArray(current.skills) ? current.skills : []), { ...emptySkillEntry }]
    }));
  };

  const updateSkillRow = (index, field, value) => {
    setEditForm((current) => ({
      ...current,
      skills: (Array.isArray(current.skills) ? current.skills : []).map((skill, skillIndex) => (
        skillIndex === index
          ? { ...skill, [field]: value }
          : skill
      ))
    }));
  };

  const removeSkillRow = (index) => {
    setEditForm((current) => ({
      ...current,
      skills: (Array.isArray(current.skills) ? current.skills : []).filter((_, skillIndex) => skillIndex !== index)
    }));
  };

  const removeUser = async (record) => {
    if (!isSuperadmin) return;
    if (!record.active) return;
    const hardDelete = isHardDeleteRole(record.role);
    const actionLabel = hardDelete ? 'Delete' : 'Deactivate';
    if (!window.confirm(`${actionLabel} this ${getEntityLabel(record.role).toLowerCase()}?`)) return;
    setBusyUserId(record.id);
    setMessage('');
    setError('');
    try {
      if (record.role === 'technician') {
        await deleteAdminTechnician(record.id);
        setMessage('Technician deleted.');
      } else if (record.role === 'client') {
        await deleteAdminClient(record.id);
        setMessage('Client deleted.');
      } else {
        await deactivateAdminUser(record.id);
        setMessage(`${getEntityLabel(record.role)} deactivated.`);
      }
      if (editingProfileUser?.id === record.id) setEditingProfileUser(null);
      if (editingAccessUser?.id === record.id) setEditingAccessUser(null);
      if (viewingAccessUser?.id === record.id) setViewingAccessUser(null);
      await load({ preserveFeedback: true });
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove user.');
    } finally {
      setBusyUserId(null);
    }
  };

  const openAccessEditor = async (record) => {
    if (!allowCapabilityManagement || !canManageAccessTarget(record.role)) return;
    setViewingAccessUser(null);
    setBusyUserId(record.id);
    setMessage('');
    setError('');
    try {
      const accessData = await fetchUserCapabilities(record.id);
      if (Array.isArray(accessData.available_capabilities) && accessData.available_capabilities.length > 0) setCatalog(accessData.available_capabilities);
      setEditingAccessUser(record);
      setEditingCapabilities(sanitizeCapabilities(accessData.direct_capabilities || [], accessData.available_capabilities || []));
    } catch (accessError) {
      setError(accessError.message || 'Unable to load user access.');
    } finally {
      setBusyUserId(null);
    }
  };

  const saveAccess = async () => {
    if (!editingAccessUser) return;
    setIsSavingAccess(true);
    setMessage('');
    setError('');
    try {
      const payload = sanitizeCapabilities(editingCapabilities, catalog);
      await updateUserCapabilities(editingAccessUser.id, payload);
      setEditingAccessUser(null);
      setEditingCapabilities([]);
      setMessage(`Access updated for ${editingAccessUser.username}.`);
      await load({ preserveFeedback: true });
    } catch (saveError) {
      setError(saveError.message || 'Unable to update user access.');
    } finally {
      setIsSavingAccess(false);
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">
            {isSuperadmin ? 'Owner Access Management' : canViewAllUsers ? 'User Directory' : 'Technician Access'}
          </h2>
          <p className="text-slate-600">
            {isSuperadmin
              ? 'Create admins and staff accounts, manage client records, and control who can access the internal workspaces.'
              : canViewAllUsers
                ? 'Review all accounts from the admin workspace. Editing and account creation remain reserved for the superadmin.'
                : 'Bestow or remove technician workspace access without changing each technician\'s main role.'}
          </p>
        </div>
        {message ? <div className="text-sm font-medium text-green-700">{message}</div> : null}
      </div>
      {error ? <div className="mb-6 text-sm font-medium text-red-600">{error}</div> : null}
      {isSuperadmin ? (
        <form onSubmit={handleCreate} className={`${panelClass} mb-6`}>
          <h3 className="mb-3 text-lg font-semibold">Create new user</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input className={inputClass} placeholder="Username" value={createForm.username} onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })} />
            <input className={inputClass} placeholder="Full name" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} />
            <select className={inputClass} value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}>
              {CREATE_ROLE_SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
            </select>
            <input className={inputClass} placeholder="Email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} />
            <input className={inputClass} placeholder="Phone" value={createForm.phone} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })} />
            {createForm.role === 'client' ? (
              <input className={`${inputClass} md:col-span-2`} placeholder="Address" value={createForm.address} onChange={(event) => setCreateForm({ ...createForm, address: event.target.value })} />
            ) : null}
            {createForm.role === 'technician' ? (
              <select className={inputClass} value={createForm.status} onChange={(event) => setCreateForm({ ...createForm, status: event.target.value })}>
                <option value="available">Available</option>
                <option value="on_job">On job</option>
                <option value="offline">Offline</option>
              </select>
            ) : null}
            <input type="password" className={inputClass} placeholder="Password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} />
            <input type="password" className={inputClass} placeholder="Confirm Password" value={createForm.passwordConfirm} onChange={(event) => setCreateForm({ ...createForm, passwordConfirm: event.target.value })} />
          </div>
          <button type="submit" disabled={isSubmitting} className="mt-3 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </form>
      ) : canViewAllUsers ? (
        <div className={`${panelClass} mb-6 border border-violet-100 bg-violet-50`}>
          <h3 className="text-lg font-semibold text-slate-900">Read-Only User Directory</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">This admin account can review user records because the superadmin granted directory access. Any account creation, profile editing, or deletion still requires the superadmin account.</p>
        </div>
      ) : allowCapabilityManagement ? (
        <div className={`${panelClass} mb-6 border border-sky-100 bg-sky-50`}>
          <h3 className="text-lg font-semibold text-slate-900">Technician Capability Access</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Use <span className="font-medium text-slate-900">Manage access</span> to control which technician pages each field user can open.</p>
        </div>
      ) : null}

      <div className={`${panelClass} mb-6`}>
        <div className={`grid gap-4 ${canViewAllUsers ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Search users</label>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="Search by username, name, email, phone, role, address, or status" />
          </div>
          {canViewAllUsers ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">Category</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRoleFilter('all')} className={`rounded-full px-4 py-2 text-sm font-medium transition ${roleFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>All roles ({activeScopedUsers.length})</button>
                {ROLE_SECTIONS.map((section) => {
                  const count = activeScopedUsers.filter((record) => record.role === section.value).length;
                  return <button key={section.value} type="button" onClick={() => setRoleFilter(section.value)} className={`rounded-full px-4 py-2 text-sm font-medium transition ${roleFilter === section.value ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>{section.label} ({count})</button>;
                })}
              </div>
              {isSuperadmin && inactiveCount > 0 ? (
                <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Show inactive accounts ({inactiveCount})
                </label>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Technician accounts available: <span className="font-semibold text-slate-900">{activeScopedUsers.filter((record) => record.role === 'technician').length}</span></div>
          )}
        </div>
        <p className="mt-4 text-sm text-slate-500">Showing {visibleUsers.length} {showInactive ? 'active or inactive' : 'active'} user{visibleUsers.length === 1 ? '' : 's'}{roleFilter === 'all' ? ' across all roles.' : ` in ${getRoleLabel(roleFilter)}.`}</p>
      </div>

      {loading ? (
        <div className={panelClass}>Loading users...</div>
      ) : visibleUsers.length === 0 ? (
        <div className={panelClass}>No users match the current search or selected category.</div>
      ) : (
        <div className={panelClass}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-100 text-left text-sm text-slate-700">
                <tr>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Details</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Access</th>
                  <th className="p-3">Status</th>
                  {isSuperadmin ? <th className="p-3 text-right">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((record) => {
                  const canEditAccess = allowCapabilityManagement && canManageAccessTarget(record.role);
                  const hardDelete = isHardDeleteRole(record.role);
                  const canRemove = isSuperadmin && record.id !== user?.id && record.active;
                  const removeLabel = hardDelete ? 'Delete' : 'Deactivate';
                  const busyRemoveLabel = hardDelete ? 'Deleting...' : 'Deactivating...';
                  const accessAreas = getAccessAreas(record);
                  return (
                    <tr key={record.id} className="border-t">
                      <td className="p-3 font-semibold text-blue-700">{formatRoleId(record.role, record.id)}</td>
                      <td className="p-3 font-medium text-slate-900">{record.username}</td>
                      <td className="p-3 text-slate-600">{getRoleLabel(record.role)}</td>
                      <td className="p-3 text-sm text-slate-600">{getDetails(record)}</td>
                      <td className="p-3 text-slate-600">{record.email || '-'}</td>
                      <td className="p-3 text-slate-600">{record.phone || '-'}</td>
                      <td className="p-3">
                        {canEditAccess ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setViewingAccessUser(record)} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">
                              Areas ({accessAreas.length})
                            </button>
                            <button type="button" disabled={busyUserId === record.id} onClick={() => openAccessEditor(record)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                              {busyUserId === record.id && editingAccessUser?.id !== record.id ? 'Loading access...' : 'Manage access'}
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setViewingAccessUser(record)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                            {accessAreas.length === 0 ? (canViewAllUsers ? 'Read only' : 'Technician only') : `Areas (${accessAreas.length})`}
                          </button>
                        )}
                      </td>
                      <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${record.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{record.active ? 'Active' : 'Inactive'}</span></td>
                      {isSuperadmin ? (
                        <td className="p-3 text-right">
                          <div className="flex flex-wrap justify-end gap-3">
                            <button
                              type="button"
                              disabled={loadingProfileUserId === record.id}
                              onClick={() => openProfileEditor(record)}
                              className="text-sm font-medium text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {loadingProfileUserId === record.id ? 'Loading...' : 'Edit'}
                            </button>
                            {canRemove ? (
                              <button type="button" disabled={busyUserId === record.id} onClick={() => removeUser(record)} className="text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-60">{busyUserId === record.id ? busyRemoveLabel : removeLabel}</button>
                            ) : record.role === 'superadmin' ? (
                              <span className="text-sm text-slate-400">Owner account</span>
                            ) : <span className="text-sm text-slate-400">Inactive</span>}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {viewingAccessUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" onClick={() => setViewingAccessUser(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Accessible areas</h3>
                <p className="text-sm text-slate-500">{viewingAccessUser.username} can access these areas.</p>
              </div>
              <button type="button" onClick={() => setViewingAccessUser(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Close</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {getAccessAreas(viewingAccessUser).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 sm:col-span-2">No granted areas.</div>
              ) : (
                getAccessAreas(viewingAccessUser).map((area) => (
                  <div key={area} className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                    {area}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
      {editingProfileUser ? (
        <div className={`${panelClass} mt-6`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Edit {getEntityLabel(editingProfileUser.role)}</h3>
              <p className="text-sm text-slate-500">{editingProfileUser.username} stays on the same role and route.</p>
            </div>
            <button type="button" onClick={() => { setEditingProfileUser(null); setEditForm(emptyEdit); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Close</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className={`${inputClass} bg-slate-50 text-slate-500`} value={editingProfileUser.username} disabled />
            <input className={`${inputClass} bg-slate-50 text-slate-500`} value={getRoleLabel(editingProfileUser.role)} disabled />
            <input className={inputClass} placeholder="Full name" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
            <input className={inputClass} placeholder="Email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
            <input className={inputClass} placeholder="Phone" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} />
            {editingProfileUser.role === 'technician' ? (
              <select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                <option value="available">Available</option>
                <option value="on_job">On job</option>
                <option value="offline">Offline</option>
              </select>
            ) : null}
            {editingProfileUser.role === 'client' ? (
              <input className={`${inputClass} md:col-span-2`} placeholder="Address" value={editForm.address} onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} />
            ) : null}
            {editingProfileUser.role === 'technician' ? (
              <>
                <input type="number" className={inputClass} placeholder="Latitude" value={editForm.lat} onChange={(event) => setEditForm({ ...editForm, lat: event.target.value })} />
                <input type="number" className={inputClass} placeholder="Longitude" value={editForm.lng} onChange={(event) => setEditForm({ ...editForm, lng: event.target.value })} />
              </>
            ) : null}
          </div>
          {editingProfileUser.role === 'technician' ? (
            <div className="mt-6 rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Technician skills</h4>
                  <p className="text-sm text-slate-500">Only the superadmin can change these skills here. Old tickets stay untouched because this updates the technician&apos;s current skill records only.</p>
                </div>
                <button type="button" onClick={addSkillRow} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Add skill
                </button>
              </div>
              {editForm.skills.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No skills assigned yet.</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {editForm.skills.map((skill, index) => (
                    <div key={`${skill.service_type || 'new'}-${index}`} className="grid gap-3 md:grid-cols-[1.6fr_1fr_auto]">
                      <select className={inputClass} value={skill.service_type} onChange={(event) => updateSkillRow(index, 'service_type', event.target.value)}>
                        <option value="">Select service type</option>
                        {availableServiceTypes.map((serviceType) => (
                          <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>
                        ))}
                      </select>
                      <select className={inputClass} value={skill.skill_level} onChange={(event) => updateSkillRow(index, 'skill_level', event.target.value)}>
                        {SKILL_LEVEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeSkillRow(index)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <button type="button" onClick={saveProfile} disabled={isSavingProfile} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            {isSavingProfile ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      ) : null}

      {editingAccessUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" onClick={() => { setEditingAccessUser(null); setEditingCapabilities([]); }}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Capabilities for {getRoleLabel(editingAccessUser.role)}</h3>
                <p className="text-sm text-slate-500">Select which capabilities {editingAccessUser.username} can access.</p>
              </div>
              <button type="button" onClick={() => { setEditingAccessUser(null); setEditingCapabilities([]); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Close</button>
            </div>
            <div className="space-y-5">
              {Object.entries(capabilityGroups).map(([category, capabilities]) => (
                <section key={category}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">{category}</h4>
                    <span className="text-xs font-medium text-slate-500">
                      {capabilities.filter((capability) => editingCapabilities.includes(capability.code)).length}/{capabilities.length} selected
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {capabilities.map((capability) => (
                      <label key={capability.code} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${editingCapabilities.includes(capability.code) ? 'border-slate-900 bg-slate-900/5 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={editingCapabilities.includes(capability.code)} onChange={() => setEditingCapabilities((current) => current.includes(capability.code) ? current.filter((item) => item !== capability.code) : [...current, capability.code])} className="mt-1" />
                        <span>
                          <span className="block font-semibold text-slate-900">{capability.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{capability.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {catalog.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No capabilities are available for this account.</div>
            ) : null}
            <div className="sticky bottom-0 mt-5 flex justify-end border-t border-slate-200 bg-white pt-4">
              <button type="button" onClick={saveAccess} disabled={isSavingAccess} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {isSavingAccess ? 'Saving access...' : 'Save access'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
