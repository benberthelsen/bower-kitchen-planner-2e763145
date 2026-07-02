import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Link2 } from 'lucide-react';
import type { FlushWallId } from './flushToWall';

const FLUSH_LABELS: Record<FlushWallId, string> = {
  back: 'Flush back wall',
  left: 'Flush left wall',
  right: 'Flush right wall',
  front: 'Flush front wall',
};

export function FlushToWallBadge({ wall }: { wall: FlushWallId }) {
  return (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900">
      <Link2 className="mr-1 h-3 w-3" />
      {FLUSH_LABELS[wall]}
    </Badge>
  );
}
