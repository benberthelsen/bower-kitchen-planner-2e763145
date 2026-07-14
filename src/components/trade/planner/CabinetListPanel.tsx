import React, { useMemo, useState } from 'react';
import { ConfiguredCabinet, useTradeRoom } from '@/contexts/TradeRoomContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  Trash2, 
  Copy, 
  Edit2, 
  GripVertical, 
  Check,
  MapPin,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Box,
  LayoutGrid,
  ArrowUpDown,
  PanelTop,
  RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFlushWall } from './flushToWall';
import { FlushToWallBadge } from './FlushToWallBadge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface CabinetListPanelProps {
  roomId: string;
  cabinets: ConfiguredCabinet[];
  getCabinetPrice?: (cabinet: ConfiguredCabinet) => number;
  onEditCabinet: (cabinet: ConfiguredCabinet) => void;
  onSelectCabinet: (instanceId: string | null) => void;
  onDuplicateCabinet?: (cabinet: ConfiguredCabinet) => Promise<void> | void;
  onRemoveCabinet?: (cabinet: ConfiguredCabinet) => Promise<void> | void;
  onRotateCabinet?: () => void;
  className?: string;
}

// Category configuration with order, colors, and icons
const CATEGORY_CONFIG: Record<string, { 
  order: number; 
  bgColor: string; 
  textColor: string; 
  icon: React.ReactNode;
}> = {
  Base: { 
    order: 1, 
    bgColor: 'bg-blue-500/10', 
    textColor: 'text-blue-600',
    icon: <Box className="w-4 h-4" />
  },
  Wall: { 
    order: 2, 
    bgColor: 'bg-green-500/10', 
    textColor: 'text-green-600',
    icon: <PanelTop className="w-4 h-4" />
  },
  Tall: { 
    order: 3, 
    bgColor: 'bg-purple-500/10', 
    textColor: 'text-purple-600',
    icon: <ArrowUpDown className="w-4 h-4" />
  },
  Appliance: { 
    order: 4, 
    bgColor: 'bg-orange-500/10', 
    textColor: 'text-orange-600',
    icon: <LayoutGrid className="w-4 h-4" />
  },
  Other: { 
    order: 5, 
    bgColor: 'bg-gray-500/10', 
    textColor: 'text-gray-600',
    icon: <Package className="w-4 h-4" />
  },
};

export function CabinetListPanel({
  roomId,
  cabinets,
  getCabinetPrice,
  onEditCabinet,
  onSelectCabinet,
  onDuplicateCabinet,
  onRemoveCabinet,
  onRotateCabinet,
  className,
}: CabinetListPanelProps) {
  const { selectedCabinetId, removeCabinet, duplicateCabinet, getRoomTotals, getRoomById } = useTradeRoom();

  const totals = getRoomTotals(roomId);
  const room = getRoomById(roomId);
  const selectedCabinet = selectedCabinetId ? cabinets.find((c) => c.instanceId === selectedCabinetId) ?? null : null;

  const estimatedTotal = useMemo(
    () => cabinets.reduce((sum, cabinet) => sum + (getCabinetPrice?.(cabinet) ?? 0), 0),
    [cabinets, getCabinetPrice]
  );
  
  // Track expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Base', 'Wall', 'Tall', 'Appliance'])
  );

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  
  const handleDuplicate = async (cabinet: ConfiguredCabinet) => {
    if (onDuplicateCabinet) {
      await onDuplicateCabinet(cabinet);
      return;
    }
    duplicateCabinet(roomId, cabinet.instanceId);
  };

  const handleRemove = async (cabinet: ConfiguredCabinet) => {
    if (onRemoveCabinet) {
      await onRemoveCabinet(cabinet);
      return;
    }
    removeCabinet(roomId, cabinet.instanceId);
  };

  // Group and sort cabinets by category
  const groupedCabinets = useMemo(() => {
    const groups: Record<string, ConfiguredCabinet[]> = {};
    
    // Group by category
    cabinets.forEach(cabinet => {
      const category = cabinet.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(cabinet);
    });
    
    // Sort cabinets within each group by cabinet number
    Object.keys(groups).forEach(category => {
      groups[category].sort((a, b) => {
        // Extract numeric part from cabinet number (C01, C02, etc.)
        const numA = parseInt(a.cabinetNumber?.replace(/\D/g, '') || '0');
        const numB = parseInt(b.cabinetNumber?.replace(/\D/g, '') || '0');
        return numA - numB;
      });
    });
    
    return groups;
  }, [cabinets]);

  // Get sorted category keys
  const sortedCategories = useMemo(() => {
    return Object.keys(groupedCabinets).sort((a, b) => {
      const orderA = CATEGORY_CONFIG[a]?.order ?? 99;
      const orderB = CATEGORY_CONFIG[b]?.order ?? 99;
      return orderA - orderB;
    });
  }, [groupedCabinets]);

  // Calculate category stats
  const getCategoryStats = (category: string) => {
    const items = groupedCabinets[category] || [];
    const placed = items.filter(c => c.isPlaced).length;
    return { total: items.length, placed };
  };

  // When a cabinet is selected, the panel shows its details (takes over from the
  // room list). Deselecting (Back / Esc / clicking empty space) returns to the list.
  if (selectedCabinet) {
    return (
      <div className={cn("flex flex-col bg-background border-l h-full", className)}>
        <CabinetDetailView
          cabinet={selectedCabinet}
          price={getCabinetPrice?.(selectedCabinet)}
          flushWall={room ? getFlushWall(selectedCabinet, room) : null}
          onBack={() => onSelectCabinet(null)}
          onEdit={() => onEditCabinet(selectedCabinet)}
          onRotate={onRotateCabinet}
          onDuplicate={() => handleDuplicate(selectedCabinet)}
          onRemove={() => { void handleRemove(selectedCabinet); onSelectCabinet(null); }}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col bg-background border-l h-full", className)}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-trade-navy">Cabinets</h3>
          <Badge variant="secondary" className="bg-trade-amber/10 text-trade-amber">
            {totals.count}
          </Badge>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {totals.placed} placed
          </span>
          <span className="text-muted-foreground/50">•</span>
          <span>{totals.unplaced} unplaced</span>
        </div>
      </div>

      {/* Cabinet List - Grouped by Category */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {cabinets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No cabinets yet</p>
              <p className="text-xs mt-1">
                Click a product in the catalog to add it
              </p>
            </div>
          ) : (
            sortedCategories.map((category) => {
              const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.Other;
              const stats = getCategoryStats(category);
              const isExpanded = expandedCategories.has(category);

              return (
                <Collapsible
                  key={category}
                  open={isExpanded}
                  onOpenChange={() => toggleCategory(category)}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-1 rounded", config.bgColor, config.textColor)}>
                        {config.icon}
                      </div>
                      <span className="font-medium text-sm text-trade-navy">
                        {category} Cabinets
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {stats.total}
                      </Badge>
                      {stats.placed < stats.total && (
                        <span className="text-[10px] text-muted-foreground">
                          ({stats.total - stats.placed} unplaced)
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-2 space-y-0.5">
                    {groupedCabinets[category].map((cabinet) => (
                      <CabinetListItem
                        key={cabinet.instanceId}
                        cabinet={cabinet}
                        price={getCabinetPrice?.(cabinet)}
                        isSelected={selectedCabinetId === cabinet.instanceId}
                        onSelect={() => onSelectCabinet(cabinet.instanceId)}
                        onEdit={() => onEditCabinet(cabinet)}
                        onDuplicate={() => handleDuplicate(cabinet)}
                        onRemove={() => handleRemove(cabinet)}
                        flushWall={room ? getFlushWall(cabinet, room) : null}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Summary */}
      {cabinets.length > 0 && (
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Est. Total</span>
            <span className="font-semibold text-trade-navy">
              {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(estimatedTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Cabinets</span>
            <span className="font-semibold text-trade-navy">{cabinets.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface CabinetListItemProps {
  cabinet: ConfiguredCabinet;
  price?: number;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  flushWall: 'back' | 'left' | 'right' | 'front' | null;
}

function CabinetListItem({
  cabinet,
  price,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onRemove,
  flushWall,
}: CabinetListItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
        isSelected 
          ? "bg-trade-amber/10 border border-trade-amber/30" 
          : "hover:bg-muted/50 border border-transparent"
      )}
      onClick={onSelect}
    >
      <div className="cursor-grab opacity-0 group-hover:opacity-50">
        <GripVertical className="w-4 h-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-trade-amber">
            {cabinet.cabinetNumber}
          </span>
          <span className="text-sm font-medium truncate text-trade-navy">
            {cabinet.productName}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {cabinet.dimensions.width} × {cabinet.dimensions.depth}mm
          </span>
          {flushWall && <FlushToWallBadge wall={flushWall} />}
          {price !== undefined && (
            <span className="text-[10px] font-medium text-trade-navy/80">
              {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(price)}
            </span>
          )}
          {cabinet.isPlaced ? (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600">
              <Check className="w-3 h-3" />
              placed
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">
              not placed
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---- Selected-cabinet detail view (takes over the side panel on selection) ----

function prettyValue(value?: string): string {
  if (!value) return '—';
  // Raw reference ids (UUIDs) aren't meaningful to show — hide them.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return '—';
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-border/50 last:border-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium text-trade-navy break-words whitespace-normal">{value}</div>
    </div>
  );
}

interface CabinetDetailViewProps {
  cabinet: ConfiguredCabinet;
  price?: number;
  flushWall: 'back' | 'left' | 'right' | 'front' | null;
  onBack: () => void;
  onEdit: () => void;
  onRotate?: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function CabinetDetailView({ cabinet, price, flushWall, onBack, onEdit, onRotate, onDuplicate, onRemove }: CabinetDetailViewProps) {
  const d = cabinet.dimensions;
  const m = cabinet.materials;
  const h = cabinet.hardware;
  return (
    <>
      <div className="p-3 border-b flex items-start gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1 flex-shrink-0" onClick={onBack} title="Back to list (Esc)">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-trade-amber">{cabinet.cabinetNumber}</span>
            <span className="text-sm font-semibold text-trade-navy break-words">{cabinet.productName}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">{cabinet.category} cabinet</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {([['Width', d.width], ['Height', d.height], ['Depth', d.depth]] as const).map(([label, val]) => (
              <div key={label} className="rounded-lg border border-border p-2">
                <div className="text-sm font-semibold text-trade-navy">{val}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Placement</div>
            <DetailRow label="On wall" value={flushWall ? <FlushToWallBadge wall={flushWall} /> : 'Free-standing'} />
            <DetailRow label="Status" value={cabinet.isPlaced ? 'Placed' : 'Not placed'} />
            <DetailRow label="Rotation" value={`${cabinet.position?.rotation ?? 0}°`} />
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Materials</div>
            <DetailRow label="Door / exterior" value={prettyValue(m?.exteriorFinish)} />
            <DetailRow label="Carcase" value={prettyValue(m?.carcaseFinish)} />
            <DetailRow label="Door style" value={prettyValue(m?.doorStyle)} />
            <DetailRow label="Edge" value={prettyValue(m?.edgeBanding)} />
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Hardware</div>
            <DetailRow label="Handle" value={prettyValue(h?.handleType)} />
            <DetailRow label="Hinge" value={prettyValue(h?.hingeType)} />
            <DetailRow label="Drawer runner" value={prettyValue(h?.drawerType)} />
          </div>

          {price !== undefined && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Price</div>
              <DetailRow label="Estimated" value={new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(price)} />
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t grid grid-cols-2 gap-2">
        <Button size="sm" className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy" onClick={onEdit}>
          <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
        </Button>
        {onRotate && (
          <Button variant="outline" size="sm" onClick={onRotate}>
            <RotateCw className="w-3.5 h-3.5 mr-1" /> Rotate
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy className="w-3.5 h-3.5 mr-1" /> Duplicate
        </Button>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
        </Button>
      </div>
    </>
  );
}
