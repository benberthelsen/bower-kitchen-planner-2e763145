import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
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

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
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
      const { data: jobs } = await supabase
        .from('jobs')
        .select('customer_id, cost_incl_tax');

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
    } catch (error) {
      console.error('Error loading customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
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