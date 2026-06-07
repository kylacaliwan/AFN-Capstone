import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../../context/AuthContext';

export default function Layout({ children }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen bg-brand-900 p-2">
      <div className="h-full overflow-hidden rounded-[18px] bg-gradient-to-br from-brand-100 via-slate-50 to-brand-200 lg:flex">
        <Sidebar
          user={user}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="ml-64 flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            toggleSidebar={() => setSidebarOpen((value) => !value)}
          />

          <main className="flex-1 overflow-y-auto px-3 pb-4 pt-2 sm:px-5 md:px-6 lg:px-12 lg:pb-8">
            <div className="mx-auto w-full max-w-[1600px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}