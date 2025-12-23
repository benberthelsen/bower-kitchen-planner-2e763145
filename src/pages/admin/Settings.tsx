import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CATALOG } from '@/constants';

export default function AdminSettings() {
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="grid gap-6">
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
            <p><strong>Tables:</strong> profiles, user_roles, products, jobs, price_history</p>
            <p><strong>Features:</strong></p>
            <ul className="list-disc list-inside ml-4 text-gray-600">
              <li>Row Level Security (RLS) enabled on all tables</li>
              <li>Automatic profile creation on signup</li>
              <li>Role-based access control (admin, moderator, user)</li>
              <li>Price change history logging</li>
              <li>Microvellum XML export</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}