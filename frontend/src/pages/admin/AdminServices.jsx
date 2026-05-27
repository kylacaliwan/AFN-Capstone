import { useEffect, useState } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiChevronDown, FiChevronUp, FiTool, FiClock, FiList, FiPackage } from 'react-icons/fi';
import Layout from '../../components/layout/Layout';
import {
  createService,
  createServiceInventoryRequirement,
  deleteService,
  deleteServiceInventoryRequirement,
  fetchInventory,
  fetchServiceInventoryRequirements,
  fetchServices,
  updateService
} from '../../api/api';

const DEFAULT_SERVICE_FORM = {
  name: '',
  description: '',
  estimated_duration: 60,
  estimated_cost: 0,
  max_daily_assignments: 5,
  procedures: [],
  required_equipment: [],
};

const normalizeProcedures = (procedures) => (
  Array.isArray(procedures)
    ? procedures.map((procedure, index) => {
        if (typeof procedure === 'string') {
          return { step: index + 1, title: procedure, description: '' };
        }
        return {
          step: Number(procedure?.step || index + 1),
          title: procedure?.title || procedure?.label || '',
          description: procedure?.description || ''
        };
      })
    : []
);

const normalizeEquipment = (equipment) => (
  Array.isArray(equipment)
    ? equipment.map((item) => {
        if (typeof item === 'string') {
          return { name: item, quantity: 1 };
        }
        return {
          name: item?.name || item?.label || '',
          quantity: Number(item?.quantity || 1)
        };
      })
    : []
);

const toServiceFormState = (service) => ({
  name: service?.name || '',
  description: service?.description || '',
  estimated_duration: Number(service?.estimated_duration || 60),
  estimated_cost: Number(service?.estimated_cost || 0),
  max_daily_assignments: Number(service?.max_daily_assignments || 5),
  procedures: normalizeProcedures(service?.procedures),
  required_equipment: normalizeEquipment(service?.required_equipment),
});

const formatDuration = (minutes) => {
  const safeMinutes = Number(minutes || 0);
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${safeMinutes}m`;
};

const formatCost = (cost) => {
  const num = Number(cost || 0);
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
};

const getDurationParts = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  return {
    hours: Math.floor(safeMinutes / 60),
    minutes: safeMinutes % 60
  };
};

const mergeDurationPart = (currentMinutes, part, value) => {
  const current = getDurationParts(currentMinutes);
  const numericValue = Math.max(0, Number(value || 0));
  const next = {
    ...current,
    [part]: part === 'minutes' ? Math.min(numericValue, 59) : numericValue
  };
  return (next.hours * 60) + next.minutes;
};

const normalizeRequirement = (requirement) => ({
  ...requirement,
  service_type: Number(requirement?.service_type || 0) || '',
  item: Number(requirement?.item || 0) || '',
  quantity: Number(requirement?.quantity || 0),
  available_quantity: Number(requirement?.available_quantity || 0)
});

/* Procedure Step Editor */
function ProcedureEditor({ procedures, onChange }) {
  const addStep = () => {
    onChange([...procedures, { step: procedures.length + 1, title: '', description: '' }]);
  };
  const removeStep = (index) => {
    onChange(procedures.filter((_, i) => i !== index).map((p, i) => ({ ...p, step: i + 1 })));
  };
  const updateStep = (index, field, value) => {
    const updated = [...procedures];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Technician Checklist Steps</label>
        <button
          type="button"
          onClick={addStep}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
        >
          <FiPlus size={12} /> Add Step
        </button>
      </div>
      {procedures.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
          No checklist steps defined. Add steps that technicians will follow.
        </p>
      ) : (
        <div className="space-y-2">
          {procedures.map((proc, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <div className="flex-1 space-y-1">
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Step title"
                  value={proc.title}
                  onChange={(e) => updateStep(i, 'title', e.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Description (optional)"
                  value={proc.description || ''}
                  onChange={(e) => updateStep(i, 'description', e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="mt-1.5 rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Equipment Editor */
function EquipmentEditor({ equipment, onChange }) {
  const addItem = () => {
    onChange([...equipment, { name: '', quantity: 1 }]);
  };
  const removeItem = (index) => {
    onChange(equipment.filter((_, i) => i !== index));
  };
  const updateItem = (index, field, value) => {
    const updated = [...equipment];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Checklist Equipment / Tools</label>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
        >
          <FiPlus size={12} /> Add Tool
        </button>
      </div>
      {equipment.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
          No required equipment defined.
        </p>
      ) : (
        <div className="space-y-2">
          {equipment.map((item, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <FiTool size={14} className="shrink-0 text-slate-400" />
              <input
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="Tool name"
                value={item.name}
                onChange={(e) => updateItem(i, 'name', e.target.value)}
              />
              <input
                type="number"
                min="1"
                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(i, 'quantity', Number(e.target.value) || 1)}
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Expandable Service Card */
function ServiceCard({ service, requirements, inventoryItems, onEdit, onDelete, onSaveRequirement, onDeleteRequirement }) {
  const [expanded, setExpanded] = useState(false);
  const [reqForm, setReqForm] = useState(null);

  const startAddRequirement = () => {
    setReqForm({
      service_type: service.id,
      item: inventoryItems[0]?.id || '',
      quantity: 1,
      auto_reserve: true,
      notes: '',
    });
  };

  const handleSaveReq = async () => {
    if (!reqForm) return;
    await onSaveRequirement(reqForm);
    setReqForm(null);
  };

  const procedures = normalizeProcedures(service.procedures);
  const equipment = normalizeEquipment(service.required_equipment);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h4 className="text-base font-semibold text-slate-900">{service.name}</h4>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600">
              {formatDuration(service.estimated_duration)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{service.description || 'No description'}</p>

          {/* Quick stats row */}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="text-[11px] font-bold text-emerald-600">PHP</span>
              {formatCost(service.estimated_cost)}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiClock size={12} className="text-amber-500" />
              Max {service.max_daily_assignments}/day per tech
            </span>
            <span className="inline-flex items-center gap-1">
              <FiList size={12} className="text-brand-500" />
              {procedures.length} step{procedures.length !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiTool size={12} className="text-violet-500" />
              {equipment.length} tool{equipment.length !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiPackage size={12} className="text-sky-500" />
              {requirements.length} inventory template{requirements.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(service)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            title="Edit"
          >
            <FiEdit2 size={15} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(service.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            title="Delete"
          >
            <FiTrash2 size={15} />
            Delete
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            {expanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Procedures */}
          {procedures.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-slate-700">Procedures</h5>
              <div className="space-y-1.5">
                {procedures.map((proc, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">
                      {proc.step || i + 1}
                    </span>
                    <div>
                      <span className="font-medium text-slate-800">{proc.title || `Step ${i + 1}`}</span>
                      {proc.description && <p className="text-slate-500">{proc.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Required Equipment */}
          {equipment.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-slate-700">Required Equipment</h5>
              <div className="flex flex-wrap gap-2">
                {equipment.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
                    <FiTool size={12} className="text-slate-400" />
                    {item.name} <span className="text-slate-400">x{item.quantity}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Inventory Templates */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-sm font-semibold text-slate-700">Inventory Templates</h5>
              {inventoryItems.length > 0 && (
                <button
                  type="button"
                  onClick={startAddRequirement}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                >
                  <FiPlus size={12} /> Add
                </button>
              )}
            </div>

            {requirements.length === 0 && !reqForm ? (
              <p className="text-sm text-slate-400">No inventory templates configured.</p>
            ) : (
              <div className="space-y-1.5">
                {requirements.map((req) => (
                  <div key={req.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{req.item_name}</span>
                      <span className="ml-2 text-slate-400">x{req.quantity}</span>
                      <span className="ml-2 text-slate-400">({req.auto_reserve ? 'Auto' : 'Manual'})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteRequirement(req.id)}
                      className="rounded p-1 text-red-400 hover:text-red-600"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline add requirement form */}
            {reqForm && (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <select
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={reqForm.item}
                  onChange={(e) => setReqForm({ ...reqForm, item: Number(e.target.value) })}
                >
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.available_quantity ?? item.quantity ?? 0} available)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={reqForm.quantity}
                  onChange={(e) => setReqForm({ ...reqForm, quantity: Number(e.target.value) || 1 })}
                />
                <button
                  type="button"
                  onClick={handleSaveReq}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setReqForm(null)}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Main Page */
export default function AdminServices() {
  const [services, setServices] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState(null);
  const [serviceFormData, setServiceFormData] = useState(DEFAULT_SERVICE_FORM);
  const [feedback, setFeedback] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [serviceList, inventoryList, requirementList] = await Promise.all([
        fetchServices(),
        fetchInventory(),
        fetchServiceInventoryRequirements()
      ]);
      setServices(serviceList);
      setInventoryItems(inventoryList);
      setRequirements(requirementList.map(normalizeRequirement));
    } catch (error) {
      setServices([]);
      setInventoryItems([]);
      setRequirements([]);
      setFeedback(error.message || 'Unable to load services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSaveService = async () => {
    try {
      const serviceName = serviceFormData.name.trim();
      if (!serviceName) {
        setFeedback('Service name is required.');
        return;
      }
      if (services.some((service) => service.name.toLowerCase() === serviceName.toLowerCase() && service.id !== editingService?.id)) {
        setFeedback('A service with this name already exists.');
        return;
      }
      if (Number(serviceFormData.estimated_duration || 0) <= 0) {
        setFeedback('Duration must be greater than zero.');
        return;
      }
      if (Number(serviceFormData.estimated_cost || 0) < 0) {
        setFeedback('Estimated cost cannot be negative.');
        return;
      }
      if (Number(serviceFormData.max_daily_assignments || 0) <= 0) {
        setFeedback('Max daily assignments must be at least 1.');
        return;
      }

      const payload = {
        ...serviceFormData,
        name: serviceName,
        description: serviceFormData.description.trim()
      };

      if (editingService) {
        await updateService(editingService.id, payload);
        setFeedback('Service updated.');
      } else {
        await createService(payload);
        setFeedback('Service created.');
      }
      setEditingService(null);
      setServiceFormData(DEFAULT_SERVICE_FORM);
      setShowForm(false);
      await load();
    } catch (error) {
      setFeedback(error.message || 'Error saving service.');
    }
  };

  const onDeleteService = async (id) => {
    if (!window.confirm('Remove this service?')) return;
    try {
      await deleteService(id);
      setFeedback('Service deleted.');
      await load();
    } catch (error) {
      setFeedback(error.message || 'Error deleting service.');
    }
  };

  const onEditService = (service) => {
    setEditingService(service);
    setServiceFormData(toServiceFormState(service));
    setShowForm(true);
    setFeedback('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSaveRequirement = async (formData) => {
    try {
      await createServiceInventoryRequirement(formData);
      setFeedback('Inventory template added.');
      await load();
    } catch (error) {
      setFeedback(error.message || 'Error saving template.');
    }
  };

  const onDeleteRequirement = async (id) => {
    if (!window.confirm('Remove this inventory template?')) return;
    try {
      await deleteServiceInventoryRequirement(id);
      setFeedback('Template removed.');
      await load();
    } catch (error) {
      setFeedback(error.message || 'Error deleting template.');
    }
  };

  const durationParts = getDurationParts(serviceFormData.estimated_duration);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-end justify-end gap-4">
        <div className="flex items-center gap-3">
          {feedback && <span className="text-sm text-teal-700">{feedback}</span>}
          <button
            type="button"
            onClick={() => {
              setShowForm(!showForm);
              if (showForm) {
                setEditingService(null);
                setServiceFormData(DEFAULT_SERVICE_FORM);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            <FiPlus size={15} />
            {showForm ? 'Close' : 'Add Service'}
          </button>
        </div>
      </div>

      {/* Service Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">
            {editingService ? 'Edit Service' : 'New Service'}
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Service Name</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="e.g. Aircon Installation"
                value={serviceFormData.name}
                onChange={(e) => setServiceFormData({ ...serviceFormData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Duration</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-12 text-sm"
                    value={durationParts.hours}
                    onChange={(e) => setServiceFormData({
                      ...serviceFormData,
                      estimated_duration: mergeDurationPart(serviceFormData.estimated_duration, 'hours', e.target.value)
                    })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">hr</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-12 text-sm"
                    value={durationParts.minutes}
                    onChange={(e) => setServiceFormData({
                      ...serviceFormData,
                      estimated_duration: mergeDurationPart(serviceFormData.estimated_duration, 'minutes', e.target.value)
                    })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">min</span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatDuration(serviceFormData.estimated_duration)} total</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Estimated Cost (Philippine Peso)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 pl-12 text-sm"
                  value={serviceFormData.estimated_cost}
                  onChange={(e) => setServiceFormData({ ...serviceFormData, estimated_cost: Number(e.target.value) || 0 })}
                />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">PHP</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Max Daily Assignments (per tech)</label>
              <input
                type="number"
                min="1"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={serviceFormData.max_daily_assignments}
                onChange={(e) => setServiceFormData({ ...serviceFormData, max_daily_assignments: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                placeholder="Describe the service"
                value={serviceFormData.description}
                onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
              />
            </div>
          </div>

          {/* Procedures */}
          <div className="mt-5">
            <ProcedureEditor
              procedures={serviceFormData.procedures}
              onChange={(procedures) => setServiceFormData({ ...serviceFormData, procedures })}
            />
          </div>

          {/* Equipment */}
          <div className="mt-5">
            <EquipmentEditor
              equipment={serviceFormData.required_equipment}
              onChange={(required_equipment) => setServiceFormData({ ...serviceFormData, required_equipment })}
            />
          </div>

          <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
              onClick={onSaveService}
            >
              {editingService ? 'Update Service' : 'Create Service'}
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
              onClick={() => {
                setServiceFormData(DEFAULT_SERVICE_FORM);
                setEditingService(null);
                setShowForm(false);
                setFeedback('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Services List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Loading services...</div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16">
          <FiTool size={32} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">No services yet. Create your first service above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              requirements={requirements.filter((r) => Number(r.service_type) === Number(service.id))}
              inventoryItems={inventoryItems}
              onEdit={onEditService}
              onDelete={onDeleteService}
              onSaveRequirement={onSaveRequirement}
              onDeleteRequirement={onDeleteRequirement}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}
