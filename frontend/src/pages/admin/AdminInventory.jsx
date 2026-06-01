import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { api, fetchInventorySummary } from '../../api/api';
import { FiAlertCircle, FiEdit3, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi';

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'in_use', label: 'In Use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'retired', label: 'Retired' }
];

const buildDefaultItem = (categoryId = '') => ({
  name: '',
  sku: '',
  category: categoryId,
  quantity: 0,
  minimum_stock: 10,
  status: 'available'
});

const extractList = (data) =>
  Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);

const normalizeCategory = (category) => ({
  id: category.id,
  name: category.name
});

const normalizeInventoryItem = (item) => ({
  ...item,
  category: Number(item?.category || 0) || '',
  category_name: item?.category_name || 'Uncategorized',
  quantity: Number(item?.quantity || 0),
  minimum_stock: Number(item?.minimum_stock || 0),
  available_quantity: Number(item?.available_quantity ?? item?.quantity ?? 0),
  is_low_stock: Boolean(item?.is_low_stock)
});

const parseIntegerInput = (value, fallback = 0) => {
  if (value === '') {
    return '';
  }

  const parsedValue = parseInt(value, 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
};

const statusColor = (status) => {
  switch (status) {
    case 'available':
      return 'bg-green-100 text-green-800';
    case 'reserved':
      return 'bg-blue-100 text-blue-800';
    case 'in_use':
      return 'bg-indigo-100 text-indigo-800';
    case 'maintenance':
      return 'bg-yellow-100 text-yellow-800';
    case 'out_of_stock':
      return 'bg-red-100 text-red-800';
    case 'retired':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-800';
  }
};

const getApiErrorMessage = (error, fallback) => {
  const data = error?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data && typeof data === 'object') {
    const firstError = Object.values(data).flat().find(Boolean);
    if (firstError) {
      return Array.isArray(firstError) ? firstError[0] : String(firstError);
    }
  }

  return fallback;
};

export default function AdminInventory() {
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState(buildDefaultItem());
  const [editingId, setEditingId] = useState(null);
  const [editingItem, setEditingItem] = useState(buildDefaultItem());
  const [searchTerm, setSearchTerm] = useState('');
  const [inventorySummary, setInventorySummary] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);

  const getDefaultCategoryId = (categoryList = categories) => categoryList[0]?.id || '';

  const resetEditor = (categoryId = getDefaultCategoryId()) => {
    setAdding(false);
    setEditingId(null);
    setNewItem(buildDefaultItem(categoryId));
    setEditingItem(buildDefaultItem(categoryId));
  };

  const loadCategories = async () => {
    const { data } = await api.get('/inventory/categories/');
    let categoryList = extractList(data).map(normalizeCategory);

    if (categoryList.length === 0) {
      const created = await api.post('/inventory/categories/', {
        name: 'General',
        description: 'Default inventory category'
      });
      categoryList = [normalizeCategory(created.data)];
    }

    setCategories(categoryList);
    return categoryList;
  };

  const loadInventory = async () => {
    const { data } = await api.get('/inventory/items/');
    return extractList(data).map(normalizeInventoryItem);
  };

  const loadLowStockItems = async () => {
    const { data } = await api.get('/inventory/items/low_stock/');
    return extractList(data).map(normalizeInventoryItem);
  };

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [categoryList, items, summary, lowStock] = await Promise.all([
        loadCategories(),
        loadInventory(),
        fetchInventorySummary(),
        loadLowStockItems()
      ]);
      const defaultCategoryId = getDefaultCategoryId(categoryList);

      setInventory(items);
      setInventorySummary(summary);
      setLowStockItems(lowStock);
      setNewItem((current) => (current.category ? current : buildDefaultItem(defaultCategoryId)));
      setEditingItem((current) => (current.category ? current : buildDefaultItem(defaultCategoryId)));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Failed to load inventory. Please try again.'));
      setInventory([]);
      setCategories([]);
      setInventorySummary(null);
      setLowStockItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const buildPayload = (item) => ({
    name: item.name,
    sku: item.sku,
    category: Number(item.category),
    quantity: Number(item.quantity || 0),
    minimum_stock: Number(item.minimum_stock === '' ? 0 : item.minimum_stock),
    status: item.status
  });

  const addItem = async () => {
    try {
      const { data } = await api.post('/inventory/items/', buildPayload(newItem));
      const defaultCategoryId = getDefaultCategoryId();
      setInventory((current) => [...current, normalizeInventoryItem(data)]);
      setNewItem(buildDefaultItem(defaultCategoryId));
      setAdding(false);
      setError('');
      await loadData();
    } catch (addError) {
      setError(getApiErrorMessage(addError, 'Failed to add item. Please try again.'));
    }
  };

  const updateItem = async (id) => {
    try {
      const { data } = await api.patch(`/inventory/items/${id}/`, buildPayload(editingItem));
      setInventory((current) =>
        current.map((item) => (item.id === id ? normalizeInventoryItem({ ...item, ...data }) : item))
      );
      resetEditor();
      setError('');
      await loadData();
    } catch (updateError) {
      setError(getApiErrorMessage(updateError, 'Failed to update item. Please try again.'));
    }
  };

  const deleteItem = async (id) => {
    try {
      await api.delete(`/inventory/items/${id}/`);
      setInventory((current) => current.filter((item) => item.id !== id));
      setError('');
      await loadData();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Failed to delete item. Please try again.'));
    }
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredInventory = inventory.filter((item) => {
    if (!normalizedSearchTerm) {
      return true;
    }

    return [
      item.name,
      item.sku,
      item.category_name,
      item.status,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearchTerm));
  });
  const categoryMissing = categories.length === 0;
  const totalInventoryCount = inventorySummary?.totalItems ?? inventory.length;
  const lowStockCount = inventorySummary?.lowStockCount ?? lowStockItems.length;

  return (
    <Layout>
      <div className="card mb-4 flex flex-col gap-4 p-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">Inventory Management</h2>
          <p className="mt-1 text-sm text-slate-500">Track stock levels, item categories, and replenishment risk.</p>
          <div className="mt-4 max-w-xl">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Search inventory</label>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="Search by item name, SKU, category, or status"
            />
          </div>
        </div>
        <div className="flex gap-3 xl:justify-end">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 rounded-xl p-3 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <FiRefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setEditingItem(buildDefaultItem(getDefaultCategoryId()));
              setNewItem(buildDefaultItem(getDefaultCategoryId()));
              setAdding(true);
            }}
            disabled={categoryMissing}
            className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FiPlus size={18} className="ml-1 inline" /> Add Item
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <FiAlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto font-bold">
            &times;
          </button>
        </div>
      )}

      {categoryMissing && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Inventory categories are required before items can be created.
        </div>
      )}

      {(adding || editingId) && (
        <div className="card mb-4 p-5 sm:p-6">
          <h3 className="mb-6 text-xl font-bold">{adding ? 'Add New Item' : 'Edit Item'}</h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Item Name</label>
              <input
                value={adding ? newItem.name : editingItem.name || ''}
                onChange={(e) =>
                  adding
                    ? setNewItem({ ...newItem, name: e.target.value })
                    : setEditingItem({ ...editingItem, name: e.target.value })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Solar Panel 345W"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">SKU</label>
              <input
                value={adding ? newItem.sku : editingItem.sku || ''}
                onChange={(e) =>
                  adding
                    ? setNewItem({ ...newItem, sku: e.target.value })
                    : setEditingItem({ ...editingItem, sku: e.target.value })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="SP345"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Category</label>
              <select
                value={adding ? newItem.category : editingItem.category || ''}
                onChange={(e) =>
                  adding
                    ? setNewItem({ ...newItem, category: Number(e.target.value) || '' })
                    : setEditingItem({ ...editingItem, category: Number(e.target.value) || '' })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Quantity</label>
              <input
                type="number"
                min="0"
                value={adding ? newItem.quantity : editingItem.quantity}
                onChange={(e) =>
                  adding
                    ? setNewItem({ ...newItem, quantity: parseIntegerInput(e.target.value) })
                    : setEditingItem({ ...editingItem, quantity: parseIntegerInput(e.target.value) })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Status</label>
              <select
                value={adding ? newItem.status : editingItem.status || 'available'}
                onChange={(e) =>
                  adding
                    ? setNewItem({ ...newItem, status: e.target.value })
                    : setEditingItem({ ...editingItem, status: e.target.value })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Min Stock</label>
              <input
                type="number"
                min="0"
                value={adding ? newItem.minimum_stock : editingItem.minimum_stock}
                onChange={(e) =>
                  adding
                    ? setNewItem({ ...newItem, minimum_stock: parseIntegerInput(e.target.value) })
                    : setEditingItem({ ...editingItem, minimum_stock: parseIntegerInput(e.target.value) })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={adding ? addItem : () => updateItem(editingId)}
              className="flex-1 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              {adding ? 'Add Item' : 'Update Item'}
            </button>
            <button
              onClick={() => resetEditor()}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-900">
            Stock Overview ({filteredInventory.length}
            {filteredInventory.length !== totalInventoryCount ? ` of ${totalInventoryCount}` : ''} items)
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {normalizedSearchTerm
              ? `Showing matches for "${searchTerm.trim()}".`
              : `${lowStockCount} low-stock item${lowStockCount === 1 ? '' : 's'} need attention.`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Item
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Category
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  SKU
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quantity
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Available
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Min Stock
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Last Updated
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-8 py-6 text-slate-600">
                    Loading inventory...
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-8 py-6 text-slate-600">
                    {inventory.length === 0 ? 'No inventory items found.' : 'No inventory items match your search.'}
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{item.category_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{item.sku || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-mono text-xl font-bold ${
                          item.quantity === 0
                            ? 'text-red-600'
                            : item.is_low_stock
                              ? 'text-orange-600'
                              : 'text-emerald-600'
                        }`}
                      >
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">{item.available_quantity}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">{item.minimum_stock}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`rounded-full px-4 py-2 text-sm font-semibold ${statusColor(item.status)}`}>
                        {String(item.status || '').replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-500">
                      {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="space-x-2 px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setAdding(false);
                          setEditingId(item.id);
                          setEditingItem(item);
                        }}
                        className="rounded-lg p-2 text-blue-500 transition hover:bg-blue-50 hover:text-blue-700"
                        title="Edit"
                      >
                        <FiEdit3 size={18} />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 hover:text-red-700"
                        title="Delete"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <h4 className="font-semibold">Low Stock Alert</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lowStockItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-sm">
                <div className="font-semibold text-amber-950">{item.name}</div>
                <div className="mt-1 text-xs text-amber-800">
                  Available: <span className="font-semibold">{item.available_quantity}</span>
                  <span className="mx-1.5 text-amber-400">/</span>
                  Min: <span className="font-semibold">{item.minimum_stock}</span>
                  {item.sku ? <span className="ml-2 text-amber-600">SKU {item.sku}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
