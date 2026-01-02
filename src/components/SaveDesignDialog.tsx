import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useExternalDesignSync } from '@/hooks/useExternalDesignSync';
import { Loader2, Save, Send } from 'lucide-react';

interface SaveDesignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'save' | 'quote';
}

export function SaveDesignDialog({ open, onOpenChange, mode = 'save' }: SaveDesignDialogProps) {
  const { saveDesignToExternal, createLead } = useExternalDesignSync();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    designName: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    propertyAddress: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Always save the design first
      const design = await saveDesignToExternal({
        designName: formData.designName || 'Untitled Design',
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        notes: formData.notes,
      });

      // If quote mode, also create a lead
      if (mode === 'quote' && design) {
        await createLead({
          name: formData.customerName || 'Anonymous',
          email: formData.customerEmail,
          phone: formData.customerPhone,
          propertyAddress: formData.propertyAddress,
          notes: formData.notes,
        }, design.id);
      }

      onOpenChange(false);
      setFormData({
        designName: '',
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        propertyAddress: '',
        notes: '',
      });
    } finally {
      setLoading(false);
    }
  };

  const isQuoteMode = mode === 'quote';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isQuoteMode ? 'Request a Quote' : 'Save Your Design'}
          </DialogTitle>
          <DialogDescription>
            {isQuoteMode 
              ? 'Fill in your details and we\'ll get back to you with a quote.'
              : 'Save your kitchen design to continue later or share with us.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="designName">Design Name *</Label>
            <Input
              id="designName"
              placeholder="My Dream Kitchen"
              value={formData.designName}
              onChange={(e) => setFormData(prev => ({ ...prev, designName: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Your Name {isQuoteMode && '*'}</Label>
            <Input
              id="customerName"
              placeholder="John Smith"
              value={formData.customerName}
              onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
              required={isQuoteMode}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email {isQuoteMode && '*'}</Label>
              <Input
                id="customerEmail"
                type="email"
                placeholder="john@example.com"
                value={formData.customerEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                required={isQuoteMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone</Label>
              <Input
                id="customerPhone"
                placeholder="0412 345 678"
                value={formData.customerPhone}
                onChange={(e) => setFormData(prev => ({ ...prev, customerPhone: e.target.value }))}
              />
            </div>
          </div>

          {isQuoteMode && (
            <div className="space-y-2">
              <Label htmlFor="propertyAddress">Installation Address</Label>
              <Input
                id="propertyAddress"
                placeholder="123 Main St, Sydney NSW"
                value={formData.propertyAddress}
                onChange={(e) => setFormData(prev => ({ ...prev, propertyAddress: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any special requirements or questions..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : isQuoteMode ? (
                <Send className="h-4 w-4 mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isQuoteMode ? 'Submit Quote Request' : 'Save Design'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
