import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import AuthShell from '../components/AuthShell';
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

  const inputClass =
    'w-full rounded-[7px] border border-[#5f9caf] bg-[#f3f3f3] px-3 py-3 text-[18px] text-slate-800 outline-none transition placeholder:text-[#a7a7a7] focus:border-[#2382bd] focus:bg-white focus:ring-2 focus:ring-[#2f9bff]/15';

  return (
    <AuthShell backgroundImage="/login-bg.jpg">
      <div className="animate-fade-in">
        <img
          src="/logo.png"
          alt="AFN Solar Power Engineering Services"
          className="mx-auto h-auto w-[170px]"
        />

        <h1 className="mt-10 text-center font-serif text-[30px] font-bold uppercase text-[#1f7ebc]">
          Sign In
        </h1>

        {error && (
          <div className="mt-6 rounded-[7px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
            placeholder="Username"
            aria-label="Username or email"
            autoComplete="username"
            required
          />

          <div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-12`}
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
            <div className="mt-2 text-right">
              <Link to="/forgot-password" className="font-serif text-[17px] font-bold text-[#1f7ebc] hover:text-[#145985]">
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-7 flex w-full items-center justify-center rounded-[7px] bg-[#1f7ebc] py-3 font-serif text-[27px] font-bold leading-none text-white shadow-sm transition hover:bg-[#16699f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center gap-2 text-[18px]">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="mt-7 text-center font-serif text-[26px] font-bold text-[#333]">
          Don't have an account?{' '}
          <Link to="/register" className="text-[#12357b] hover:text-[#1f7ebc]">
            Create account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
