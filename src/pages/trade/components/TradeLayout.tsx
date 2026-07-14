import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FolderOpen, 
  Package, 
  Settings,
  LogOut,
  Hammer,
  ChevronLeft,
  Menu
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface TradeLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/trade/dashboard' },
  { icon: FolderOpen, label: 'My Jobs', path: '/trade/jobs' },
  { icon: Package, label: 'Product Catalog', path: '/trade/catalog' },
  { icon: Hammer, label: 'Hardware Store', path: '/trade/hardware' },
  { icon: Settings, label: 'Settings', path: '/trade/settings' },
];

export default function TradeLayout({ children }: TradeLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-trade-surface flex">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-trade-navy z-50 flex items-center justify-between px-4">
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-display font-bold text-white">Cabinet Pro</span>
        <div className="w-9" /> {/* Spacer */}
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:sticky top-0 left-0 h-screen bg-trade-navy z-50 transition-all duration-300 flex flex-col",
        sidebarCollapsed ? "w-16" : "w-64",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className={cn(
          "h-16 flex items-center border-b border-white/10",
          sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
        )}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-trade-amber rounded-lg flex items-center justify-center">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="font-display font-bold text-white text-lg">Cabinet Pro</span>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-8 h-8 bg-trade-amber rounded-lg flex items-center justify-center">
              <Package className="h-5 w-5 text-white" />
            </div>
          )}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <ChevronLeft className={cn(
              "h-4 w-4 transition-transform",
              sidebarCollapsed && "rotate-180"
            )} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/trade/dashboard' && location.pathname.startsWith(item.path));
            
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                  sidebarCollapsed && "justify-center",
                  isActive 
                    ? "bg-trade-amber text-white" 
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Section */}
        <div className={cn(
          "border-t border-white/10 p-3",
          sidebarCollapsed && "flex justify-center"
        )}>
          {!sidebarCollapsed ? (
            <div className="space-y-3">
              <div className="px-2 py-1">
                <p className="text-white/50 text-xs">Logged in as</p>
                <p className="text-white text-sm font-medium truncate">
                  {user?.email || 'Trade User'}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleSignOut}
                className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          ) : (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleSignOut}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:pt-0 pt-14 min-h-screen">
        {children}
      </main>
    </div>
  );
}
