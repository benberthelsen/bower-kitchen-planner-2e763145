import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';

interface MicrovellumProduct {
  id: string;
  microvellum_link_id: string;
  name: string;
  category: string;
  cabinet_type: string;
  default_width: number;
  default_depth: number;
  default_height: number;
  door_count: number;
  drawer_count: number;
  is_corner: boolean;
  is_sink: boolean;
  is_blind: boolean;
  spec_group: string;
  created_at: string;
}

interface ImportResult {
  success: boolean;
  imported?: number;
  categoryCounts?: Record<string, number>;
  message?: string;
  error?: string;
}

export default function MicrovellumImport() {
  const [products, setProducts] = useState<MicrovellumProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('microvellum_products')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xml')) {
      toast.error('Please select an XML file');
      return;
    }

    setImporting(true);
    try {
      const xmlContent = await file.text();
      console.log('File loaded, length:', xmlContent.length);

      const { data, error } = await supabase.functions.invoke('import-microvellum', {
        body: { xmlContent }
      });

      if (error) throw error;

      const result = data as ImportResult;
      if (result.success) {
        toast.success(result.message || `Imported ${result.imported} products`);
        if (result.categoryCounts) {
          console.log('Category breakdown:', result.categoryCounts);
        }
        await loadProducts();
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import products');
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const clearAllProducts = async () => {
    if (!confirm('Are you sure you want to delete all imported products?')) return;

    try {
      const { error } = await supabase
        .from('microvellum_products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
      toast.success('All products deleted');
      setProducts([]);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete products');
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Base': return 'default';
      case 'Wall': return 'secondary';
      case 'Tall': return 'outline';
      default: return 'destructive';
    }
  };

  const categories = ['all', ...new Set(products.map(p => p.category))];
  
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.microvellum_link_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryCounts = products.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Microvellum Product Import</h1>
          <p className="text-muted-foreground">Import cabinet definitions from Microvellum Excel XML export</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadProducts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {products.length > 0 && (
            <Button variant="destructive" onClick={clearAllProducts}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import from XML
          </CardTitle>
          <CardDescription>
            Upload a Microvellum Product List export in Excel XML format (.xls.xml)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              type="file"
              accept=".xml"
              onChange={handleFileSelect}
              disabled={importing}
              className="max-w-md"
            />
            {importing && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Importing...</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 pt-2 border-t">
            <Button 
              onClick={async () => {
                setImporting(true);
                try {
                  // Fetch the bundled XML file
                  const response = await fetch('/data/microvellum-products.xml');
                  if (!response.ok) throw new Error('Failed to load bundled XML file');
                  const xmlContent = await response.text();
                  
                  const { data, error } = await supabase.functions.invoke('import-microvellum', {
                    body: { xmlContent }
                  });

                  if (error) throw error;

                  const result = data as ImportResult;
                  if (result.success) {
                    toast.success(result.message || `Imported ${result.imported} products`);
                    await loadProducts();
                  } else {
                    throw new Error(result.error || 'Import failed');
                  }
                } catch (error: any) {
                  console.error('Import error:', error);
                  toast.error(error.message || 'Failed to import products');
                } finally {
                  setImporting(false);
                }
              }}
              disabled={importing}
              variant="secondary"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Import Bundled Product List
            </Button>
            <span className="text-sm text-muted-foreground">
              Use the pre-configured Microvellum product list
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{products.length}</div>
              <div className="text-sm text-muted-foreground">Total Products</div>
            </CardContent>
          </Card>
          {Object.entries(categoryCounts).map(([category, count]) => (
            <Card key={category}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm text-muted-foreground">{category}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Products Table */}
      {products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Imported Products ({filteredProducts.length})
            </CardTitle>
            <div className="flex gap-4 mt-4">
              <Input
                placeholder="Search by name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              <div className="flex gap-2">
                {categories.map(cat => (
                  <Button
                    key={cat}
                    variant={selectedCategory === cat ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat === 'all' ? 'All' : cat}
                    {cat !== 'all' && ` (${categoryCounts[cat] || 0})`}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dimensions (WxDxH)</TableHead>
                    <TableHead>Doors</TableHead>
                    <TableHead>Drawers</TableHead>
                    <TableHead>Spec Group</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.slice(0, 100).map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        <div>{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.microvellum_link_id}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getCategoryColor(product.category)}>
                          {product.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="outline">{product.cabinet_type}</Badge>
                          {product.is_corner && <Badge variant="secondary">Corner</Badge>}
                          {product.is_sink && <Badge variant="secondary">Sink</Badge>}
                          {product.is_blind && <Badge variant="secondary">Blind</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {product.default_width} × {product.default_depth} × {product.default_height}
                      </TableCell>
                      <TableCell>{product.door_count}</TableCell>
                      <TableCell>{product.drawer_count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {product.spec_group || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filteredProducts.length > 100 && (
              <p className="text-sm text-muted-foreground mt-2">
                Showing first 100 of {filteredProducts.length} products
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {products.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No products imported yet</h3>
            <p className="text-muted-foreground mb-4">
              Upload a Microvellum Excel XML export to get started
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
