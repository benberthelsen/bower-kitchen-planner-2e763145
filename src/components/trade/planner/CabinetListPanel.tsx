import React from 'react';
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
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CabinetListPanelProps {
  roomId: string;
  cabinets: ConfiguredCabinet[];
  onEditCabinet: (cabinet: ConfiguredCabinet) => void;
  onSelectCabinet: (instanceId: string | null) => void;
  className?: string;
}

export function CabinetListPanel({
  roomId,
  cabinets,
  onEditCabinet,
  onSelectCabinet,
  className,
}: CabinetListPanelProps) {
  const { 
    selectedCabinetId, 
    removeCabinet, 
    duplicateCabinet,
    getRoomTotals 
  } = useTradeRoom();

  const totals = getRoomTotals(roomId);
  
  const handleDuplicate = (cabinet: ConfiguredCabinet) => {
    duplicateCabinet(roomId, cabinet.instanceId);
  };

  const handleRemove = (cabinet: ConfiguredCabinet) => {
    removeCabinet(roomId, cabinet.instanceId);
  };

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

      {/* Cabinet List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {cabinets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No cabinets yet</p>
              <p className="text-xs mt-1">
                Add cabinets from the catalog or drag them into the scene
              </p>
            </div>
          ) : (
            cabinets.map((cabinet) => (
              <CabinetListItem
                key={cabinet.instanceId}
                cabinet={cabinet}
                isSelected={selectedCabinetId === cabinet.instanceId}
                onSelect={() => onSelectCabinet(cabinet.instanceId)}
                onEdit={() => onEditCabinet(cabinet)}
                onDuplicate={() => handleDuplicate(cabinet)}
                onRemove={() => handleRemove(cabinet)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Summary */}
      {cabinets.length > 0 && (
        <div className="p-4 border-t bg-muted/30">
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
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function CabinetListItem({
  cabinet,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onRemove,
}: CabinetListItemProps) {
  const categoryColors: Record<string, string> = {
    Base: 'bg-blue-500/10 text-blue-600',
    Wall: 'bg-green-500/10 text-green-600',
    Tall: 'bg-purple-500/10 text-purple-600',
    Appliance: 'bg-orange-500/10 text-orange-600',
  };

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
          <Badge 
            variant="secondary" 
            className={cn("text-[10px] px-1.5 py-0", categoryColors[cabinet.category])}
          >
            {cabinet.category}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {cabinet.dimensions.width} × {cabinet.dimensions.depth}mm
          </span>
          {cabinet.isPlaced && (
            <Check className="w-3 h-3 text-green-500" />
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
