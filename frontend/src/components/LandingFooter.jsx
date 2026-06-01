export default function LandingFooter() {
  return (
    <footer className="bg-blue-900 text-white">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10 flex flex-col lg:flex-row justify-between items-center gap-6">
            <div>
              <h2 className="text-3xl font-bold">
                Ready to Upgrade Your Home or Business?
              </h2>

              <p className="mt-2 text-blue-100">
                Get a free consultation and discover the best solution.
              </p>
            </div>

            <div className="flex gap-4">
              <button className="btn btn-primary">
                Get a Free Quote
              </button>

              <button className="btn btn-outline text-white border-white hover:text-black">
                Contact Us
              </button>
            </div>
          </div>
        </footer>
  );
}