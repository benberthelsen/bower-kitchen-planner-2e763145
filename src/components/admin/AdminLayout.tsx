import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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
  FileSpreadsheet,
  Inbox,
  BarChart2,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/leads', label: 'Leads', icon: Inbox },
  { path: '/admin/jobs', label: 'Jobs', icon: FileText },
  { path: '/admin/analytics', label: 'Analytics', icon: BarChart2 },
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
  { path: '/admin/pricing/stone', label: 'Benchtops', icon: Gem },
  { path: '/admin/pricing/doors', label: 'Doors/Drawers', icon: DoorOpen },
  { path: '/admin/pricing/labor', label: 'Labor Rates', icon: Clock },
  { path: '/admin/pricing/markups', label: 'Client Markups', icon: Percent },
  { path: '/admin/pricing/dxf-import', label: 'DXF Import', icon: FileCode },
  { path: '/admin/pricing/supplier-import', label: 'Supplier Import', icon: Upload },
  { path: '/admin/pricing/supplier-feeds', label: 'Supplier Feeds', icon: RefreshCw },
];

function AdminLayoutInner() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [pricingOpen, setPricingOpen] = useState(
    location.pathname.startsWith('/admin/pricing')
  );
  const [leadCount, setLeadCount] = useState(0);

  // Fetch unread lead count on mount and whenever we navigate to the admin
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'enquiry')
      .then(({ count }) => {
        if (!cancelled) setLeadCount(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [location.pathname]);

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
            const badge = item.path === '/admin/leads' && leadCount > 0 ? leadCount : null;
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
                {badge != null && (
                  <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {isActive && badge == null && <ChevronRight className="ml-auto h-4 w-4" />}
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