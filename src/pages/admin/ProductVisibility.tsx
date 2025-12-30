import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Star, Users, Briefcase, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  category: string | null;
  visible_to_standard: boolean | null;
  visible_to_trade: boolean | null;
  featured: boolean | null;
  display_order: number | null;
}

export default function ProductVisibility() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Record<string, Partial<Product>>>({});

  const { data: products, isLoading } = useQuery({
    queryKey: ['admin-products-visibility'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('microvellum_products')
        .select('id, name, category, visible_to_standard, visible_to_trade, featured, display_order')
        .order('category', { ascending: true })
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as Product[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (changes: Record<string, Partial<Product>>) => {
      const updates = Object.entries(changes).map(([id, data]) => 
        supabase
          .from('microvellum_products')
          .update(data)
          .eq('id', id)
      );
      
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to update ${errors.length} products`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['microvellum-catalog'] });
      setPendingChanges({});
      toast.success('Product visibility updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateProduct = (id: string, field: keyof Product, value: boolean | number) => {
    setPendingChanges(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const getProductValue = (product: Product, field: keyof Product) => {
    if (pendingChanges[product.id]?.[field] !== undefined) {
      return pendingChanges[product.id][field];
    }
    return product[field];
  };

  const handleSaveAll = () => {
    if (Object.keys(pendingChanges).length === 0) {
      toast.info('No changes to save');
      return;
    }
    saveMutation.mutate(pendingChanges);
  };

  const handleBulkAction = (action: 'enableStandard' | 'disableStandard' | 'enableTrade' | 'disableTrade') => {
    if (!products) return;
    
    const filteredProducts = products.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase())
    );
    
    const updates: Record<string, Partial<Product>> = {};
    filteredProducts.forEach(product => {
      switch (action) {
        case 'enableStandard':
          updates[product.id] = { ...pendingChanges[product.id], visible_to_standard: true };
          break;
        case 'disableStandard':
          updates[product.id] = { ...pendingChanges[product.id], visible_to_standard: false };
          break;
        case 'enableTrade':
          updates[product.id] = { ...pendingChanges[product.id], visible_to_trade: true };
          break;
        case 'disableTrade':
          updates[product.id] = { ...pendingChanges[product.id], visible_to_trade: false };
          break;
      }
    });
    
    setPendingChanges(prev => ({ ...prev, ...updates }));
    toast.info(`Marked ${filteredProducts.length} products for update`);
  };

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // Stats
  const stats = {
    total: products?.length || 0,
    visibleToStandard: products?.filter(p => getProductValue(p, 'visible_to_standard')).length || 0,
    visibleToTrade: products?.filter(p => getProductValue(p, 'visible_to_trade')).length || 0,
    featured: products?.filter(p => getProductValue(p, 'featured')).length || 0,
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Product Visibility</h1>
          <p className="text-muted-foreground">
            Control which products are visible to standard and trade customers
          </p>
        </div>
        <Button 
          onClick={handleSaveAll} 
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes {hasChanges && `(${Object.keys(pendingChanges).length})`}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Standard Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.visibleToStandard}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Briefcase className="w-4 h-4" /> Trade Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.visibleToTrade}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Star className="w-4 h-4" /> Featured
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.featured}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Bulk Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            Toggle visibility for each customer type. Featured products appear first for standard users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleBulkAction('enableStandard')}>
                Enable All Standard
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkAction('enableTrade')}>
                Enable All Trade
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="w-4 h-4" /> Standard
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Briefcase className="w-4 h-4" /> Trade
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="w-4 h-4" /> Featured
                      </div>
                    </TableHead>
                    <TableHead className="w-24">Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map(product => (
                    <TableRow 
                      key={product.id}
                      className={pendingChanges[product.id] ? 'bg-yellow-50' : ''}
                    >
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.category || 'Uncategorized'}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={getProductValue(product, 'visible_to_standard') as boolean}
                          onCheckedChange={(checked) => updateProduct(product.id, 'visible_to_standard', checked)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={getProductValue(product, 'visible_to_trade') as boolean}
                          onCheckedChange={(checked) => updateProduct(product.id, 'visible_to_trade', checked)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={getProductValue(product, 'featured') as boolean}
                          onCheckedChange={(checked) => updateProduct(product.id, 'featured', checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={getProductValue(product, 'display_order') as number || 999}
                          onChange={(e) => updateProduct(product.id, 'display_order', parseInt(e.target.value) || 999)}
                          className="w-20 h-8"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
