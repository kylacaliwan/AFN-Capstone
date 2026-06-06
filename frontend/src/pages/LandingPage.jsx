import LandingNavbar from "../components/LandingNavbar";
import Footer from "../components/LandingFooter";
import {
  ShieldCheck,
  Camera,
  Sun,
  Wrench,
  Award,
  Headphones,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <LandingNavbar />

      <main className="pt-20">
        {/* HERO */}
        <section className="max-w-7xl mx-auto px-6">
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="grid lg:grid-cols-2 items-center">
              {/* LEFT CONTENT */}
              <div className="p-10 lg:p-14">
                <span className="text-xs font-semibold text-blue-600 uppercase">
                  Your Partner In
                </span>

                <h1 className="mt-3 text-4xl lg:text-5xl font-bold leading-tight">
                  Solar, CCTV & Aircon
                  <span className="block text-blue-600">
                    Smart Solutions.
                  </span>
                </h1>

                <p className="mt-5 text-gray-600">
                  We provide reliable, high-quality, and energy-efficient
                  solutions for your home and business.
                </p>

                <div className="flex gap-8 mt-8 text-sm">
                  <div>
                    <ShieldCheck className="w-7 h-7 text-blue-600 mb-2" />
                    <p>Energy Efficient</p>
                  </div>

                  <div>
                    <Award className="w-7 h-7 text-blue-600 mb-2" />
                    <p>Trusted Quality</p>
                  </div>

                  <div>
                    <Headphones className="w-7 h-7 text-blue-600 mb-2" />
                    <p>24/7 Support</p>
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button className="btn btn-primary">
                    Get Started
                  </button>

                  <button className="btn btn-outline">
                    Our Services
                  </button>
                </div>
              </div>

              {/* RIGHT IMAGE */}
              <div className="h-full">
                <img
                  src="/hero-bg.png"
                  alt="Solar CCTV Aircon"
                  className="w-full bg-left h-full object-cover"
                />
                
              </div>
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section className="max-w-7xl mx-auto px-6 lg:px-10 mt-6">
          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white rounded-xl shadow p-5 flex gap-4">
              <div className="bg-blue-100 p-3 rounded-lg h-fit">
                <Sun className="text-blue-600" />
              </div>

              <div>
                <h3 className="font-semibold text-lg">
                  Solar Solutions
                </h3>

                <p className="text-sm text-gray-600 mt-2">
                  High-quality solar systems for homes and businesses.
                </p>

                <button className="text-blue-600 text-sm mt-3">
                  Learn More →
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-5 flex gap-4">
              <div className="bg-blue-100 p-3 rounded-lg h-fit">
                <Camera className="text-blue-600" />
              </div>

              <div>
                <h3 className="font-semibold text-lg">
                  CCTV Systems
                </h3>

                <p className="text-sm text-gray-600 mt-2">
                  Advanced surveillance solutions for security.
                </p>

                <button className="text-blue-600 text-sm mt-3">
                  Learn More →
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-5 flex gap-4">
              <div className="bg-blue-100 p-3 rounded-lg h-fit">
                <Wrench className="text-blue-600" />
              </div>

              <div>
                <h3 className="font-semibold text-lg">
                  Aircon Solutions
                </h3>

                <p className="text-sm text-gray-600 mt-2">
                  Energy-efficient cooling systems for comfort.
                </p>

                <button className="text-blue-600 text-sm mt-3">
                  Learn More →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* WHY CHOOSE US */}
        <section className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
          <h2 className="text-3xl font-bold text-center">
            Why Choose Us
          </h2>

          <p className="text-center text-gray-500 mt-2">
            Quality You Can Trust, Service You Can Rely On
          </p>

          <div className="grid md:grid-cols-4 gap-8 mt-10">
            <div className="text-center">
              <Award className="mx-auto text-blue-600 w-10 h-10" />
              <h3 className="font-semibold mt-3">
                Trusted Professionals
              </h3>
            </div>

            <div className="text-center">
              <ShieldCheck className="mx-auto text-blue-600 w-10 h-10" />
              <h3 className="font-semibold mt-3">
                Quality Products
              </h3>
            </div>

            <div className="text-center">
              <Sun className="mx-auto text-blue-600 w-10 h-10" />
              <h3 className="font-semibold mt-3">
                Cost Efficient
              </h3>
            </div>

            <div className="text-center">
              <Headphones className="mx-auto text-blue-600 w-10 h-10" />
              <h3 className="font-semibold mt-3">
                24/7 Support
              </h3>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}