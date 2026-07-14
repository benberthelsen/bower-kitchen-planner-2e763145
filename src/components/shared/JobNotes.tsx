/**
 * Shared job notes / activity timeline component.
 * Used in AdminJobDetail (isAdmin=true) and trade JobEditor (isAdmin=false).
 * Shows chronological thread of notes with author, role badge, and time.
 * Admins see internal notes and can mark new notes as internal.
 */

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Send, Lock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobNote {
  id: string;
  job_id: string;
  author_id: string | null;
  author_name: string | null;
  author_role: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

interface JobNotesProps {
  jobId: string;
  isAdmin: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function roleBadge(role: string, isInternal: boolean) {
  if (role === 'system') return <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">System</Badge>;
  if (isInternal) return <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">Admin · Internal</Badge>;
  if (role === 'admin') return <Badge className="text-xs bg-slate-100 text-slate-700 border-slate-200">Admin</Badge>;
  return <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">Trade</Badge>;
}

const modKeyLabel = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function JobNotes({ jobId, isAdmin }: JobNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotes();
  }, [jobId]);

  const loadNotes = async () => {
    if (!jobId || jobId === 'new') { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('job_notes')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load job notes:', error);
    } else {
      setNotes((data as JobNote[]) || []);
    }
    setLoading(false);
  };

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();

      const { error } = await supabase.from('job_notes').insert({
        job_id: jobId,
        author_id: user?.id,
        author_name: profile?.full_name ?? user?.email ?? 'Unknown',
        author_role: isAdmin ? 'admin' : 'trade',
        content: content.trim(),
        is_internal: isAdmin ? isInternal : false,
      });

      if (error) throw error;
      setContent('');
      setIsInternal(false);
      await loadNotes();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      toast.error('Failed to add note');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <MessageSquare className="w-4 h-4" />
          Activity &amp; Notes
          {notes.length > 0 && (
            <span className="text-xs text-gray-400 font-normal">({notes.length})</span>
          )}
        </div>
        <button
          onClick={loadNotes}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Notes thread */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No notes yet.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {notes.map(note => (
            <div
              key={note.id}
              className={cn(
                'rounded-lg px-3.5 py-3 border text-sm',
                note.author_role === 'system'
                  ? 'bg-gray-50 border-gray-100 text-gray-500'
                  : note.is_internal
                    ? 'bg-amber-50 border-amber-100'
                    : 'bg-white border-gray-200',
              )}
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-medium text-gray-800 text-xs">
                  {note.author_name ?? (note.author_role === 'system' ? 'System' : 'Unknown')}
                </span>
                {roleBadge(note.author_role, note.is_internal)}
                <span className="text-xs text-gray-400 ml-auto">{timeAgo(note.created_at)}</span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Add note */}
      <div className="space-y-2 pt-1 border-t border-gray-100">
        <Textarea
          placeholder={isAdmin ? `Add a note… (${modKeyLabel}Enter to send)` : `Add a note to this job… (${modKeyLabel}Enter to send)`}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          className="text-sm resize-none"
        />
        <div className="flex items-center gap-3">
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={e => setIsInternal(e.target.checked)}
                className="rounded"
              />
              <Lock className="w-3 h-3" />
              Internal only
            </label>
          )}
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            disabled={!content.trim() || submitting}
            onClick={submit}
          >
            {submitting
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />}
            {submitting ? 'Sending…' : 'Add note'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Utility: insert a system note (status change, etc.) without UI. Never throws. */
export async function addSystemNote(jobId: string, content: string): Promise<void> {
  try {
    await supabase.from('job_notes').insert({
      job_id: jobId,
      author_role: 'system',
      author_name: 'System',
      content,
      is_internal: false,
    });
  } catch {
    // System notes are non-critical
  }
}
