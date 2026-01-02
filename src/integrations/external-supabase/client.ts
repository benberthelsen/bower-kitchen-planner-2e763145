/**
 * External Supabase client for the shared kitchen designer backend.
 * This connects to the existing Supabase project shared with the planner app.
 * Used for: kitchen_designs, website_analytics, leads tables
 */
import { createClient } from '@supabase/supabase-js';

const EXTERNAL_SUPABASE_URL = 'https://cfwywsrhwnfqzdxcgnmm.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmd3l3c3Jod25mcXpkeGNnbm1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzAwMDcsImV4cCI6MjA4MTg0NjAwN30.un4344b6czQrk56kAoND4FcCORKuY00mV3KEo4DfoCg';

export const externalSupabase = createClient(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY
);

// Types for the external tables
export interface KitchenDesign {
  id?: string;
  design_name: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  design_data?: Record<string, unknown>;
  thumbnail_url?: string;
  cabinet_style?: string;
  cabinet_color?: string;
  countertop_material?: string;
  total_cabinets?: number;
  estimated_price?: number;
  room_dimensions?: { width: number; depth: number; height: number };
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WebsiteAnalytics {
  id?: string;
  page_path: string;
  page_title?: string;
  referrer?: string;
  user_agent?: string;
  device_type?: string;
  country?: string;
  city?: string;
  session_id?: string;
  visited_at?: string;
  created_at?: string;
}

export interface Lead {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  value?: number;
  property_address?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}
