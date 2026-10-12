import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { buildTradeCandidates, type TradeCandidate } from '@/lib/tradeCandidates';
import { toast } from 'sonner';
import { Search, Mail, Phone } from 'lucide-react';

interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  company_name: string;
  user_type: string;
  created_at: string;
  job_count?: number;
  total_spent?: number;
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tradeCandidates, setTradeCandidates] = useState<TradeCandidate[]>([]);
  const [tradeListError, setTradeListError] = useState(false);
  const [pendingTradeId, setPendingTradeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get job stats for each customer
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('customer_id, cost_incl_tax, created_at, updated_at');

      const jobStats = new Map<string, { count: number; total: number }>();
      jobs?.forEach(job => {
        const existing = jobStats.get(job.customer_id) || { count: 0, total: 0 };
        jobStats.set(job.customer_id, {
          count: existing.count + 1,
          total: existing.total + (parseFloat(String(job.cost_incl_tax)) || 0)
        });
      });

      const customersWithStats = profiles?.map(p => ({
        ...p,
        job_count: jobStats.get(p.id)?.count || 0,
        total_spent: jobStats.get(p.id)?.total || 0,
      })) || [];

      setCustomers(customersWithStats);

      // Trade approval list: roles (to leave staff out) and current approvals.
      // trade_accounts is newer than the generated types. Without the jobs
      // the job owners could not be told apart, so that is an error too.
      const [rolesResult, tradeResult] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        (supabase as any).from('trade_accounts').select('user_id, approved_at'),
      ]);
      if (jobsError || rolesResult.error || tradeResult.error) {
        setTradeListError(true);
        setTradeCandidates([]);
      } else {
        setTradeListError(false);
        setTradeCandidates(buildTradeCandidates(profiles ?? [], jobs ?? [], rolesResult.data ?? [],
          tradeResult.data ?? []));
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const setTradeApproval = (userId: string, approvedAt: string | null) => {
    setTradeCandidates(current => current.map(candidate => candidate.profile.id === userId
      ? { ...candidate, approved: approvedAt !== null, approvedAt }
      : candidate));
  };

  const approveTrade = async (candidate: TradeCandidate) => {
    setPendingTradeId(candidate.profile.id);
    try {
      // approved_by defaults to the signed-in admin; RLS requires it to match.
      const { data, error } = await (supabase as any)
        .from('trade_accounts')
        .insert({ user_id: candidate.profile.id })
        .select('approved_at')
        .single();
      if (error) throw error;
      setTradeApproval(candidate.profile.id, data?.approved_at ?? new Date().toISOString());
      toast.success(`Approved ${candidate.profile.email || 'account'} for trade`);
    } catch (error) {
      console.error('Error approving trade account:', error);
      toast.error('Could not approve this account');
    } finally {
      setPendingTradeId(null);
    }
  };

  const revokeTrade = async (candidate: TradeCandidate) => {
    if (!confirm(`Revoke trade approval for ${candidate.profile.email || 'this account'}?`)) return;
    setPendingTradeId(candidate.profile.id);
    try {
      // RLS turns a refused delete into "no rows", so check one was removed.
      const { data, error } = await (supabase as any)
        .from('trade_accounts')
        .delete()
        .eq('user_id', candidate.profile.id)
        .select('user_id');
      if (error) throw error;
      if (!data?.length) throw new Error('trade approval was not removed');
      setTradeApproval(candidate.profile.id, null);
      toast.success(`Revoked trade approval for ${candidate.profile.email || 'account'}`);
    } catch (error) {
      console.error('Error revoking trade account:', error);
      toast.error('Could not revoke this approval');
    } finally {
      setPendingTradeId(null);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      customer.full_name?.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.company_name?.toLowerCase().includes(search)
    );
  });

  const getUserTypeBadge = (type: string) => {
    return type === 'trade' 
      ? 'bg-blue-100 text-blue-700' 
      : 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-gray-500">{customers.length} total customers</p>
      </div>

      {/* Trade approval: decided per account by an admin; nothing starts approved. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Trade access</CardTitle>
          <p className="text-sm text-gray-500">
            Approve the accounts that should be treated as trade. Accounts that own jobs are listed
            first. Staff and admin accounts already count as trade and are not listed. Approving does
            not change what an account can see yet.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : tradeListError ? (
            <p className="text-sm text-red-600">The trade approval list could not be loaded.</p>
          ) : tradeCandidates.length === 0 ? (
            <p className="text-gray-500">No accounts to review</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Signed up as</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead>First job</TableHead>
                    <TableHead>Last job activity</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Trade</TableHead>
                    <TableHead><span className="sr-only">Action</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeCandidates.map(candidate => (
                    <TableRow key={candidate.profile.id}>
                      <TableCell>
                        <div className="font-medium">{candidate.profile.full_name || 'Unnamed'}</div>
                        <div className="text-xs text-gray-500">{candidate.profile.email}</div>
                        {candidate.profile.company_name && (
                          <div className="text-xs text-gray-500">{candidate.profile.company_name}</div>
                        )}
                      </TableCell>
                      <TableCell>{candidate.profile.user_type || 'consumer'}</TableCell>
                      <TableCell className="text-right">{candidate.jobCount}</TableCell>
                      <TableCell>{formatDate(candidate.firstJobAt)}</TableCell>
                      <TableCell>{formatDate(candidate.lastJobAt)}</TableCell>
                      <TableCell>{formatDate(candidate.profile.created_at)}</TableCell>
                      <TableCell>
                        {candidate.approved ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Approved {formatDate(candidate.approvedAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">Not approved</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {candidate.approved ? (
                          <Button size="sm" variant="outline" disabled={pendingTradeId !== null}
                            onClick={() => revokeTrade(candidate)}>
                            Revoke
                          </Button>
                        ) : (
                          <Button size="sm" disabled={pendingTradeId !== null}
                            onClick={() => approveTrade(candidate)}>
                            Approve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search customers by name, email, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Customers Grid */}
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : filteredCustomers.length === 0 ? (
        <p className="text-gray-500">No customers found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map(customer => (
            <Card key={customer.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-medium text-lg">{customer.full_name || 'Unnamed'}</h3>
                    <p className="text-sm text-gray-500">{customer.company_name}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getUserTypeBadge(customer.user_type)}`}>
                    {customer.user_type || 'consumer'}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="h-4 w-4" />
                    <span>{customer.email}</span>
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-4 w-4" />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{customer.job_count}</p>
                    <p className="text-xs text-gray-500">Jobs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">${customer.total_spent?.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Total Spent</p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-gray-400">
                  Joined {new Date(customer.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}