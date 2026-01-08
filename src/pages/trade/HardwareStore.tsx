import React from 'react';
import { useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, ShoppingCart } from 'lucide-react';

export default function HardwareStore() {
  const navigate = useNavigate();

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/trade/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-trade-navy">Hardware Store</h1>
            <p className="text-trade-muted text-sm">Browse and order hardware components</p>
          </div>
        </div>

        <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-trade-amber/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-trade-amber" />
            </div>
            <h2 className="text-xl font-display font-semibold text-trade-navy mb-2">
              Hardware Store Coming Soon
            </h2>
            <p className="text-trade-muted mb-6">
              Order handles, hinges, drawer runners, and other hardware directly. Quick reordering and bulk discounts available.
            </p>
            <Button 
              variant="outline"
              onClick={() => navigate('/trade/dashboard')}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </TradeLayout>
  );
}
