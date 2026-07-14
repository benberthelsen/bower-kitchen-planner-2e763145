/**
 * Public quote status page — /quote/:jobId
 * No authentication required. Homeowner can track their enquiry.
 * Linked from the wizard success screen.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, CheckCircle2, Clock, AlertCircle, ArrowRight,
  Home, Phone, Mail, ChevronRight,
} from 'lucide-react';

interface PublicJob {
  id: string;
  job_number: number;
  name: string;
  status: string;
  cost_incl_tax: number | null;
  created_at: string;
  design_data: Record<string, unknown> | null;
}

// Status definitions visible to homeowners
const HOMEOWNER_STATUSES: Record<string, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  step: number;
}> = {
  enquiry: {
    label: 'Enquiry Received',
    description: 'We\'ve received your kitchen enquiry and will be in touch within 1–2 business days.',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    step: 1,
  },
  draft: {
    label: 'In Review',
    description: 'Our team is reviewing your requirements and preparing a detailed quote.',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    step: 2,
  },
  pending_review: {
    label: 'Quote Ready',
    description: 'Your quote is ready! We\'ll contact you to discuss the details.',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    step: 3,
  },
  approved: {
    label: 'In Production',
    description: 'Excellent! Your kitchen has been approved and is being prepared for production.',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    step: 4,
  },
  completed: {
    label: 'Completed',
    description: 'Your kitchen project is complete. Thank you for choosing Bower Kitchens!',
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    step: 5,
  },
};

const TIMELINE_STEPS = [
  { step: 1, label: 'Enquiry' },
  { step: 2, label: 'Review' },
  { step: 3, label: 'Quote' },
  { step: 4, label: 'Production' },
  { step: 5, label: 'Complete' },
];

function StatusTimeline({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {TIMELINE_STEPS.map((s, i) => {
        const done = s.step < currentStep;
        const active = s.step === currentStep;
        return (
          <React.Fragment key={s.step}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                done
                  ? 'bg-green-500 border-green-500 text-white'
                  : active
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-white border-gray-200 text-gray-400'
              }`}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : s.step}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-amber-700' : done ? 'text-green-700' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-5 ${s.step < currentStep ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function AUD(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

export default function QuoteStatus() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    supabase
      .from('jobs')
      .select('id, job_number, name, status, cost_incl_tax, created_at, design_data')
      .eq('id', jobId)
      .in('status', Object.keys(HOMEOWNER_STATUSES)) // only show recognised statuses
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setJob(data as PublicJob);
        }
        setLoading(false);
      });
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-gray-300 mb-4" />
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Enquiry not found</h1>
        <p className="text-gray-500 max-w-sm mb-6">
          This link may be expired or the reference is incorrect. Please contact us directly.
        </p>
        <a
          href="mailto:info@bowerkitchens.com.au"
          className="inline-flex items-center gap-2 bg-amber-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-amber-600 transition-colors"
        >
          <Mail className="w-4 h-4" />
          Contact Us
        </a>
      </div>
    );
  }

  const statusInfo = HOMEOWNER_STATUSES[job.status] ?? HOMEOWNER_STATUSES.enquiry;
  const designData = job.design_data as Record<string, unknown> | null;
  const shape = String(designData?.roomShape ?? '—');
  const layout = String(designData?.layoutStyle ?? '—');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <Home className="w-5 h-5 text-amber-400" />
          <span className="font-display font-bold text-white">Bower Kitchens</span>
        </div>
        <Link
          to="/wizard"
          className="text-sm text-white/60 hover:text-white flex items-center gap-1 transition-colors"
        >
          Start a new enquiry <ChevronRight className="w-3 h-3" />
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center py-12 px-4">
        <div className="w-full max-w-lg">
          {/* Title */}
          <div className="text-center mb-8">
            <p className="text-white/60 text-sm mb-1">Enquiry Reference</p>
            <h1 className="text-3xl font-display font-bold text-white">#{job.job_number}</h1>
            <p className="text-white/70 mt-2 text-sm">{job.name}</p>
            <p className="text-white/40 text-xs mt-1">Submitted {formatDate(job.created_at)}</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            {/* Timeline */}
            <StatusTimeline currentStep={statusInfo.step} />

            {/* Status badge */}
            <div className={`rounded-xl border px-4 py-4 mb-6 ${statusInfo.bgColor} ${statusInfo.borderColor}`}>
              <div className={`flex items-center gap-2 font-semibold mb-1 ${statusInfo.color}`}>
                <Clock className="w-4 h-4" />
                {statusInfo.label}
              </div>
              <p className={`text-sm ${statusInfo.color} opacity-90`}>{statusInfo.description}</p>
            </div>

            {/* Quote summary */}
            {job.cost_incl_tax != null && job.cost_incl_tax > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 mb-6 flex items-center justify-between">
                <span className="text-sm text-slate-600 font-medium">Estimated Total (inc. GST)</span>
                <span className="text-xl font-bold text-slate-900">{AUD(job.cost_incl_tax)}</span>
              </div>
            )}

            {/* Design details */}
            {(shape !== '—' || layout !== '—') && (
              <div className="border border-gray-100 rounded-xl p-4 mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Your Selection</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {shape !== '—' && (
                    <div>
                      <span className="text-gray-500">Layout</span>
                      <p className="font-medium capitalize">{shape.replace(/-/g, ' ')}</p>
                    </div>
                  )}
                  {layout !== '—' && (
                    <div>
                      <span className="text-gray-500">Style</span>
                      <p className="font-medium capitalize">{layout.replace(/-/g, ' ')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Contact */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 font-medium mb-3">Need to speak with us?</p>
              <div className="flex flex-col gap-2">
                <a
                  href="tel:1300000000"
                  className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-amber-600 transition-colors"
                >
                  <Phone className="w-4 h-4 text-gray-400" />
                  1300 XXX XXX
                </a>
                <a
                  href="mailto:info@bowerkitchens.com.au"
                  className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-amber-600 transition-colors"
                >
                  <Mail className="w-4 h-4 text-gray-400" />
                  info@bowerkitchens.com.au
                </a>
              </div>
            </div>
          </div>

          {/* Refresh note */}
          <p className="text-center text-white/30 text-xs mt-6">
            Bookmark this page to check back on your enquiry status.
          </p>
        </div>
      </main>
    </div>
  );
}
