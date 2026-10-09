import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { linkScannerRoom, loadScannerManifest, loadScannerPhoto, readScannerSession, ScannerBridgeError,
  type ScannerEvidenceManifest, type ScannerSession } from '@/lib/roomScan/scannerSession';
import { scannerEntryUrl } from '@/lib/roomScan/scannerEntryUrl';

/** Photos are read through a short-lived, capture-scoped capability. Image
 * bytes are never saved in the job or eagerly loaded as a large gallery. */
export default function ScannerEvidencePanel({ captureId, sourceRevision, jobId, roomId,
  initialSession }: { captureId: string; sourceRevision?: string; jobId: string; roomId: string;
  initialSession?: ScannerSession | null }) {
  const session = initialSession?.captureId === captureId ? initialSession : readScannerSession(captureId);
  const evidenceToken = session?.evidenceToken;
  const [manifest, setManifest] = useState<ScannerEvidenceManifest | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkExpired, setLinkExpired] = useState(false);
  const [linkPending, setLinkPending] = useState(Boolean(session?.linkToken));
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // The scanner's draft page is the only place that issues a fresh photo
  // capability; link there when the planner knows the scanner's address.
  const reopenUrl = scannerEntryUrl({ page: 'capture', captureId });

  useEffect(() => {
    if (!evidenceToken) return;
    let active = true;
    void loadScannerManifest({ captureId, evidenceToken }, jobId, roomId, sourceRevision)
      .then(data => { if (active) { setManifest(data); setManifestError(''); } })
      .catch(error => { if (active) setManifestError(error instanceof Error ? error.message : 'Could not load photos.'); });
    return () => { active = false; };
  }, [captureId, jobId, roomId, sourceRevision, evidenceToken]);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const openPhoto = async (photoId: string) => {
    if (!session?.evidenceToken) return;
    setSelectedPhoto(photoId);
    setManifestError('');
    try {
      const blob = await loadScannerPhoto(session, jobId, roomId, sourceRevision, photoId);
      setPhotoUrl(URL.createObjectURL(blob));
    } catch (error) {
      setManifestError(error instanceof Error ? error.message : 'Could not load photo.');
    }
  };

  const retryLink = async () => {
    if (!session) return;
    setLinkError('');
    try { await linkScannerRoom(session, jobId, roomId, sourceRevision); setLinkPending(false); }
    catch (error) {
      // An expired link cannot succeed on retry; offer the scan instead.
      setLinkExpired(error instanceof ScannerBridgeError && (error.status === 401 || error.status === 409));
      setLinkError(error instanceof Error ? error.message : 'Could not link scanner.');
    }
  };

  return <section className="border-t p-4 space-y-3" aria-label="Scan photos">
    <h2 className="font-semibold">Photos from your scan</h2>
    <p className="text-xs text-muted-foreground">These photos help you check the room; wall lengths still need site checks.</p>
    {linkPending && <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      <p>The room is saved, but its link back to the scan has not finished.</p>
      {linkExpired
        ? reopenUrl && <a className="underline underline-offset-2" href={reopenUrl}>Open the scan and press its kitchen planner button</a>
        : <Button size="sm" variant="outline" onClick={() => void retryLink()}>Try again</Button>}
      {linkError && <p role="alert" className="text-red-700">{linkError}</p>}
    </div>}
    {!session?.evidenceToken && <p className="text-sm text-amber-800">{reopenUrl
      ? <>To view private photos, <a className="underline underline-offset-2" href={reopenUrl}>reopen this room from its scan</a> and
        press its planner button.</>
      : 'Reopen this room from its scan to view private photos.'}</p>}
    {manifest && <>
      <p className="text-sm">{manifest.photos.length
        ? `${manifest.photos.length} photo${manifest.photos.length === 1 ? '' : 's'} from the scan.`
        : 'This scan has no photos (a corner scan is marked in AR without taking photos).'}</p>
      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        {manifest.photos.map(photo => <Button key={photo.id} size="sm" variant={selectedPhoto === photo.id ? 'default' : 'outline'}
          onClick={() => void openPhoto(photo.id)} aria-label={`Open scan photo ${Number(photo.id) + 1}`}>
          Photo {Number(photo.id) + 1}
        </Button>)}
      </div>
    </>}
    {manifestError && <p role="alert" className="text-sm text-red-700">{manifestError}
      {/expired/.test(manifestError) && reopenUrl && <> <a className="underline underline-offset-2" href={reopenUrl}>Open the scan</a></>}</p>}
    <details className="text-xs text-muted-foreground"><summary>Technical details</summary>
      Capture {captureId.slice(0, 8)} · scan revision {sourceRevision ?? 'unversioned'}</details>
    {photoUrl && <img src={photoUrl} alt={`Scan photo ${selectedPhoto ? Number(selectedPhoto) + 1 : ''}`}
      className="max-h-72 w-full rounded border object-contain" />}
  </section>;
}
