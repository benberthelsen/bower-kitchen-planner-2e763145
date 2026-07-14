import React from 'react';
import { useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package } from 'lucide-react';
import { useHardwareDefaults } from '@/hooks/useHardwareDefaults';
import { Badge } from '@/components/ui/badge';

export default function HardwareStore() {
  const navigate = useNavigate();
  const { hardware, selectedSku, selectSku, loading } = useHardwareDefaults();

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/trade/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-trade-navy">Hardware Store</h1>
            <p className="text-trade-muted text-sm">Select hardware SKUs used for quoting defaults</p>
          </div>
        </div>

        <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5">
          {loading && <p className="text-muted-foreground text-sm">Loading hardware catalog…</p>}
          {!loading && hardware.length === 0 && <p className="text-muted-foreground text-sm">No hardware SKUs available.</p>}

          <div className="space-y-3">
            {hardware.map((item) => (
              <button
                key={item.id}
                onClick={() => selectSku(item.sku)}
                className={`w-full text-left border rounded-lg p-4 transition-colors ${selectedSku === item.sku ? 'border-trade-amber bg-trade-amber/5' : 'border-trade-border hover:border-trade-amber/50'}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-trade-navy">{item.name}</p>
                    <p className="text-sm text-trade-muted">SKU: {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">{item.type}</Badge>
                    <p className="text-sm text-trade-muted mt-1">${item.unitCost.toFixed(2)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 p-4 rounded-lg border border-dashed text-sm text-muted-foreground">
            <Package className="h-4 w-4 inline mr-2" />
            Default quoting SKU: <span className="font-medium text-foreground">{selectedSku || 'Not selected yet'}</span>
          </div>
        </div>
      </div>
    </TradeLayout>
  );
}
