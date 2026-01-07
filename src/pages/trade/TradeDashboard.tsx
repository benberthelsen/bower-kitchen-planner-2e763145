import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Pencil, 
  FileText, 
  Clock, 
  CheckCircle2, 
  TrendingUp,
  Search,
  MoreHorizontal,
  Copy,
  Trash2,
  Eye,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import TradeLayout from './components/TradeLayout';

// Mock data for jobs - will be replaced with Supabase data
const mockQuotedJobs = [
  { id: '527714', name: 'Kitchen Renovation', cost: 4528.88, updatedAt: '7th of January 2026 at 04:13 PM', status: 'quoted' },
  { id: '518253', name: 'Modern Kitchen', cost: 1528.88, updatedAt: '21st of November 2025 at 08:42 PM', status: 'quoted' },
  { id: '470560', name: 'Laundry Cabinets', cost: 882.57, updatedAt: '13th of June 2025 at 02:22 PM', status: 'quoted' },
  { id: '463538', name: 'Bathroom Vanity', cost: 445.00, updatedAt: '16th of May 2025 at 03:36 PM', status: 'quoted' },
];

const mockCompletedJobs = [
  { id: '370464', name: 'Smith Kitchen', cost: 9731.59, updatedAt: '25th of March 2025 at 09:30 AM', status: 'completed' },
  { id: '369503', name: 'Johnson Laundry', cost: 10345.37, updatedAt: '25th of March 2025 at 09:29 AM', status: 'completed' },
];

function StatCard({ icon: Icon, label, value, trend }: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number;
  trend?: string;
}) {
  return (
    <div className="bg-trade-surface-elevated rounded-xl p-5 border border-trade-border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="p-2.5 bg-trade-navy/5 rounded-lg">
          <Icon className="h-5 w-5 text-trade-navy" />
        </div>
        {trend && (
          <Badge variant="secondary" className="bg-trade-success/10 text-trade-success border-0 text-xs">
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend}
          </Badge>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-display font-semibold text-trade-navy">{value}</p>
        <p className="text-sm text-trade-muted mt-1">{label}</p>
      </div>
    </div>
  );
}

function JobsTable({ jobs, title, showViewAll = true }: { 
  jobs: typeof mockQuotedJobs; 
  title: string;
  showViewAll?: boolean;
}) {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'quoted':
        return <Badge className="bg-trade-amber/10 text-trade-amber border-0">Quoted</Badge>;
      case 'completed':
        return <Badge className="bg-trade-success/10 text-trade-success border-0">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700 border-0">In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="bg-trade-surface-elevated rounded-xl border border-trade-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-trade-border flex items-center justify-between">
        <h3 className="font-display font-semibold text-trade-navy">{title}</h3>
        {showViewAll && (
          <Button variant="ghost" size="sm" className="text-trade-amber hover:text-trade-amber hover:bg-trade-amber/5">
            View All
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-trade-border">
            <TableHead className="text-trade-muted font-medium">Job ID</TableHead>
            <TableHead className="text-trade-muted font-medium">Job Name</TableHead>
            <TableHead className="text-trade-muted font-medium text-right">Cost (incl. Tax)</TableHead>
            <TableHead className="text-trade-muted font-medium">Last Updated</TableHead>
            <TableHead className="text-trade-muted font-medium">Status</TableHead>
            <TableHead className="text-trade-muted font-medium w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow 
              key={job.id} 
              className="cursor-pointer hover:bg-trade-surface/50 border-trade-border"
              onClick={() => navigate(`/trade/job/${job.id}`)}
            >
              <TableCell className="font-medium text-trade-navy">#{job.id}</TableCell>
              <TableCell>{job.name}</TableCell>
              <TableCell className="text-right font-medium">${job.cost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</TableCell>
              <TableCell className="text-trade-muted text-sm">{job.updatedAt}</TableCell>
              <TableCell>{getStatusBadge(job.status)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/trade/job/${job.id}`); }}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Job
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={(e) => e.stopPropagation()}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TradeDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const userName = user?.email?.split('@')[0] || 'Trade User';
  const greeting = getGreeting();

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-trade-navy">
              {greeting}, <span className="text-trade-amber">{userName}</span>
            </h1>
            <p className="text-trade-muted mt-1">Manage your cabinet orders and quotes</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-muted" />
              <Input 
                placeholder="Search jobs..." 
                className="pl-9 w-64 bg-trade-surface-elevated border-trade-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button 
            onClick={() => navigate('/trade/job/new')}
            className="group flex items-center gap-4 p-5 bg-trade-navy rounded-xl text-white hover:bg-trade-navy-light transition-colors"
          >
            <div className="p-3 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <div className="text-left">
              <span className="font-display font-semibold text-lg block">Create New Job</span>
              <span className="text-white/70 text-sm">Start a new cabinet order</span>
            </div>
          </button>
          
          <button 
            onClick={() => navigate('/trade/job/527714')}
            className="group flex items-center gap-4 p-5 bg-trade-surface-elevated border-2 border-trade-amber/30 rounded-xl hover:border-trade-amber transition-colors"
          >
            <div className="p-3 bg-trade-amber/10 rounded-lg group-hover:bg-trade-amber/20 transition-colors">
              <Pencil className="h-6 w-6 text-trade-amber" />
            </div>
            <div className="text-left">
              <span className="font-display font-semibold text-lg block text-trade-navy">Continue Editing</span>
              <span className="text-trade-muted text-sm">Last Job: #527714</span>
            </div>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={FileText} label="Total Jobs" value={12} trend="+3 this month" />
          <StatCard icon={Clock} label="In Progress" value={4} />
          <StatCard icon={CheckCircle2} label="Completed" value={8} />
          <StatCard icon={TrendingUp} label="Total Value" value="$45,231" trend="+12%" />
        </div>

        {/* Jobs Tables */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <JobsTable jobs={mockQuotedJobs} title="Quoted Jobs" />
          <JobsTable jobs={mockCompletedJobs} title="Completed Jobs" />
        </div>
      </div>
    </TradeLayout>
  );
}
