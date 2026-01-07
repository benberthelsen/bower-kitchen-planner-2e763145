import React, { useMemo } from 'react';
import { ConfiguredCabinet } from '@/contexts/TradeRoomContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { List, Package, Ruler, DollarSign } from 'lucide-react';

interface PartsListPanelProps {
  cabinet: ConfiguredCabinet;
  className?: string;
}

interface Part {
  name: string;
  material: string;
  dimensions: string;
  quantity: number;
  unitPrice: number;
}

export function PartsListPanel({ cabinet, className = '' }: PartsListPanelProps) {
  // Generate parts list based on cabinet configuration
  const parts = useMemo((): Part[] => {
    const { width, height, depth } = cabinet.dimensions;
    const materialName = cabinet.materials.exteriorFinish.replace(/-/g, ' ');
    const carcaseName = cabinet.materials.carcaseFinish.replace(/-/g, ' ');
    
    const partsList: Part[] = [
      // Carcase parts
      {
        name: 'Left Gable',
        material: carcaseName,
        dimensions: `${height} × ${depth} × 18mm`,
        quantity: 1,
        unitPrice: 45.00,
      },
      {
        name: 'Right Gable',
        material: carcaseName,
        dimensions: `${height} × ${depth} × 18mm`,
        quantity: 1,
        unitPrice: 45.00,
      },
      {
        name: 'Top Panel',
        material: carcaseName,
        dimensions: `${width - 36} × ${depth} × 18mm`,
        quantity: 1,
        unitPrice: 38.00,
      },
      {
        name: 'Bottom Panel',
        material: carcaseName,
        dimensions: `${width - 36} × ${depth} × 18mm`,
        quantity: 1,
        unitPrice: 38.00,
      },
      {
        name: 'Back Panel',
        material: '3mm HDF',
        dimensions: `${width - 6} × ${height - 6}mm`,
        quantity: 1,
        unitPrice: 15.00,
      },
    ];
    
    // Add shelves
    if (cabinet.accessories.shelfCount > 0) {
      partsList.push({
        name: 'Adjustable Shelf',
        material: carcaseName,
        dimensions: `${width - 54} × ${depth - 20} × 18mm`,
        quantity: cabinet.accessories.shelfCount,
        unitPrice: 22.00,
      });
    }
    
    // Add door fronts
    const hasDoors = !cabinet.productName.toLowerCase().includes('drawer');
    if (hasDoors) {
      const doorCount = width > 600 ? 2 : 1;
      const doorWidth = Math.floor((width - 4) / doorCount);
      partsList.push({
        name: 'Door Front',
        material: materialName,
        dimensions: `${height - 4} × ${doorWidth} × 18mm`,
        quantity: doorCount,
        unitPrice: 65.00,
      });
    } else {
      // Drawer fronts
      const drawerCount = 3;
      const drawerHeight = Math.floor((height - 8) / drawerCount);
      partsList.push({
        name: 'Drawer Front',
        material: materialName,
        dimensions: `${drawerHeight} × ${width - 4} × 18mm`,
        quantity: drawerCount,
        unitPrice: 55.00,
      });
      partsList.push({
        name: 'Drawer Box',
        material: 'Birch Ply',
        dimensions: `${drawerHeight - 40} × ${width - 60}mm`,
        quantity: drawerCount,
        unitPrice: 85.00,
      });
    }
    
    // Hardware
    if (cabinet.hardware.handleType !== 'none') {
      partsList.push({
        name: `Handle - ${cabinet.hardware.handleType}`,
        material: cabinet.hardware.handleColor.replace(/-/g, ' '),
        dimensions: '-',
        quantity: hasDoors ? (width > 600 ? 2 : 1) : 3,
        unitPrice: 12.00,
      });
    }
    
    partsList.push({
      name: 'Hinge',
      material: cabinet.hardware.softClose ? 'Soft-Close' : 'Standard',
      dimensions: '-',
      quantity: hasDoors ? 4 : 0,
      unitPrice: cabinet.hardware.softClose ? 8.50 : 4.00,
    });
    
    if (!hasDoors) {
      partsList.push({
        name: 'Drawer Runner',
        material: cabinet.hardware.drawerType.replace(/-/g, ' '),
        dimensions: `${depth}mm`,
        quantity: 3,
        unitPrice: 35.00,
      });
    }
    
    // Kickboard for base cabinets
    if (cabinet.category === 'Base') {
      partsList.push({
        name: 'Kickboard',
        material: materialName,
        dimensions: `${width} × 150 × 18mm`,
        quantity: 1,
        unitPrice: 25.00,
      });
    }
    
    return partsList.filter(p => p.quantity > 0);
  }, [cabinet]);

  const subtotal = useMemo(() => {
    return parts.reduce((sum, part) => sum + (part.unitPrice * part.quantity), 0);
  }, [parts]);

  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  return (
    <div className={`flex flex-col h-full bg-background border-l ${className}`}>
      <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
        <List className="w-5 h-5 text-trade-navy" />
        <h3 className="font-semibold text-trade-navy">Parts List</h3>
        <span className="ml-auto text-sm text-muted-foreground">{parts.length} items</span>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {parts.map((part, index) => (
            <div
              key={`${part.name}-${index}`}
              className="p-3 bg-muted/30 rounded-lg space-y-2"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{part.name}</span>
                </div>
                <span className="text-xs bg-trade-navy/10 text-trade-navy px-2 py-0.5 rounded">
                  ×{part.quantity}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{part.material}</span>
                {part.dimensions !== '-' && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Ruler className="w-3 h-3" />
                      {part.dimensions}
                    </span>
                  </>
                )}
              </div>
              <div className="flex justify-end text-sm font-medium">
                ${(part.unitPrice * part.quantity).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      <div className="border-t p-4 space-y-2 bg-muted/30">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">GST (10%)</span>
          <span>${gst.toFixed(2)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-semibold">
          <span className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-trade-amber" />
            Total
          </span>
          <span className="text-lg text-trade-navy">${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
