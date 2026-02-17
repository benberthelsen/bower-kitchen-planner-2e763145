import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PricingRecord {
  [key: string]: string | number | boolean | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleError || roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { table, records } = await req.json();
    console.log(`Importing ${records.length} records to ${table}`);

    const validTables = [
      "parts_pricing",
      "hardware_pricing",
      "material_pricing",
      "edge_pricing",
      "door_drawer_pricing",
      "stone_pricing",
      "labor_rates",
    ];

    if (!validTables.includes(table)) {
      return new Response(JSON.stringify({ error: `Invalid table: ${table}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process records based on table type
    const processedRecords = records.map((record: PricingRecord) => {
      const processed: PricingRecord = {};
      
      for (const [key, value] of Object.entries(record)) {
        // Convert column names to snake_case
        const snakeKey = key
          .replace(/\s+/g, "_")
          .replace(/([A-Z])/g, "_$1")
          .toLowerCase()
          .replace(/^_/, "")
          .replace(/__+/g, "_");
        
        // Handle numeric fields
        if (typeof value === "string" && value.match(/^-?\d+\.?\d*$/)) {
          processed[snakeKey] = parseFloat(value);
        } else if (value === "" || value === null || value === undefined) {
          processed[snakeKey] = null;
        } else if (typeof value === "string" && (value.toLowerCase() === "true" || value.toLowerCase() === "false")) {
          processed[snakeKey] = value.toLowerCase() === "true";
        } else {
          processed[snakeKey] = value;
        }
      }
      
      return processed;
    });

    // Upsert based on table type
    let upsertColumn = "id";
    if (table === "hardware_pricing" || table === "material_pricing" || table === "edge_pricing" || table === "door_drawer_pricing") {
      upsertColumn = "item_code";
    } else if (table === "parts_pricing") {
      upsertColumn = "name";
    } else if (table === "stone_pricing") {
      upsertColumn = "brand";
    } else if (table === "labor_rates") {
      upsertColumn = "name";
    }

    // Batch insert/update
    const batchSize = 100;
    let inserted = 0;
    const updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < processedRecords.length; i += batchSize) {
      const batch = processedRecords.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from(table)
        .upsert(batch, { 
          onConflict: upsertColumn,
          ignoreDuplicates: false 
        })
        .select();

      if (error) {
        console.error(`Batch error at ${i}:`, error);
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        inserted += data?.length || 0;
      }
    }

    console.log(`Import complete: ${inserted} records processed, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        updated,
        errors,
        total: processedRecords.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Import error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
