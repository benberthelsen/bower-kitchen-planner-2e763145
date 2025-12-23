import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  DollarSign, 
  LogOut,
  ChevronRight,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/jobs', label: 'Jobs', icon: FileText },
  { path: '/admin/customers', label: 'Customers', icon: Users },
  { path: '/admin/prices', label: 'Prices', icon: DollarSign },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

function AdminLayoutInner() {
  const { signOut, user } = useAuth();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">Bower Admin</h1>
          <p className="text-xs text-gray-400 mt-1 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-gray-800 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </Button>
          <Link to="/">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800 mt-2"
            >
              ← Back to Planner
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayoutInner />
    </ProtectedRoute>
  );
}