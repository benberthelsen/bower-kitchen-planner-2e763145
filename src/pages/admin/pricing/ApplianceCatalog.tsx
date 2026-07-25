/**
 * Admin — Appliance Catalog (Stage 1).
 *
 * CRUD for `appliance_products`. Includes:
 *  - Category filter + search
 *  - Add / edit dialog with brand, dims, cutouts, prices, finish
 *  - Image upload + GLB/USDZ upload to the `appliance-assets` bucket
 *    (warns when GLB > 8 MB; validates file extensions)
 *  - "Confirm price" clears the placeholder flag once a real numeric price
 *    has been entered
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Search, Upload, Trash2 } from 'lucide-react';
import type { ApplianceProductRecord } from '@/lib/pricing/types';

const CATEGORIES = ['oven', 'cooktop', 'rangehood', 'dishwasher', 'sink', 'tap', 'microwave', 'fridge', 'washing_machine', 'other'] as const;
const BUCKET = 'appliance-assets';
const GLB_WARN_BYTES = 8 * 1024 * 1024;

type FormState = Partial<ApplianceProductRecord>;

function emptyForm(): FormState {
  return {
    name: '',
    brand: '',
    category: 'oven',
    is_active: true,
    price_is_placeholder: true,
    sort_order: 0,
  };
}

export default function ApplianceCatalogAdmin() {
  const [rows, setRows] = useState<ApplianceProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'image' | 'model' | 'ios' | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('appliance_products')
      .select('*')
      .order('category')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) toast.error(error.message);
    setRows(((data as ApplianceProductRecord[]) ?? []));
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.brand ?? '').toLowerCase().includes(q) ||
        (r.item_code ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, categoryFilter]);

  function openNew() {
    setEditing(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(row: ApplianceProductRecord) {
    setEditing({ ...row });
    setDialogOpen(true);
  }

  async function handleUpload(kind: 'image' | 'model' | 'ios', file: File) {
    if (kind === 'model' && !/\.(glb|gltf)$/i.test(file.name)) {
      toast.error('GLB/GLTF required for 3D model');
      return;
    }
    if (kind === 'ios' && !/\.usdz$/i.test(file.name)) {
      toast.error('USDZ file required for iOS AR');
      return;
    }
    if (kind === 'model' && file.size > GLB_WARN_BYTES) {
      toast.warning(`GLB is ${(file.size / 1024 / 1024).toFixed(1)} MB — recommended under 8 MB`);
    }
    setUploading(kind);
    try {
      const ts = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${editing.category ?? 'other'}/${ts}-${safeName}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;
      setEditing((prev) => ({
        ...prev,
        ...(kind === 'image' ? { image_url: url } : {}),
        ...(kind === 'model' ? { model_url: url } : {}),
        ...(kind === 'ios' ? { model_ios_url: url } : {}),
      }));
      toast.success('Uploaded');
    } catch (err: any) {
      toast.error(err?.message ?? 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    if (!editing.name || !editing.category) {
      toast.error('Name and category required');
      return;
    }
    setSaving(true);
    const payload: any = { ...editing };
    delete payload.created_at;
    delete payload.updated_at;
    try {
      if (payload.id) {
        const { error } = await (supabase as any).from('appliance_products').update(payload).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('appliance_products').insert(payload);
        if (error) throw error;
      }
      toast.success('Saved');
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this appliance? Placed items keep their snapshot and stay priced.')) return;
    const { error } = await (supabase as any).from('appliance_products').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted');
    await load();
  }

  async function confirmPrice(row: ApplianceProductRecord) {
    const { error } = await (supabase as any).from('appliance_products')
      .update({ price_is_placeholder: false })
      .eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Price confirmed');
    await load();
  }

  const priceOf = (r: ApplianceProductRecord) => r.installed_price ?? r.sell_price ?? r.rrp ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appliance Catalog</h1>
          <p className="text-sm text-muted-foreground">Ovens, cooktops, rangehoods, dishwashers, sinks & taps offered to homeowners.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Add appliance</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name, brand or code" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>W×H×D (mm)</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.image_url ? (
                          <img src={r.image_url} alt="" className="w-12 h-12 object-cover rounded border" />
                        ) : (
                          <div className="w-12 h-12 rounded border bg-muted" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.brand ?? '—'}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.width_mm ?? '—'} × {r.height_mm ?? '—'} × {r.depth_mm ?? '—'}
                      </TableCell>
                      <TableCell>
                        {priceOf(r) > 0 ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(priceOf(r)) : '—'}
                        {r.price_is_placeholder && priceOf(r) > 0 && (
                          <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300 bg-amber-50">placeholder</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Hidden'}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {r.price_is_placeholder && priceOf(r) > 0 && (
                          <Button size="sm" variant="outline" onClick={() => confirmPrice(r)}>Confirm price</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No appliances match.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing.id ? 'Edit appliance' : 'New appliance'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *">
              <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Brand">
              <Input value={editing.brand ?? ''} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} />
            </Field>
            <Field label="Item code">
              <Input value={editing.item_code ?? ''} onChange={(e) => setEditing({ ...editing, item_code: e.target.value })} />
            </Field>
            <Field label="Category *">
              <Select value={editing.category ?? 'oven'} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subcategory">
              <Input value={editing.subcategory ?? ''} onChange={(e) => setEditing({ ...editing, subcategory: e.target.value })} />
            </Field>
            <Field label="Finish">
              <Input value={editing.finish ?? ''} onChange={(e) => setEditing({ ...editing, finish: e.target.value })} />
            </Field>
            <Field label="Description" full>
              <Textarea rows={2} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>

            <Field label="Width (mm)"><NumInput value={editing.width_mm} onChange={(v) => setEditing({ ...editing, width_mm: v })} /></Field>
            <Field label="Height (mm)"><NumInput value={editing.height_mm} onChange={(v) => setEditing({ ...editing, height_mm: v })} /></Field>
            <Field label="Depth (mm)"><NumInput value={editing.depth_mm} onChange={(v) => setEditing({ ...editing, depth_mm: v })} /></Field>
            <Field label="Cutout W (mm)"><NumInput value={editing.cutout_width_mm} onChange={(v) => setEditing({ ...editing, cutout_width_mm: v })} /></Field>
            <Field label="Cutout H (mm)"><NumInput value={editing.cutout_height_mm} onChange={(v) => setEditing({ ...editing, cutout_height_mm: v })} /></Field>
            <Field label="Cutout D (mm)"><NumInput value={editing.cutout_depth_mm} onChange={(v) => setEditing({ ...editing, cutout_depth_mm: v })} /></Field>

            <Field label="RRP $"><NumInput value={editing.rrp} onChange={(v) => setEditing({ ...editing, rrp: v })} /></Field>
            <Field label="Sell $"><NumInput value={editing.sell_price} onChange={(v) => setEditing({ ...editing, sell_price: v })} /></Field>
            <Field label="Installed $"><NumInput value={editing.installed_price} onChange={(v) => setEditing({ ...editing, installed_price: v })} /></Field>
            <Field label="Sort order"><NumInput value={editing.sort_order} onChange={(v) => setEditing({ ...editing, sort_order: v })} /></Field>

            <Field label="Power requirements" full>
              <Input value={editing.power_requirements ?? ''} onChange={(e) => setEditing({ ...editing, power_requirements: e.target.value })} />
            </Field>

            <Field label="Image" full>
              <div className="flex items-center gap-3">
                {editing.image_url && <img src={editing.image_url} alt="" className="w-16 h-16 object-cover rounded border" />}
                <UploadButton kind="image" busy={uploading === 'image'} onFile={(f) => handleUpload('image', f)} accept="image/*" />
                {editing.image_url && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, image_url: null })}>Clear</Button>
                )}
              </div>
            </Field>

            <Field label="3D model (.glb / .gltf) — Stage 2" full>
              <div className="flex items-center gap-3">
                {editing.model_url && <span className="text-xs text-muted-foreground truncate max-w-xs">{editing.model_url}</span>}
                <UploadButton kind="model" busy={uploading === 'model'} onFile={(f) => handleUpload('model', f)} accept=".glb,.gltf" />
                {editing.model_url && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, model_url: null })}>Clear</Button>
                )}
              </div>
            </Field>

            <Field label="iOS AR (.usdz) — Stage 2" full>
              <div className="flex items-center gap-3">
                {editing.model_ios_url && <span className="text-xs text-muted-foreground truncate max-w-xs">{editing.model_ios_url}</span>}
                <UploadButton kind="ios" busy={uploading === 'ios'} onFile={(f) => handleUpload('ios', f)} accept=".usdz" />
                {editing.model_ios_url && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, model_ios_url: null })}>Clear</Button>
                )}
              </div>
            </Field>

            <Field label="Active">
              <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
            </Field>
            <Field label="Price is placeholder">
              <Switch checked={editing.price_is_placeholder ?? true} onCheckedChange={(v) => setEditing({ ...editing, price_is_placeholder: v })} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function NumInput({ value, onChange }: { value?: number | null; onChange: (v: number | null) => void }) {
  return (
    <Input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' ? null : Number(raw));
      }}
    />
  );
}

function UploadButton({ kind, busy, onFile, accept }: { kind: string; busy: boolean; onFile: (f: File) => void; accept: string }) {
  const id = `upload-${kind}`;
  return (
    <>
      <input id={id} type="file" accept={accept} className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }} />
      <Button asChild size="sm" variant="outline" disabled={busy}>
        <label htmlFor={id} className="cursor-pointer">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Upload
        </label>
      </Button>
    </>
  );
}
