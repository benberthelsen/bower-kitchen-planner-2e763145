import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TradeLayout from './components/TradeLayout';

export default function JobEditor() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const isNewJob = jobId === 'new';

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/trade/dashboard')}
              className="text-trade-muted hover:text-trade-navy"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-display font-bold text-trade-navy">
                {isNewJob ? 'Create New Job' : `Job #${jobId}`}
              </h1>
              <p className="text-trade-muted text-sm">
                {isNewJob ? 'Set up your room defaults and add products' : 'Edit job details and products'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" className="border-trade-border">
              <FileDown className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Button variant="outline" className="border-trade-border">
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
            <Button className="bg-trade-amber hover:bg-trade-amber-light text-white">
              <Send className="h-4 w-4 mr-2" />
              Submit Job
            </Button>
          </div>
        </div>

        {/* Placeholder content - Room Setup Wizard will go here */}
        <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-trade-amber/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-trade-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-xl font-display font-semibold text-trade-navy mb-2">
              Room Setup Coming Next
            </h2>
            <p className="text-trade-muted mb-6">
              Phase 2 will add the room setup wizard with material defaults, hardware selections, 
              dimension presets, and the full product configurator.
            </p>
            <Button 
              onClick={() => navigate('/trade/dashboard')}
              variant="outline"
              className="border-trade-border"
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </TradeLayout>
  );
}
