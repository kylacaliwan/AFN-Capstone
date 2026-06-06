import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password);
      setLoading(false);

      if (!result || typeof result !== 'object') {
        setError('Login service error. Please try again.');
        return;
      }

      if (!result.success) {
        setError(result.message || 'Login failed. Please try again.');
        return;
      }
    } catch (err) {
      setLoading(false);
      setError('An unexpected error occurred. Please try again.');
      return;
    }

    const storedUser = JSON.parse(localStorage.getItem('afn_user') || '{}');
    navigate(storedUser?.role ? '/' : '/');
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[70%] flex-col justify-between 
      bg-[url('/login-bg.png')] bg-cover bg-left 
      p-10 xl:p-8 text-white relative overflow-hidden">

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/70 z-0" />

        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="absolute bottom-20 -left-16 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col justify-between h-full">

          {/* Top logo */}
          <Link
            to="/"
            className="inline-flex items-end gap-2 transition-opacity hover:opacity-80"
          >
            <img
              src="/logo1.png"
              alt="AFN Logo"
              className="h-18 w-20"
            />
            <span className="text-2xl font-bold tracking-wide">
              |AFN Portal
            </span>
          </Link>

          {/* Middle content */}
          <div className="max-w-lg">
            <h2 className="text-3xl font-bold leading-tight xl:text-4xl">
              Service management<br />made clear.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/80 xl:text-lg">
              Track service requests, dispatch technicians, and keep your customers informed — all from one streamlined platform.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-6">
              <div>
                <div className="text-2xl font-bold text-white">24/7</div>
                <div className="mt-1 text-sm text-white/70">Service tracking</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">Live</div>
                <div className="mt-1 text-sm text-white/70">GPS dispatch</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">Smart</div>
                <div className="mt-1 text-sm text-white/70">SLA monitoring</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-sm text-white/70">
            © 2026 AFN Service Management. All rights reserved.
          </p>

        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1  justify-center bg-surface-50 px-10 py-10 pt-20">
        <div className="w-full max-w-[420px] animate-fade-in">

          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">
              A
            </div>
            <span className="text-lg font-bold text-slate-800">AFN Portal</span>
          </div>

          <h1 className="text-3xl font-bold text-blue-900">Welcome back</h1>
          <p className="mt-2 text-[12px] text-slate-500">
            Sign in with your username or email to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Username or Email
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-[12px] shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Enter your username or email"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-[12px] pr-12 shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((c) => !c)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-slate-600"
                >
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>

              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-xs font-medium text-brand-500 hover:text-brand-600">
                  Forgot password?
                </Link>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-600 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.3 0 0 5.3 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                <>
                  Sign In
                  <FiArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-brand-500 hover:text-brand-600">
              Create account
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}