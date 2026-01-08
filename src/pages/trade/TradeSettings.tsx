import React from 'react';
import { useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, User, Bell, Palette } from 'lucide-react';

export default function TradeSettings() {
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
            <h1 className="text-2xl font-display font-bold text-trade-navy">Settings</h1>
            <p className="text-trade-muted text-sm">Manage your account and preferences</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 opacity-60">
            <div className="p-2 bg-trade-amber/10 rounded-lg w-fit mb-3">
              <User className="h-5 w-5 text-trade-amber" />
            </div>
            <h3 className="font-display font-semibold text-trade-navy">Profile</h3>
            <p className="text-sm text-trade-muted mt-1">Manage your account details</p>
            <span className="text-xs text-trade-amber mt-2 inline-block">Coming Soon</span>
          </div>

          <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 opacity-60">
            <div className="p-2 bg-trade-amber/10 rounded-lg w-fit mb-3">
              <Bell className="h-5 w-5 text-trade-amber" />
            </div>
            <h3 className="font-display font-semibold text-trade-navy">Notifications</h3>
            <p className="text-sm text-trade-muted mt-1">Email and push preferences</p>
            <span className="text-xs text-trade-amber mt-2 inline-block">Coming Soon</span>
          </div>

          <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 opacity-60">
            <div className="p-2 bg-trade-amber/10 rounded-lg w-fit mb-3">
              <Palette className="h-5 w-5 text-trade-amber" />
            </div>
            <h3 className="font-display font-semibold text-trade-navy">Defaults</h3>
            <p className="text-sm text-trade-muted mt-1">Default materials & hardware</p>
            <span className="text-xs text-trade-amber mt-2 inline-block">Coming Soon</span>
          </div>
        </div>

        <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-8 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-12 h-12 bg-trade-amber/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="h-6 w-6 text-trade-amber" />
            </div>
            <h2 className="text-lg font-display font-semibold text-trade-navy mb-2">
              Settings Under Development
            </h2>
            <p className="text-trade-muted text-sm">
              Full settings panel with profile management, notification preferences, and default configurations coming soon.
            </p>
          </div>
        </div>
      </div>
    </TradeLayout>
  );
}
