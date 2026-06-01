import { Link } from "react-router-dom";

export default function LandingNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md border-b border-slate-200 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/logo1.png"
            alt="AFN Logo"
            className="h-14 w-auto"
          />
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              AFN
            </h1>
            <p className="text-xs text-slate-500">
              Solar • CCTV • Aircon
            </p>
          </div>
        </Link>

        {/* Navigation */}
        <div className="hidden md:flex items-center gap-8 font-medium text-slate-600">
          <Link
            to="/"
            className="hover:text-blue-600 transition"
          >
            Home
          </Link>

          <Link to="/about-us">About Us</Link>

          <Link
            to="/services"
            className="hover:text-blue-600 transition"
          >
            Services
          </Link>

          <Link
            to="/contact"
            className="hover:text-blue-600 transition"
          >
            Contact Us
          </Link>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-lg border border-blue-600 px-5 py-2 text-blue-600 font-medium hover:bg-blue-50 transition"
          >
            Login
          </Link>

          <Link
            to="/register"
            className="rounded-lg bg-blue-600 px-5 py-2 text-white font-medium hover:bg-blue-700 transition shadow-sm"
          >
            Register
          </Link>
        </div>
      </div>
    </nav>
  );
}