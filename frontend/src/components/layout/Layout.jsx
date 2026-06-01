import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../../context/AuthContext';

export default function Layout({ children }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-900 p-2">
      <div className="min-h-[calc(100vh-1rem)] overflow-hidden rounded-[18px] bg-gradient-to-br from-brand-100 via-slate-50 to-brand-200 lg:flex">
        <Sidebar user={user} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="min-w-0 flex-1 flex flex-col ml-64">
          <Topbar toggleSidebar={() => setSidebarOpen((value) => !value)} />
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 pb-4 pt-2 sm:px-5 md:px-6 lg:px-12 lg:pb-8 lg:pt-2">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
