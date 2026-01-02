/**
 * Hook for syncing kitchen designs to the external Supabase (shared with planner app).
 * Handles saving designs, tracking analytics, and creating leads.
 */
import { useCallback } from 'react';
import { externalSupabase, KitchenDesign, WebsiteAnalytics, Lead } from '@/integrations/external-supabase/client';
import { usePlanner } from '@/store/PlannerContext';
import { toast } from 'sonner';

// Get or create session ID for analytics
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('designer_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('designer_session_id', sessionId);
  }
  return sessionId;
};

// Detect device type
const getDeviceType = (): string => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

export function useExternalDesignSync() {
  const { 
    items, 
    room, 
    selectedFinish, 
    selectedBenchtop, 
    projectSettings,
    totalPrice 
  } = usePlanner();

  // Save design to external Supabase
  const saveDesignToExternal = useCallback(async (
    customerInfo: {
      designName: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      notes?: string;
    }
  ) => {
    const cabinetCount = items.filter(item => item.itemType === 'Cabinet').length;
    
    const designData: KitchenDesign = {
      design_name: customerInfo.designName,
      customer_name: customerInfo.customerName,
      customer_email: customerInfo.customerEmail,
      customer_phone: customerInfo.customerPhone,
      design_data: {
        items,
        room,
        selectedFinish,
        selectedBenchtop,
        projectSettings,
      },
      cabinet_style: selectedFinish?.name || 'Standard',
      cabinet_color: selectedFinish?.hex || '#FFFFFF',
      countertop_material: selectedBenchtop?.name || 'Laminate',
      total_cabinets: cabinetCount,
      estimated_price: totalPrice,
      room_dimensions: {
        width: room.width,
        depth: room.depth,
        height: room.height,
      },
      status: 'pending',
      notes: customerInfo.notes,
    };

    const { data, error } = await externalSupabase
      .from('kitchen_designs')
      .insert(designData)
      .select()
      .single();

    if (error) {
      console.error('Failed to save design to external Supabase:', error);
      toast.error('Failed to save design');
      return null;
    }

    toast.success('Design saved successfully!');
    return data;
  }, [items, room, selectedFinish, selectedBenchtop, projectSettings, totalPrice]);

  // Track page view
  const trackPageView = useCallback(async (pagePath: string, pageTitle?: string) => {
    const analytics: WebsiteAnalytics = {
      page_path: pagePath,
      page_title: pageTitle || document.title,
      referrer: document.referrer || undefined,
      user_agent: navigator.userAgent,
      device_type: getDeviceType(),
      session_id: getSessionId(),
    };

    const { error } = await externalSupabase
      .from('website_analytics')
      .insert(analytics);

    if (error) {
      console.error('Failed to track page view:', error);
    }
  }, []);

  // Create a lead (quote request)
  const createLead = useCallback(async (
    leadInfo: {
      name: string;
      email?: string;
      phone?: string;
      propertyAddress?: string;
      notes?: string;
    },
    designId?: string
  ) => {
    const lead: Lead = {
      name: leadInfo.name,
      email: leadInfo.email,
      phone: leadInfo.phone,
      source: '3D Kitchen Designer',
      status: 'New',
      value: totalPrice,
      property_address: leadInfo.propertyAddress,
      notes: designId 
        ? `Design ID: ${designId}\n${leadInfo.notes || ''}`
        : leadInfo.notes,
    };

    const { data, error } = await externalSupabase
      .from('leads')
      .insert(lead)
      .select()
      .single();

    if (error) {
      console.error('Failed to create lead:', error);
      toast.error('Failed to submit quote request');
      return null;
    }

    toast.success('Quote request submitted!');
    return data;
  }, [totalPrice]);

  // Load a design from external Supabase
  const loadDesignFromExternal = useCallback(async (designId: string) => {
    const { data, error } = await externalSupabase
      .from('kitchen_designs')
      .select('*')
      .eq('id', designId)
      .single();

    if (error) {
      console.error('Failed to load design:', error);
      toast.error('Failed to load design');
      return null;
    }

    return data as KitchenDesign;
  }, []);

  return {
    saveDesignToExternal,
    trackPageView,
    createLead,
    loadDesignFromExternal,
  };
}
