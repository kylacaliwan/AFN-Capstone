import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

    const result = await register({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      password_confirm: formData.password_confirm,
      first_name: formData.first_name,
      last_name: formData.last_name,
      phone: formData.phone,
      address: formData.address,
      role: 'client',
    });

    setLoading(false);

    if (!result || !result.success) {
      setError(result?.message || 'Registration failed. Please try again.');
      return;
    }

    navigate('/client/dashboard', { replace: true });
  };

  const inputClass =
    'w-full rounded-[7px] border border-[#5f9caf] bg-[#f3f3f3] px-3 py-3 text-[18px] text-slate-800 outline-none transition placeholder:text-[#a7a7a7] focus:border-[#2382bd] focus:bg-white focus:ring-2 focus:ring-[#2f9bff]/15';

  return (
    <AuthShell backgroundImage="/register-bg.jpg">
      <div className="animate-fade-in">
        <img
          src="/logo.png"
          alt="AFN Solar Power Engineering Services"
          className="mx-auto h-auto w-[170px]"
        />

        <h1 className="mt-10 text-center font-serif text-[30px] font-bold uppercase text-[#1f7ebc]">
          Create Account
        </h1>

        {error && (
          <div className="mt-6 rounded-[7px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            className={inputClass}
            placeholder="Username"
            aria-label="Username"
            autoComplete="username"
            required
          />

          <input
            type="text"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            className={inputClass}
            placeholder="Firstname"
            aria-label="First name"
            autoComplete="given-name"
          />

          <input
            type="text"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            className={inputClass}
            placeholder="Lastname"
            aria-label="Last name"
            autoComplete="family-name"
          />

          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={inputClass}
            placeholder="Email Address"
            aria-label="Email address"
            autoComplete="email"
            required
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={inputClass}
              placeholder="Phone"
              aria-label="Phone"
              autoComplete="tel"
            />
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className={inputClass}
              placeholder="Address"
              aria-label="Address"
              autoComplete="street-address"
            />
          </div>

          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className={inputClass}
            placeholder="Password"
            aria-label="Password"
            autoComplete="new-password"
            required
          />

          <input
            type="password"
            name="password_confirm"
            value={formData.password_confirm}
            onChange={handleChange}
            className={inputClass}
            placeholder="Confirm password"
            aria-label="Confirm password"
            autoComplete="new-password"
            required
          />

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
                Creating account...
              </span>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="mt-7 text-center font-serif text-[26px] font-bold text-[#333]">
          Already have an account?{' '}
          <Link to="/login" className="text-[#12357b] hover:text-[#1f7ebc]">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
