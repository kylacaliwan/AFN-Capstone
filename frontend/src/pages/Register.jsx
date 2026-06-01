import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    password_confirm: '',
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    role: 'client',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!formData.username || !formData.email || !formData.password) {
      setError('Username, email, and password are required');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.password_confirm) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const result = await register({ ...formData, role: 'client' });
      setLoading(false);

      if (!result || !result.success) {
        setError(result?.message || 'Registration failed.');
        return;
      }

      navigate('/client/dashboard', { replace: true });
    } catch (err) {
      setLoading(false);
      setError('Something went wrong.');
    }
  };

  const inputClass =
    'w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-[12px] shadow-sm transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <div className="flex min-h-screen">

      <div
        className="hidden lg:flex lg:w-[45%] xl:w-[70%] flex-col justify-between 
        bg-[url('/register-bg.jpg')] bg-cover bg-left 
        p-10 xl:p-8 text-white relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-black/70 z-0" />

        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="absolute bottom-20 -left-16 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between h-full">
          {/* Logo */}
          <div className="flex items-end gap-2">
            <img src="/logo1.png" alt="AFN Logo" className="h-18 w-20" />
            <span className="text-2xl font-bold tracking-wide">|AFN Portal</span>
          </div>

          {/* Content */}
          <div className="max-w-lg">
            <h2 className="text-3xl font-bold leading-tight xl:text-4xl">
              Join as a client<br />in seconds.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/80 xl:text-lg">
              Create your account to start submitting service requests and tracking progress in real time.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-6">
              <div>
                <div className="text-2xl font-bold">Fast</div>
                <div className="text-sm text-white/70 mt-1">Signup</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Easy</div>
                <div className="text-sm text-white/70 mt-1">Requests</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Live</div>
                <div className="text-sm text-white/70 mt-1">Tracking</div>
              </div>
            </div>
          </div>

          <p className="text-sm text-white/70">
            © 2026 AFN Service Management. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel (MATCHED spacing & typography) */}
      <div className="flex flex-1 justify-center bg-surface-50 px-10 py-10 pt-20">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">
              A
            </div>
            <span className="text-lg font-bold text-slate-800">AFN Portal</span>
          </div>

          <h1 className="text-3xl font-bold text-blue-900">Create account</h1>
          <p className="mt-2 text-[12px] text-slate-500">
            Fill in your details to get started.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Username + Email */}
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="username" value={formData.username} onChange={handleChange} className={inputClass} placeholder="Username *" required />
              <input type="email" name="email" value={formData.email} onChange={handleChange} className={inputClass} placeholder="Email *" required />
            </div>

            {/* Name */}
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="first_name" value={formData.first_name} onChange={handleChange} className={inputClass} placeholder="First name" />
              <input name="last_name" value={formData.last_name} onChange={handleChange} className={inputClass} placeholder="Last name" />
            </div>

            {/* Contact */}
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="phone" value={formData.phone} onChange={handleChange} className={inputClass} placeholder="Phone" />
              <input name="address" value={formData.address} onChange={handleChange} className={inputClass} placeholder="Address" />
            </div>

            {/* Password */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={`${inputClass} pr-12`}
                placeholder="Password *"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-4 text-slate-400">
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                name="password_confirm"
                value={formData.password_confirm}
                onChange={handleChange}
                className={`${inputClass} pr-12`}
                placeholder="Confirm password *"
                required
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute inset-y-0 right-0 px-4 text-slate-400">
                {showConfirm ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? 'Creating...' : <>Create Account <FiArrowRight size={16} /></>}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-500 hover:text-brand-600">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}