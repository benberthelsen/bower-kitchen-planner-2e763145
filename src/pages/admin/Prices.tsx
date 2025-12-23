import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Search, History, AlertCircle, Check } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  item_type: string;
  price: number;
  updated_at: string;
}

interface PriceChange {
  sku: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}

export default function AdminPrices() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PriceChange[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProducts();
    loadPriceHistory();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sku');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const loadPriceHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPriceHistory(data || []);
    } catch (error) {
      console.error('Error loading price history:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvContent = event.target?.result as string;
      parseCSV(csvContent);
    };
    reader.readAsText(file);
  };

  const parseCSV = (content: string) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      toast.error('CSV file is empty or invalid');
      return;
    }

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const skuIndex = headers.findIndex(h => h === 'sku');
    const priceIndex = headers.findIndex(h => h === 'price');
    const nameIndex = headers.findIndex(h => h === 'name');

    if (skuIndex === -1 || priceIndex === -1) {
      toast.error('CSV must have "sku" and "price" columns');
      return;
    }

    const changes: PriceChange[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const sku = values[skuIndex];
      const newPrice = parseFloat(values[priceIndex]);
      const name = nameIndex !== -1 ? values[nameIndex] : '';

      if (!sku || isNaN(newPrice)) continue;

      const existingProduct = products.find(p => p.sku === sku);
      if (existingProduct && existingProduct.price !== newPrice) {
        changes.push({
          sku,
          name: existingProduct.name,
          oldPrice: existingProduct.price,
          newPrice,
        });
      }
    }

    if (changes.length === 0) {
      toast.info('No price changes detected');
    } else {
      setPendingChanges(changes);
    }
  };

  const applyPriceChanges = async () => {
    setUploading(true);
    try {
      const response = await supabase.functions.invoke('import-prices', {
        body: { changes: pendingChanges }
      });

      if (response.error) throw response.error;

      toast.success(`Updated ${pendingChanges.length} prices`);
      setPendingChanges([]);
      loadProducts();
      loadPriceHistory();
    } catch (error) {
      console.error('Error applying prices:', error);
      toast.error('Failed to apply price changes');
    } finally {
      setUploading(false);
    }
  };

  const updateSinglePrice = async (productId: string, newPrice: number) => {
    try {
      const product = products.find(p => p.id === productId);
      if (!product) return;

      const { error } = await supabase
        .from('products')
        .update({ price: newPrice })
        .eq('id', productId);

      if (error) throw error;

      // Log price change
      await supabase.from('price_history').insert({
        product_id: productId,
        old_price: product.price,
        new_price: newPrice,
      });

      toast.success('Price updated');
      loadProducts();
      loadPriceHistory();
    } catch (error) {
      console.error('Error updating price:', error);
      toast.error('Failed to update price');
    }
  };

  const filteredProducts = products.filter(product => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      product.sku.toLowerCase().includes(search) ||
      product.name.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Price Management</h1>
      </div>

      {/* CSV Upload */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Prices from CSV
          </CardTitle>
          <CardDescription>
            Upload a CSV file with columns: sku, price (and optionally name)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Select CSV File
          </Button>

          {/* Pending changes preview */}
          {pendingChanges.length > 0 && (
            <div className="mt-4 border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <span className="font-medium">{pendingChanges.length} price changes to apply</span>
              </div>
              <div className="max-h-48 overflow-auto mb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Old Price</TableHead>
                      <TableHead>New Price</TableHead>
                      <TableHead>Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingChanges.map((change, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{change.sku}</TableCell>
                        <TableCell>{change.name}</TableCell>
                        <TableCell>${change.oldPrice.toFixed(2)}</TableCell>
                        <TableCell>${change.newPrice.toFixed(2)}</TableCell>
                        <TableCell className={change.newPrice > change.oldPrice ? 'text-red-600' : 'text-green-600'}>
                          {change.newPrice > change.oldPrice ? '+' : ''}
                          ${(change.newPrice - change.oldPrice).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2">
                <Button onClick={applyPriceChanges} disabled={uploading}>
                  <Check className="h-4 w-4 mr-2" />
                  Apply Changes
                </Button>
                <Button variant="outline" onClick={() => setPendingChanges([])}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by SKU, name, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-gray-500">No products found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map(product => (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono">{product.sku}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{product.category || product.item_type}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          defaultValue={product.price}
                          className="w-24"
                          onBlur={(e) => {
                            const newPrice = parseFloat(e.target.value);
                            if (!isNaN(newPrice) && newPrice !== product.price) {
                              updateSinglePrice(product.id, newPrice);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {new Date(product.updated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Price History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Price Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {priceHistory.length === 0 ? (
            <p className="text-gray-500">No price changes recorded yet</p>
          ) : (
            <div className="space-y-2">
              {priceHistory.map((change, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <span className="font-mono text-sm">{change.product_id}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500">${change.old_price}</span>
                    <span>→</span>
                    <span className="font-medium">${change.new_price}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(change.changed_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}