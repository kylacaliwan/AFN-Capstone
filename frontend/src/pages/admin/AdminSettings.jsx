import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { fetchAdminSettings, fetchSlaRules, updateAdminSettings, updateSlaRule } from '../../api/api';

const inputClass = 'mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const tableInputClass = 'block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const toggleClass = 'h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500';

export default function AdminSettings() {
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [settings, setSettings] = useState({
    systemName: '',
    supportEmail: '',
    enableNotifications: false,
    autoDispatchEnabled: false,
    smsNotificationsEnabled: false,
    defaultTimeZone: browserTimeZone,
    maxTechnicianAssignments: 5
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [slaRules, setSlaRules] = useState([]);
  const [slaSaving, setSlaSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchAdminSettings(), fetchSlaRules()])
      .then(([settingsData, rulesData]) => {
        setSettings(prev => ({ ...prev, ...settingsData }));
        setSlaRules(rulesData);
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Unable to load settings.');
      });
  }, []);

  const save = async () => {
    try {
      await updateAdminSettings(settings);
      setMessage('Settings updated.');
      setError('');
    } catch (err) {
      setMessage('');
      setError(err.message || 'Unable to update settings.');
    }
  };

  const saveSlaRules = async () => {
    const invalidRule = slaRules.find((rule) => Number(rule.warning_minutes) >= Number(rule.overdue_minutes));
    if (invalidRule) {
      setMessage('');
      setError(`${invalidRule.label || invalidRule.key}: warning minutes must be less than overdue minutes.`);
      return;
    }

    try {
      setSlaSaving(true);
      await Promise.all(
        slaRules.map((rule) =>
          updateSlaRule(rule.id, {
            warning_minutes: Number(rule.warning_minutes),
            overdue_minutes: Number(rule.overdue_minutes),
            is_active: Boolean(rule.is_active),
            notes: rule.notes || ''
          })
        )
      );
      setMessage('SLA rules updated.');
      setError('');
    } catch (err) {
      setMessage('');
      setError(err.message || 'Unable to update SLA rules.');
    } finally {
      setSlaSaving(false);
    }
  };

  const updateLocalSlaRule = (id, updates) => {
    setSlaRules((rules) => rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  return (
    <Layout>
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">System Preferences</h2>
        <p className="mt-1 text-sm text-slate-500">Control global defaults for notifications, dispatch, and service capacity.</p>
      </section>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="card mt-4 p-5 sm:p-6">
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">System Name</span>
            <input value={settings.systemName || ''} onChange={(e) => setSettings({ ...settings, systemName: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Support Email</span>
            <input value={settings.supportEmail || ''} onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Default Time Zone</span>
            <input value={settings.defaultTimeZone || browserTimeZone} onChange={(e) => setSettings({ ...settings, defaultTimeZone: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Max Technician Assignments</span>
            <input type="number" value={settings.maxTechnicianAssignments || 5} onChange={(e) => setSettings({ ...settings, maxTechnicianAssignments: parseInt(e.target.value) })} className={inputClass} />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={settings.enableNotifications || false} onChange={(e) => setSettings({ ...settings, enableNotifications: e.target.checked })} className={toggleClass} />
            <span className="text-sm font-medium text-slate-700">Enable Notifications</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={settings.autoDispatchEnabled || false} onChange={(e) => setSettings({ ...settings, autoDispatchEnabled: e.target.checked })} className={toggleClass} />
            <span className="text-sm font-medium text-slate-700">Enable Auto Dispatch</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={settings.smsNotificationsEnabled || false} onChange={(e) => setSettings({ ...settings, smsNotificationsEnabled: e.target.checked })} className={toggleClass} />
            <span className="text-sm font-medium text-slate-700">Enable SMS Notifications</span>
          </label>
        </div>
        <button className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600" onClick={save}>Save Settings</button>
        {message && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">SLA Rules</h2>
          <p className="mt-1 text-sm text-slate-500">Configure warning and overdue windows used by dashboards, ticket queues, and reports.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Rule</th>
                <th className="px-3 py-3">Warning Minutes</th>
                <th className="px-3 py-3">Overdue Minutes</th>
                <th className="px-3 py-3">Active</th>
                <th className="px-3 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {slaRules.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-semibold text-slate-900">{rule.label || rule.key}</td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="1"
                      value={rule.warning_minutes}
                      onChange={(event) => updateLocalSlaRule(rule.id, { warning_minutes: event.target.value })}
                      className={tableInputClass}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="1"
                      value={rule.overdue_minutes}
                      onChange={(event) => updateLocalSlaRule(rule.id, { overdue_minutes: event.target.value })}
                      className={tableInputClass}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(rule.is_active)}
                      onChange={(event) => updateLocalSlaRule(rule.id, { is_active: event.target.checked })}
                      className={toggleClass}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      value={rule.notes || ''}
                      onChange={(event) => updateLocalSlaRule(rule.id, { notes: event.target.value })}
                      className={tableInputClass}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          onClick={saveSlaRules}
          disabled={slaSaving}
        >
          {slaSaving ? 'Saving SLA Rules...' : 'Save SLA Rules'}
        </button>
      </div>
    </Layout>
  );
}
