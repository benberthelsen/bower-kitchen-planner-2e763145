import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CATALOG } from '@/constants';
import { Upload, Download, RefreshCw, Loader2 } from 'lucide-react';

interface ImportResult {
  success: boolean;
  imported?: number;
  categoryCounts?: Record<string, number>;
  message?: string;
  error?: string;
}

export default function AdminSettings() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requireSignedIn = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      toast.error('Please sign in as an admin to import products');
      return false;
    }
    return true;
  };

  const syncProductsFromCatalog = async () => {
    try {
      // Insert all catalog items into products table
      const products = CATALOG.map(item => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category || null,
        item_type: item.itemType,
        default_width: item.defaultWidth,
        default_depth: item.defaultDepth,
        default_height: item.defaultHeight,
        price: item.price,
      }));

      const { error } = await supabase
        .from('products')
        .upsert(products, { onConflict: 'id' });

      if (error) throw error;
      toast.success(`Synced ${products.length} products from catalog`);
    } catch (error) {
      console.error('Error syncing products:', error);
      toast.error('Failed to sync products');
    }
  };

  const handleImportFromBundled = async () => {
    if (!(await requireSignedIn())) return;

    setImporting(true);
    try {
      const response = await fetch('/data/microvellum-products.xml');
      if (!response.ok) throw new Error('Failed to load bundled XML file');
      const xmlContent = await response.text();
      
      const { data, error } = await supabase.functions.invoke('import-microvellum', {
        body: { xmlContent }
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as ImportResult;
      if (result.success) {
        toast.success(result.message || `Imported ${result.imported} products`);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import products');
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xml')) {
      toast.error('Please select an XML file');
      return;
    }

    if (!(await requireSignedIn())) return;

    setImporting(true);
    try {
      const xmlContent = await file.text();
      
      const { data, error } = await supabase.functions.invoke('import-microvellum', {
        body: { xmlContent }
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as ImportResult;
      if (result.success) {
        toast.success(result.message || `Imported ${result.imported} products`);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import products');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleExportProducts = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('microvellum_products')
        .select('*')
        .order('category')
        .order('name');

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('No products to export');
        return;
      }

      // Create JSON export
      const exportData = {
        exportDate: new Date().toISOString(),
        productCount: data.length,
        products: data.map(p => ({
          microvellum_link_id: p.microvellum_link_id,
          name: p.name,
          category: p.category,
          cabinet_type: p.cabinet_type,
          default_width: p.default_width,
          default_depth: p.default_depth,
          default_height: p.default_height,
          door_count: p.door_count,
          drawer_count: p.drawer_count,
          is_corner: p.is_corner,
          is_sink: p.is_sink,
          is_blind: p.is_blind,
          spec_group: p.spec_group,
          room_component_type: p.room_component_type,
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `microvellum-products-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${data.length} products`);
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(error.message || 'Failed to export products');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Microvellum Product Catalog</CardTitle>
            <CardDescription>
              Import and export Microvellum product definitions. Upload an XML file or use the bundled product list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={handleImportFromBundled} 
                disabled={importing}
                variant="default"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Import Bundled Products
                  </>
                )}
              </Button>

              <Button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={importing}
                variant="secondary"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload XML File
              </Button>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                onChange={handleFileUpload}
                className="hidden"
              />

              <Button 
                onClick={handleExportProducts} 
                disabled={exporting}
                variant="outline"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Products (JSON)
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Imported products will appear in the planner sidebar and can be used for kitchen designs.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product Catalog Sync</CardTitle>
            <CardDescription>
              Sync the built-in product catalog to the database. This will create or update all products with their default prices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={syncProductsFromCatalog}>
              Sync Products from Catalog
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database Info</CardTitle>
            <CardDescription>
              Information about the connected database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Tables:</strong> profiles, user_roles, products, jobs, price_history, microvellum_products</p>
            <p><strong>Features:</strong></p>
            <ul className="list-disc list-inside ml-4 text-muted-foreground">
              <li>Row Level Security (RLS) enabled on all tables</li>
              <li>Automatic profile creation on signup</li>
              <li>Role-based access control (admin, moderator, user)</li>
              <li>Price change history logging</li>
              <li>Microvellum XML import/export</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
