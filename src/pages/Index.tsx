import React, { Suspense, useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { PlannerProvider, usePlanner } from "../store/PlannerContext";
import Sidebar from "../components/Layout/Sidebar";
import PropertiesPanel from "../components/Layout/PropertiesPanel";
import Scene from "../components/3d/Scene";
import Scene3DErrorBoundary from "../components/3d/Scene3DErrorBoundary";
import CameraToolbar from "../components/3d/CameraToolbar";
import SelectionToolbar from "../components/3d/SelectionToolbar";
import StatusBar from "../components/3d/StatusBar";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../integrations/supabase/client";
import { Loader2, Undo2, Redo2, Grid3X3, Box, HelpCircle, User, Save, LogIn, Settings, Briefcase, Send } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useExternalDesignSync } from "../hooks/useExternalDesignSync";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SaveDesignDialog } from "@/components/SaveDesignDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ResizableSidebar({ side, title, children, defaultWidth = 320 }: { side: "left" | "right"; title: string; children: React.ReactNode; defaultWidth?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const panelWidth = collapsed ? 52 : defaultWidth;

  return (
    <div className="h-full bg-white flex flex-col relative" style={{ width: panelWidth, borderRight: side === "left" ? "1px solid #e5e7eb" : undefined, borderLeft: side === "right" ? "1px solid #e5e7eb" : undefined }}>
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800 truncate">{title}</div>
        <button className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50" onClick={() => setCollapsed(v => !v)} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function AppInner() {
  const { 
    undo, redo, canUndo, canRedo, 
    selectedItemId, items, room,
    removeItem, duplicateItem, updateItem, recordHistory,
    placementItemId, draggedItemId,
    selectedFinish, selectedBenchtop, selectedKick,
    projectSettings, globalDimensions, hardwareOptions, totalPrice
  } = usePlanner();
  const { user, loading: authLoading, signOut, isAdmin, userType } = useAuth();
  const { catalog } = useCatalog('standard');
  const [is3D, setIs3D] = useState(true);
  const setIs2D = useCallback(() => setIs3D(false), []);
  const [saving, setSaving] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogMode, setSaveDialogMode] = useState<'save' | 'quote'>('save');
  const [cameraControls, setCameraControls] = useState<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    fitAll: () => void;
  } | null>(null);
  
  // External design sync for shared backend
  const { trackPageView } = useExternalDesignSync();

  // Track page view on mount
  useEffect(() => {
    trackPageView('/designer', '3D Kitchen Designer');
  }, [trackPageView]);

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Get selected item info
  const selectedItem = selectedItemId ? items.find(i => i.instanceId === selectedItemId) : null;
  const selectedDef = selectedItem ? catalog.find(c => c.id === selectedItem.definitionId) : null;

  // Get placement item name
  const placementDef = placementItemId ? catalog.find(c => c.id === placementItemId) : null;

  // Selection toolbar handlers
  const handleDelete = useCallback(() => {
    if (selectedItemId) removeItem(selectedItemId);
  }, [selectedItemId, removeItem]);

  const handleDuplicate = useCallback(() => {
    if (selectedItemId) duplicateItem(selectedItemId);
  }, [selectedItemId, duplicateItem]);

  const handleRotate = useCallback(() => {
    if (selectedItemId && selectedItem) {
      recordHistory();
      updateItem(selectedItemId, { rotation: (selectedItem.rotation + 90) % 360 });
    }
  }, [selectedItemId, selectedItem, recordHistory, updateItem]);

  const handleFlipHinge = useCallback(() => {
    if (selectedItemId && selectedItem) {
      recordHistory();
      updateItem(selectedItemId, { hinge: selectedItem.hinge === 'Left' ? 'Right' : 'Left' });
    }
  }, [selectedItemId, selectedItem, recordHistory, updateItem]);

  // Save design to database
  const handleSaveDesign = async () => {
    if (!user) {
      toast.error('Please sign in to save your design');
      return;
    }

    setSaving(true);
    try {
      const designData = {
        room,
        items,
        selectedFinish,
        selectedBenchtop,
        selectedKick,
        globalDimensions,
        hardwareOptions,
        plannerType: 'simple',
      };

      const costExcl = totalPrice;
      const costIncl = totalPrice * 1.1; // Add 10% GST

      const { error } = await supabase.from('jobs').insert([{
        name: projectSettings.jobName || 'New Kitchen Design',
        customer_id: user.id,
        design_data: designData as any,
        cost_excl_tax: costExcl,
        cost_incl_tax: costIncl,
        delivery_method: projectSettings.deliveryMethod,
        notes: projectSettings.description,
        status: 'draft',
      }]);

      if (error) throw error;
      toast.success('Design saved successfully!');
    } catch (error) {
      console.error('Error saving design:', error);
      toast.error('Failed to save design');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
  };

  // Determine current mode for status bar
  const currentMode = placementItemId ? 'place' : draggedItemId ? 'drag' : 'select';

  // Check if user should see trade link
  const showTradeLink = userType === 'trade' || isAdmin;

  return (
    <div className="flex h-screen w-screen bg-gray-100 font-sans text-gray-900 flex-col md:flex-row overflow-hidden relative">
      <header className="hidden md:flex absolute top-0 left-0 right-0 h-14 items-center justify-between px-4 bg-white border-b border-gray-200 z-30">
        <div className="flex items-center gap-3">
          <div className="font-bold text-lg">Bower</div>
          <div className="text-xs text-gray-500">Kitchen Planner</div>
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={16} />
          </button>
          <button className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={16} />
          </button>

          <div className="h-6 w-px bg-gray-200 mx-1" />

          <button className={`px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-2 ${!is3D ? "bg-gray-100" : ""}`} onClick={() => setIs3D(false)}>
            <Grid3X3 size={16} />
            2D
          </button>
          <button className={`px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-2 ${is3D ? "bg-gray-100" : ""}`} onClick={() => setIs3D(true)}>
            <Box size={16} />
            3D
          </button>

          <div className="h-6 w-px bg-gray-200 mx-1" />

          {/* Save Button - for logged in users to local DB */}
          {user && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDesign}
              disabled={saving}
              title="Save to your account"
            >
              {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Save size={16} className="mr-1" />}
              Save
            </Button>
          )}
          
          {/* Save Design Button - for anonymous users to external DB */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSaveDialogMode('save');
              setSaveDialogOpen(true);
            }}
            title="Save your design"
          >
            <Save size={16} className="mr-1" />
            Save Design
          </Button>

          {/* Request Quote Button */}
          <Button
            size="sm"
            onClick={() => {
              setSaveDialogMode('quote');
              setSaveDialogOpen(true);
            }}
            title="Request a quote for your design"
          >
            <Send size={16} className="mr-1" />
            Get Quote
          </Button>

          <div className="h-6 w-px bg-gray-200 mx-1" />

          {/* User Menu */}
          {authLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <User size={16} className="mr-1" />
                  {user.email?.split('@')[0]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAdmin && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center">
                        <Settings size={16} className="mr-2" />
                        Admin Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {showTradeLink && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/trade" className="flex items-center">
                        <Briefcase size={16} className="mr-2" />
                        Trade Planner
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSignOut}>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button variant="outline" size="sm">
                <LogIn size={16} className="mr-1" />
                Sign In
              </Button>
            </Link>
          )}

          <button className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-2" title="Keyboard shortcuts">
            <HelpCircle size={16} />
          </button>
        </div>
      </header>

      <div className="hidden md:flex h-full pt-14">
        <ResizableSidebar side="left" title="Popular Cabinets">
          <Sidebar userType="standard" />
        </ResizableSidebar>
      </div>

      <div className="flex-1 flex flex-col md:flex-row pt-0 md:pt-14">
        <div className="flex-1 relative bg-gray-100">
          <Scene3DErrorBoundary onSwitch2D={setIs2D}>
            <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
              <Scene is3D={is3D} onCameraControlsReady={setCameraControls} />
            </Suspense>
          </Scene3DErrorBoundary>

          {/* Selection toolbar - shows when item is selected */}
          {selectedItem && selectedDef && (
            <SelectionToolbar
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onRotate={handleRotate}
              onFlipHinge={handleFlipHinge}
              cabinetNumber={selectedItem.cabinetNumber}
              sku={selectedDef.sku}
            />
          )}

          {/* Camera toolbar */}
          {cameraControls && (
            <CameraToolbar
              onZoomIn={cameraControls.zoomIn}
              onZoomOut={cameraControls.zoomOut}
              onResetView={cameraControls.resetView}
              onFitAll={cameraControls.fitAll}
              is3D={is3D}
              onToggleView={() => setIs3D(!is3D)}
            />
          )}

          {/* Status bar */}
          <StatusBar
            mode={currentMode}
            placementItemName={placementDef?.name}
            selectedInfo={selectedItem ? `${selectedItem.cabinetNumber} selected` : undefined}
          />
        </div>

        <div className="hidden md:flex h-full">
          <ResizableSidebar side="right" title="Your Kitchen">
            <PropertiesPanel userType="standard" />
          </ResizableSidebar>
        </div>
      </div>

      <div className="md:hidden flex gap-2 p-2 border-t bg-white">
        <button className="flex-1 px-3 py-2 rounded border" onClick={undo} disabled={!canUndo}>Undo</button>
        <button className="flex-1 px-3 py-2 rounded border" onClick={redo} disabled={!canRedo}>Redo</button>
        <button className="flex-1 px-3 py-2 rounded border" onClick={() => setIs3D(!is3D)}>{is3D ? '2D' : '3D'}</button>
      </div>

      {/* Save Design / Request Quote Dialog */}
      <SaveDesignDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        mode={saveDialogMode}
      />
    </div>
  );
}

export default function Index() {
  return (
    <PlannerProvider>
      <AppInner />
    </PlannerProvider>
  );
}
