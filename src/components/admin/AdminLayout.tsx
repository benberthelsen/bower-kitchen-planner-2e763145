import React, { useState } from 'react';
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
  ChevronDown,
  Settings,
  Layers,
  Wrench,
  Box,
  RectangleHorizontal,
  Gem,
  DoorOpen,
  Clock,
  Percent,
  FileCode,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/jobs', label: 'Jobs', icon: FileText },
  { path: '/admin/customers', label: 'Customers', icon: Users },
  { path: '/admin/products', label: 'Product Visibility', icon: Box },
  { path: '/admin/prices', label: 'Legacy Prices', icon: DollarSign },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
  { path: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
];

const pricingItems = [
  { path: '/admin/pricing/parts', label: 'Parts', icon: Layers },
  { path: '/admin/pricing/hardware', label: 'Hardware', icon: Wrench },
  { path: '/admin/pricing/materials', label: 'Materials', icon: Box },
  { path: '/admin/pricing/edges', label: 'Edges', icon: RectangleHorizontal },
  { path: '/admin/pricing/stone', label: 'Stone', icon: Gem },
  { path: '/admin/pricing/doors', label: 'Doors/Drawers', icon: DoorOpen },
  { path: '/admin/pricing/labor', label: 'Labor Rates', icon: Clock },
  { path: '/admin/pricing/markups', label: 'Client Markups', icon: Percent },
  { path: '/admin/pricing/dxf-import', label: 'DXF Import', icon: FileCode },
];

function AdminLayoutInner() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [pricingOpen, setPricingOpen] = useState(
    location.pathname.startsWith('/admin/pricing')
  );

  const handleSignOut = async () => {
    await signOut();
  };

  const isActivePath = (path: string) => location.pathname === path;
  const isPricingActive = location.pathname.startsWith('/admin/pricing');

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">Bower Admin</h1>
          <p className="text-xs text-gray-400 mt-1 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = isActivePath(item.path);
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

          {/* Pricing Submenu */}
          <Collapsible open={pricingOpen} onOpenChange={setPricingOpen}>
            <CollapsibleTrigger asChild>
              <button
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isPricingActive 
                    ? 'bg-gray-800 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <DollarSign className="h-5 w-5" />
                <span>Pricing</span>
                {pricingOpen ? (
                  <ChevronDown className="ml-auto h-4 w-4" />
                ) : (
                  <ChevronRight className="ml-auto h-4 w-4" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 mt-1 space-y-1">
              {pricingItems.map(item => {
                const isActive = isActivePath(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                      isActive 
                        ? 'bg-gray-800 text-white' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
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