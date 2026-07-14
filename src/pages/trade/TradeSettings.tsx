import React from 'react';
import { useNavigate } from 'react-router-dom';
import TradeLayout from './components/TradeLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTradeSettings } from '@/hooks/useTradeSettings';
import { useHardwareDefaults } from '@/hooks/useHardwareDefaults';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function TradeSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, updateSettings, markupProfiles, loadingProfiles } = useTradeSettings(user?.id);
  const { hardware } = useHardwareDefaults();

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/trade/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-trade-navy">Trade Settings</h1>
            <p className="text-trade-muted text-sm">Persisted defaults for materials, hardware, and markup profile</p>
          </div>
        </div>

        <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="material-default">Default material</Label>
            <Input
              id="material-default"
              value={settings.materialDefault}
              onChange={(e) => updateSettings({ materialDefault: e.target.value })}
              placeholder="e.g. Prime Oak"
            />
          </div>

          <div className="space-y-2">
            <Label>Default hardware SKU</Label>
            <Select value={settings.hardwareSku || 'none'} onValueChange={(value) => updateSettings({ hardwareSku: value === 'none' ? '' : value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a hardware SKU" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {hardware.map((item) => (
                  <SelectItem key={item.id} value={item.sku}>{item.name} ({item.sku})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default markup profile</Label>
            <Select value={settings.markupProfileId || 'none'} onValueChange={(value) => updateSettings({ markupProfileId: value === 'none' ? '' : value })}>
              <SelectTrigger>
                <SelectValue placeholder={loadingProfiles ? 'Loading profiles...' : 'Select a markup profile'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {markupProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => toast.success('Trade defaults saved', { description: 'Your settings are persisted for this account.' })}
            className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Defaults
          </Button>
        </div>
      </div>
    </TradeLayout>
  );
}
