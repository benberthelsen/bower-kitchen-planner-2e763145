/**
 * DEPRECATED shim — the planner now uses ONE Supabase project (bower-cabinet-ai).
 * This client used to point at a hard-coded third project; it now reuses the
 * main env-configured client. Only legacy planner pages import it, and they are
 * scheduled for removal (see docs/phase-1-architecture-note.md).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const externalSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

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
