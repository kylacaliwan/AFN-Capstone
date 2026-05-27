import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import { api, getApiErrorMessage } from '../api/core';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';
  const hasResetLink = Boolean(uid && token);

  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!hasResetLink) {
      setError('This password reset link is invalid or incomplete.');
      return;
    }

    if (newPassword !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/users/password_reset_confirm/', {
        uid,
        token,
        new_password: newPassword,
        password_confirm: passwordConfirm,
      });
      setMessage(
        response.data?.message ||
          'Password has been reset successfully. Please sign in with your new password.'
      );
      setNewPassword('');
      setPasswordConfirm('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to reset password with this link.'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-surface-200 bg-white px-4 py-3 text-[15px] shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-between bg-gradient-to-br from-navy-900 via-[#1e3a5f] to-brand-700 p-10 xl:p-14 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="absolute bottom-20 -left-16 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />

        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white shadow-lg">A</div>
            <span className="text-lg font-bold tracking-wide">AFN Portal</span>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <h2 className="text-3xl font-bold leading-tight xl:text-4xl">
            Almost there.<br />Set your new password.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-blue-100/80 xl:text-lg">
            Choose a strong password you haven't used before. You'll be able to sign in with it right away.
          </p>
        </div>

        <p className="text-sm text-blue-200/40">© 2026 AFN Service Management. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-surface-50 px-4 py-8">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">A</div>
            <span className="text-lg font-bold text-slate-800">AFN Portal</span>
          </div>

          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-500">
            <FiLock size={24} />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
          <p className="mt-2 text-[15px] text-slate-500">Choose a new password for your account.</p>

          {!hasResetLink && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              This password reset link is invalid or incomplete.
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass}
                placeholder="Enter your new password"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className={inputClass}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            {message && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
            )}

            <button
              type="submit"
              disabled={loading || !hasResetLink}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-600 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Resetting password...' : 'Reset Password'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            <Link to="/login" className="font-semibold text-brand-500 hover:text-brand-600">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
