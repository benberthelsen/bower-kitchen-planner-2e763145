import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      throw new Error('Admin access required');
    }

    const { changes } = await req.json();
    
    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      throw new Error('No price changes provided');
    }

    console.log(`Processing ${changes.length} price changes`);

    const results = {
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const change of changes) {
      try {
        // Get current product
        const { data: product, error: fetchError } = await supabase
          .from('products')
          .select('id, price')
          .eq('sku', change.sku)
          .single();

        if (fetchError || !product) {
          results.failed++;
          results.errors.push(`Product not found: ${change.sku}`);
          continue;
        }

        // Update price
        const { error: updateError } = await supabase
          .from('products')
          .update({ price: change.newPrice })
          .eq('id', product.id);

        if (updateError) {
          results.failed++;
          results.errors.push(`Failed to update ${change.sku}: ${updateError.message}`);
          continue;
        }

        // Log price history
        await supabase.from('price_history').insert({
          product_id: product.id,
          old_price: change.oldPrice,
          new_price: change.newPrice,
          changed_by: user.id,
        });

        results.updated++;
        console.log(`Updated ${change.sku}: $${change.oldPrice} -> $${change.newPrice}`);
      } catch (error: unknown) {
        results.failed++;
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Error processing ${change.sku}: ${message}`);
      }
    }

    console.log(`Price import complete: ${results.updated} updated, ${results.failed} failed`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in import-prices:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});