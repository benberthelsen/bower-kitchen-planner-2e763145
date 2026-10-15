import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { CustomerScanError, customerScanMessage, loadCustomerScan, loadCustomerScanPhoto,
  type CustomerScanCapture } from '@/lib/roomScan/customerScanPhotos';

const PAGE = 24;
const AT_ONCE = 4;
const messageOf = (error: unknown) => error instanceof CustomerScanError ? error.message : customerScanMessage(0);

/** Staff view of a customer's photo-walk photos, read from the public scanner
 * with the staff member's own sign-in. Nothing is fetched until it is opened;
 * photos load a page at a time and their object URLs are released on close. */
export default function CustomerScanPhotos({ captureId }: { captureId: string }) {
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState<CustomerScanCapture | null>(null);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState('');
  const token = useRef('');
  const urls = useRef<string[]>([]);

  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    if (!open || capture || error) return;
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      token.current = data.session?.access_token ?? '';
      if (!token.current) throw new CustomerScanError(customerScanMessage(401), 401);
      const loaded = await loadCustomerScan(captureId, token.current);
      if (active) setCapture(loaded);
    })().catch(failure => { if (active) setError(messageOf(failure)); });
    return () => { active = false; };
  }, [open, capture, error, captureId]);

  useEffect(() => {
    if (!capture || error) return;
    const next = capture.photos.slice(photos.length, Math.min(limit, photos.length + AT_ONCE));
    if (!next.length) return;
    let active = true;
    Promise.all(next.map(photo => loadCustomerScanPhoto(captureId, photo.id, token.current))).then(blobs => {
      const added = blobs.map((blob, index) => ({ id: next[index].id, url: URL.createObjectURL(blob) }));
      if (!active) { added.forEach(photo => URL.revokeObjectURL(photo.url)); return; }
      urls.current.push(...added.map(photo => photo.url));
      setPhotos(list => [...list, ...added]);
    }, failure => { if (active) setError(messageOf(failure)); });
    return () => { active = false; };
  }, [capture, captureId, error, limit, photos.length]);

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Customer scan photos</Button>;
  const total = capture?.photos.length ?? 0;
  return <section className="space-y-2" aria-label="Customer scan photos">
    <p className="text-sm font-medium">Customer scan photos</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p>
      : !capture ? <p className="text-sm text-muted-foreground">Loading the scan…</p>
      : <p className="text-xs text-muted-foreground">
          {total ? `${total} photo${total === 1 ? '' : 's'}` : 'No photos were saved with this scan.'}
          {capture.status ? ` · ${capture.status}` : ''}{capture.created ? ` · ${capture.created.slice(0, 10)}` : ''}
        </p>}
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {photos.map((photo, index) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
        <img src={photo.url} alt={`Scan photo ${index + 1}`} className="aspect-square w-full rounded border object-cover" />
      </a>)}
    </div>
    {!error && photos.length < total && (photos.length >= limit
      ? <Button size="sm" variant="outline" onClick={() => setLimit(value => value + PAGE)}>Show more photos</Button>
      : <p className="text-xs text-muted-foreground">Loading photos {photos.length + 1}–{Math.min(limit, total)}…</p>)}
  </section>;
}
