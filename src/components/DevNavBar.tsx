import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutDashboard, PenTool, Briefcase } from "lucide-react";

const DevNavBar = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { path: "/admin", label: "Admin Dashboard", icon: LayoutDashboard },
    { path: "/", label: "Simple Planner", icon: PenTool, exact: true },
    { path: "/trade", label: "Trade Planner", icon: Briefcase },
  ];

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return currentPath === path;
    return currentPath.startsWith(path);
  };

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center gap-4 shadow-md z-50">
      <span className="bg-amber-700 text-amber-100 text-xs font-bold px-2 py-1 rounded">
        DEV
      </span>
      <div className="flex gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path, item.exact);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-md font-medium text-sm transition-colors",
                active
                  ? "bg-amber-900 text-amber-100"
                  : "bg-amber-400 hover:bg-amber-600 hover:text-amber-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default DevNavBar;
