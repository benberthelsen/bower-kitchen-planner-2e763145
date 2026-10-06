import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { linkScannerRoom, readScannerSession, scannerApiOrigin,
  type ScannerSession } from '@/lib/roomScan/scannerSession';

interface PhotoEntry { id: string; bytes: number }
interface EvidenceManifest { captureId: string; sourceRevision?: string; photos: PhotoEntry[] }

/** Photos are read through a short-lived, capture-scoped capability. Image
 * bytes are never saved in the job or eagerly loaded as a large gallery. */
export default function ScannerEvidencePanel({ captureId, sourceRevision, jobId, roomId,
  initialSession }: { captureId: string; sourceRevision?: string; jobId: string; roomId: string;
  initialSession?: ScannerSession | null }) {
  const session = initialSession?.captureId === captureId ? initialSession : readScannerSession(captureId);
  const origin = scannerApiOrigin();
  const [manifest, setManifest] = useState<EvidenceManifest | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkPending, setLinkPending] = useState(Boolean(session?.linkToken));
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!origin || !session?.evidenceToken) return;
    const controller = new AbortController();
    fetch(`${origin}/api/room-capture/jobs/${captureId}/planner-evidence`, {
      headers: { Authorization: `Bearer ${session.evidenceToken}` }, signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`Photo access expired (${response.status}). Reopen the scan.`);
      const data = await response.json() as EvidenceManifest;
      if (data.captureId !== captureId || !Array.isArray(data.photos)) throw new Error('Scanner evidence is invalid.');
      setManifest(data);
    }).catch(error => {
      if (!controller.signal.aborted) setManifestError(error instanceof Error ? error.message : 'Could not load photos.');
    });
    return () => controller.abort();
  }, [captureId, origin, session?.evidenceToken]);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const openPhoto = async (photoId: string) => {
    if (!origin || !session?.evidenceToken) return;
    setSelectedPhoto(photoId);
    setManifestError('');
    try {
      const response = await fetch(`${origin}/api/room-capture/jobs/${captureId}/planner-evidence/photos/${encodeURIComponent(photoId)}`, {
        headers: { Authorization: `Bearer ${session.evidenceToken}` },
      });
      if (!response.ok) throw new Error(`Photo access expired (${response.status}). Reopen the scan.`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Scanner returned an invalid photo.');
      setPhotoUrl(URL.createObjectURL(blob));
    } catch (error) {
      setManifestError(error instanceof Error ? error.message : 'Could not load photo.');
    }
  };

  const retryLink = async () => {
    if (!session) return;
    setLinkError('');
    try { await linkScannerRoom(session, jobId, roomId, sourceRevision); setLinkPending(false); }
    catch (error) { setLinkError(error instanceof Error ? error.message : 'Could not link scanner.'); }
  };

  return <section className="border-t p-4 space-y-3" aria-label="Scan photos and provenance">
    <h2 className="font-semibold">Scan evidence</h2>
    <p className="text-xs text-muted-foreground">Capture {captureId.slice(0, 8)} · source {sourceRevision ?? 'unversioned'}.
      These photos support visual review; room lengths still need site checks.</p>
    {linkPending && <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      <p>The room is saved, but its link back to the scanner is pending.</p>
      <Button size="sm" variant="outline" onClick={() => void retryLink()}>Retry scanner link</Button>
      {linkError && <p role="alert" className="text-red-700">{linkError}</p>}
    </div>}
    {!session?.evidenceToken && <p className="text-sm text-amber-800">Reopen this room from its scan to view private photos.</p>}
    {manifest && <>
      <p className="text-sm">{manifest.photos.length} private scan photos available for review.</p>
      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        {manifest.photos.map(photo => <Button key={photo.id} size="sm" variant={selectedPhoto === photo.id ? 'default' : 'outline'}
          onClick={() => void openPhoto(photo.id)} aria-label={`Open scan photo ${photo.id}`}>
          {photo.id}
        </Button>)}
      </div>
    </>}
    {manifestError && <p role="alert" className="text-sm text-red-700">{manifestError}</p>}
    {photoUrl && <img src={photoUrl} alt={`Scan evidence photo ${selectedPhoto ?? ''}`}
      className="max-h-72 w-full rounded border object-contain" />}
  </section>;
}
