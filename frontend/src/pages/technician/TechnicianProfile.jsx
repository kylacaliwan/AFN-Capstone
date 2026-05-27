import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import { fetchTechnicianProfile, updateTechnicianProfile } from '../../api/api';

const inputClass = 'w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

export default function TechnicianProfile() {
  const { user } = useAuth();
  const techName = user?.username || 'Technician';
  const [profile, setProfile] = useState({
    phone: '',
    email: '',
    skills: [],
    totalCompleted: 0,
    avgCompletionTime: '',
    rating: 0
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const data = await fetchTechnicianProfile(techName);
    setProfile(data);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('Saving profile...');
    try {
      await updateTechnicianProfile({ techName, updates: { phone: profile.phone } });
      setEditing(false);
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save profile.');
    }
    setSaving(false);
  };

  const skills = Array.isArray(profile.skills) ? profile.skills : [];

  return (
    <Layout>
      <div className="card mb-4 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
        <p className="mt-1 text-sm text-slate-500">Manage your account and view performance metrics.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 sm:p-6 lg:col-span-2">
          <div className="mb-8 flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-xl font-bold text-white shadow-sm">
              {techName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{techName}</h3>
              <p className="text-sm text-slate-500">{profile.status || 'Active'}</p>
            </div>
          </div>

          <div className="mb-8 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Phone Number</label>
              {editing ? (
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  className={inputClass}
                  placeholder="Enter phone number"
                />
              ) : (
                <div className="text-xl font-semibold text-slate-900">{profile.phone || 'Not set'}</div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900">Email</label>
              <div className="text-lg text-slate-700">{profile.email || 'Not set'}</div>
            </div>
          </div>

          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-900">Skills</label>
              <span className="text-xs font-medium text-slate-500">Managed by admin</span>
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {skills.length > 0 ? (
                skills.map((skill, index) => (
                  <div key={skill.id || index} className="flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 ring-1 ring-brand-100">
                    <span>{skill.service_type_name || skill}</span>
                    {skill.skill_level && <span className="text-xs opacity-75">({skill.skill_level})</span>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No skills assigned yet</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-5 text-center">
              <div className="mb-1 text-2xl font-bold text-emerald-600">{profile.totalCompleted || 0}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Jobs</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-5 text-center">
              <div className="mb-1 text-2xl font-bold text-brand-600">{profile.avgCompletionTime || 'N/A'}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Time</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-5 text-center">
              <div className={`mb-1 text-2xl font-bold ${profile.rating >= 4 ? 'text-amber-500' : 'text-slate-400'}`}>
                {profile.rating ? profile.rating.toFixed(1) : 'N/A'}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rating</div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row">
            <button
              onClick={() => setEditing(!editing)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-50"
              disabled={saving}
            >
              {editing ? 'Cancel' : 'Edit Phone'}
            </button>
            {editing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            )}
          </div>

          {message && (
            <div className={`mt-6 rounded-xl p-4 text-center text-sm font-semibold ${
              message.includes('success')
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-red-200 bg-red-50 text-red-800'
            }`}>
              {message}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h4 className="mb-4 text-lg font-semibold text-slate-900">Last 30 Days</h4>
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Jobs Completed</span>
                <span className="text-xl font-bold text-slate-900">{profile.totalCompleted || 0}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Avg Rating</span>
                <span className="font-semibold text-slate-900">{profile.rating ? `${profile.rating.toFixed(1)}/5` : 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h4 className="mb-4 text-center font-semibold text-slate-900">Skill Summary</h4>
            <div className="space-y-2">
              <p className="text-center text-sm text-slate-600">
                Total Skills: <span className="font-bold text-slate-900">{skills.length}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
