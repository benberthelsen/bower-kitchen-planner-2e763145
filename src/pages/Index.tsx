import React, { Suspense, useState } from "react";
import { PlannerProvider, usePlanner } from "../store/PlannerContext";
import Sidebar from "../components/Layout/Sidebar";
import PropertiesPanel from "../components/Layout/PropertiesPanel";
import Scene from "../components/3d/Scene";
import { Loader2, Undo2, Redo2, Grid3X3, Box, FileText } from "lucide-react";

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
  const { undo, redo, canUndo, canRedo } = usePlanner();
  const [is3D, setIs3D] = useState(true);

  return (
    <div className="flex h-screen w-screen bg-gray-100 font-sans text-gray-900 flex-col md:flex-row overflow-hidden relative">
      <header className="hidden md:flex absolute top-0 left-0 right-0 h-14 items-center justify-between px-4 bg-white border-b border-gray-200 z-30">
        <div className="flex items-center gap-3">
          <div className="font-bold text-lg">Bower</div>
          <div className="text-xs text-gray-500">Kitchen Planner</div>
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50" onClick={undo} disabled={!canUndo} title="Undo">
            <Undo2 size={16} />
          </button>
          <button className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50" onClick={redo} disabled={!canRedo} title="Redo">
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
        </div>
      </header>

      <div className="hidden md:flex h-full pt-14">
        <ResizableSidebar side="left" title="Cabinet Library">
          <Sidebar />
        </ResizableSidebar>
      </div>

      <div className="flex-1 flex flex-col md:flex-row pt-0 md:pt-14">
        <div className="flex-1 relative bg-gray-100">
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
            <Scene is3D={is3D} />
          </Suspense>
        </div>

        <div className="hidden md:flex h-full">
          <ResizableSidebar side="right" title="Cabinet Schedule">
            <PropertiesPanel />
          </ResizableSidebar>
        </div>
      </div>

      <div className="md:hidden flex gap-2 p-2 border-t bg-white">
        <button className="flex-1 px-3 py-2 rounded border" onClick={undo} disabled={!canUndo}>Undo</button>
        <button className="flex-1 px-3 py-2 rounded border" onClick={redo} disabled={!canRedo}>Redo</button>
        <button className="flex-1 px-3 py-2 rounded border" onClick={() => setIs3D(!is3D)}>{is3D ? '2D' : '3D'}</button>
      </div>
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
