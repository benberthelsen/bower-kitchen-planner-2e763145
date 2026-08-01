import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Search, Save, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAllPricingRows } from '@/lib/pricing/fetchAllPricingRows';

interface BenchtopRecord {
  id: string;
  brand: string;
  range_tier: string | null;
  material_type: string;
  pricing_method: string;
  stock_length_mm: number;
  stock_depth_mm: number;
  price_per_sheet: number | null;
  price_per_lm: number | null;
  trade_supply_per_sqm: number;
  install_per_lm: number | null;
  install_supply_per_sqm: number;
  supplier: string | null;
  item_code: string | null;
  catalog_finish_id: string | null;
  supply_pathway: 'stock_preformed' | 'stock_sheet_fabricated' | 'supplier_custom' | 'made_to_order';
  profile_type: string;
  thickness_mm: number | null;
  minimum_order_length_mm: number;
  minimum_charge: number;
  waste_factor: number;
  minimum_sheet_quantity: number;
  cut_to_length_cost: number;
  cnc_setup_cost: number;
  cnc_cut_per_lm: number;
  join_cost: number;
  sanding_polishing_per_lm: number;
  edge_finish_per_lm: number;
  finished_end_cost: number;
  sink_cutout_cost: number;
  cooktop_cutout_cost: number;
  tap_hole_cost: number;
  supplier_order_fee: number;
  freight_cost: number;
  is_default: boolean;
  is_active: boolean;
  price_status: 'base_only' | 'confirmed' | 'needs_review';
  notes: string | null;
  width_price_tiers: Array<{
    min_depth_mm: number;
    max_depth_mm: number;
    one_edge_price_per_lm: number;
    two_edge_price_per_lm: number;
  }> | null;
  quoted_edge_count: 1 | 2;
  surface_surcharge_pct: number;
  circular_surcharge_pct: number;
  double_sided_surcharge_pct: number;
  length_rounding_mm: number;
  account_discount_pct: number | null;
  operation_rates: Record<string, number> | null;
  source_document: string | null;
  source_page: string | null;
  source_date: string | null;
}

const BLANK: Omit<BenchtopRecord, 'id'> = {
  brand: '',
  range_tier: '',
  material_type: 'solid_surface',
  pricing_method: 'per_sheet',
  stock_length_mm: 3660,
  stock_depth_mm: 760,
  price_per_sheet: null,
  price_per_lm: null,
  trade_supply_per_sqm: 0,
  install_per_lm: null,
  install_supply_per_sqm: 0,
  supplier: '',
  item_code: '',
  catalog_finish_id: '',
  supply_pathway: 'stock_sheet_fabricated',
  profile_type: 'square_edge',
  thickness_mm: 12,
  minimum_order_length_mm: 0,
  minimum_charge: 0,
  waste_factor: 0.05,
  minimum_sheet_quantity: 1,
  cut_to_length_cost: 0,
  cnc_setup_cost: 0,
  cnc_cut_per_lm: 0,
  join_cost: 0,
  sanding_polishing_per_lm: 0,
  edge_finish_per_lm: 0,
  finished_end_cost: 0,
  sink_cutout_cost: 0,
  cooktop_cutout_cost: 0,
  tap_hole_cost: 0,
  supplier_order_fee: 0,
  freight_cost: 0,
  is_default: false,
  is_active: true,
  price_status: 'base_only',
  notes: '',
  width_price_tiers: [],
  quoted_edge_count: 1,
  surface_surcharge_pct: 0,
  circular_surcharge_pct: 0,
  double_sided_surcharge_pct: 0,
  length_rounding_mm: 0,
  account_discount_pct: null,
  operation_rates: {},
  source_document: '',
  source_page: '',
  source_date: null,
};

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  solid_surface: 'Solid Surface',
  laminate: 'Laminate',
  stone: 'Stone',
};

const PRICING_METHOD_LABELS: Record<string, string> = {
  per_sheet: 'Per Sheet',
  per_lm: 'Per LM',
  per_sqm: 'Per m²',
};

const PATHWAY_LABELS: Record<BenchtopRecord['supply_pathway'], string> = {
  stock_preformed: 'Stock pre-formed top',
  stock_sheet_fabricated: 'Sheet + in-house fabrication',
  supplier_custom: 'Supplier custom order',
  made_to_order: 'Made-to-order press/postformed',
};

const MATRIX_FIELDS: Array<{ key: keyof BenchtopRecord; label: string; suffix: string; step?: string }> = [
  { key: 'minimum_charge', label: 'Minimum completed top', suffix: '$' },
  { key: 'cut_to_length_cost', label: 'Cut to length', suffix: '$/run' },
  { key: 'cnc_setup_cost', label: 'CNC / fabrication setup', suffix: '$/job' },
  { key: 'cnc_cut_per_lm', label: 'CNC cutting', suffix: '$/LM' },
  { key: 'sanding_polishing_per_lm', label: 'Sand + polish', suffix: '$/LM' },
  { key: 'edge_finish_per_lm', label: 'Finished edge', suffix: '$/LM' },
  { key: 'join_cost', label: 'Join', suffix: '$/join' },
  { key: 'finished_end_cost', label: 'Finished end', suffix: '$/end' },
  { key: 'sink_cutout_cost', label: 'Sink cut-out', suffix: '$/each' },
  { key: 'cooktop_cutout_cost', label: 'Cooktop cut-out', suffix: '$/each' },
  { key: 'tap_hole_cost', label: 'Tap hole', suffix: '$/each' },
  { key: 'supplier_order_fee', label: 'Supplier order fee', suffix: '$/job' },
  { key: 'freight_cost', label: 'Freight', suffix: '$/job' },
];

function MatrixInputs({
  value,
  onChange,
}: {
  value: Partial<BenchtopRecord>;
  onChange: (patch: Partial<BenchtopRecord>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div>
          <p className="mb-1 text-xs font-medium">Supply pathway</p>
          <Select value={value.supply_pathway ?? 'supplier_custom'} onValueChange={(v) => onChange({ supply_pathway: v as BenchtopRecord['supply_pathway'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PATHWAY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><p className="mb-1 text-xs font-medium">Supplier</p><Input value={value.supplier ?? ''} onChange={(e) => onChange({ supplier: e.target.value })} /></div>
        <div><p className="mb-1 text-xs font-medium">Supplier item code</p><Input value={value.item_code ?? ''} onChange={(e) => onChange({ item_code: e.target.value })} /></div>
        <div><p className="mb-1 text-xs font-medium">Profile</p><Input value={value.profile_type ?? ''} onChange={(e) => onChange({ profile_type: e.target.value })} placeholder="postformed / square edge" /></div>
        <div><p className="mb-1 text-xs font-medium">Thickness (mm)</p><Input type="number" value={value.thickness_mm ?? ''} onChange={(e) => onChange({ thickness_mm: e.target.value ? +e.target.value : null })} /></div>
        <div><p className="mb-1 text-xs font-medium">Minimum order length (mm)</p><Input type="number" value={value.minimum_order_length_mm ?? 0} onChange={(e) => onChange({ minimum_order_length_mm: +e.target.value })} /></div>
        <div><p className="mb-1 text-xs font-medium">Sheet waste allowance</p><Input type="number" min="0" max="0.25" step="0.01" value={value.waste_factor ?? 0.05} onChange={(e) => onChange({ waste_factor: +e.target.value })} /></div>
        <div><p className="mb-1 text-xs font-medium">Minimum sheets</p><Input type="number" min="1" step="1" value={value.minimum_sheet_quantity ?? 1} onChange={(e) => onChange({ minimum_sheet_quantity: +e.target.value })} /></div>
        <div>
          <p className="mb-1 text-xs font-medium">Supplier-priced edges</p>
          <Select value={String(value.quoted_edge_count ?? 1)} onValueChange={(v) => onChange({ quoted_edge_count: Number(v) as 1 | 2 })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="1">One edge</SelectItem><SelectItem value="2">Two edges</SelectItem></SelectContent>
          </Select>
        </div>
        <div><p className="mb-1 text-xs font-medium">Finish surcharge (%)</p><Input type="number" min="0" step="0.1" value={value.surface_surcharge_pct ?? 0} onChange={(e) => onChange({ surface_surcharge_pct: +e.target.value })} /></div>
        <div><p className="mb-1 text-xs font-medium">Billing increment (mm)</p><Input type="number" min="0" step="10" value={value.length_rounding_mm ?? 0} onChange={(e) => onChange({ length_rounding_mm: +e.target.value })} /></div>
        <div>
          <p className="mb-1 text-xs font-medium">Confirmed account discount (%)</p>
          <Input type="number" min="0" max="100" step="0.1" value={value.account_discount_pct ?? ''} placeholder="Unknown - no discount" onChange={(e) => onChange({ account_discount_pct: e.target.value === '' ? null : +e.target.value })} />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium">Price completeness</p>
          <Select value={value.price_status ?? 'base_only'} onValueChange={(v) => onChange({ price_status: v as BenchtopRecord['price_status'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="base_only">Supplier/base only</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="confirmed">Complete + confirmed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium">Availability</p>
          <Select value={value.is_active === false ? 'inactive' : 'active'} onValueChange={(v) => onChange({ is_active: v === 'active' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium">Room fallback</p>
          <Select value={value.is_default ? 'default' : 'standard'} onValueChange={(v) => onChange({ is_default: v === 'default' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="standard">Normal option</SelectItem><SelectItem value="default">Default for legacy rooms</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      {Array.isArray(value.width_price_tiers) && value.width_price_tiers.length > 0 && (
        <div className="rounded-md border bg-background p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier width-band list rates (ex GST)</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {value.width_price_tiers.map((tier) => (
              <div key={`${tier.min_depth_mm}-${tier.max_depth_mm}`} className="rounded border px-3 py-2 text-xs">
                <span className="font-medium">{tier.min_depth_mm}-{tier.max_depth_mm}mm</span>
                <span className="ml-2 text-muted-foreground">1 edge ${tier.one_edge_price_per_lm.toFixed(2)}/LM · 2 edges ${tier.two_edge_price_per_lm.toFixed(2)}/LM</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fabrication and order charges (ex GST)</p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {MATRIX_FIELDS.map((field) => (
            <div key={field.key}>
              <p className="mb-1 text-xs font-medium">{field.label} <span className="text-muted-foreground">{field.suffix}</span></p>
              <Input type="number" min="0" step="0.01" value={(value[field.key] as number | null | undefined) ?? 0} onChange={(e) => onChange({ [field.key]: +e.target.value })} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div><p className="mb-1 text-xs font-medium">Source document</p><Input value={value.source_document ?? ''} onChange={(e) => onChange({ source_document: e.target.value })} /></div>
        <div><p className="mb-1 text-xs font-medium">Source page</p><Input value={value.source_page ?? ''} onChange={(e) => onChange({ source_page: e.target.value })} /></div>
        <div><p className="mb-1 text-xs font-medium">Source date</p><Input type="date" value={value.source_date ?? ''} onChange={(e) => onChange({ source_date: e.target.value || null })} /></div>
      </div>
      <div><p className="mb-1 text-xs font-medium">Pricing notes</p><Input value={value.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Source list, lead time, exclusions, fabrication assumptions" /></div>
    </div>
  );
}

function methodBadgeVariant(method: string): "default" | "secondary" | "outline" {
  if (method === 'per_sheet') return 'default';
  if (method === 'per_lm') return 'secondary';
  return 'outline';
}

function formatPrice(record: BenchtopRecord): string {
  if (record.pricing_method === 'per_sheet' && record.price_per_sheet != null)
    return `$${record.price_per_sheet.toFixed(2)}/sht`;
  if (record.pricing_method === 'per_lm' && record.price_per_lm != null) {
    const rates = record.width_price_tiers?.map(tier => tier.one_edge_price_per_lm) ?? [];
    const base = rates.length > 0
      ? `$${Math.min(...rates).toFixed(2)}-$${Math.max(...rates).toFixed(2)}/LM`
      : `$${record.price_per_lm.toFixed(2)}/LM`;
    return record.surface_surcharge_pct > 0 ? `${base} +${record.surface_surcharge_pct}%` : base;
  }
  return `$${record.trade_supply_per_sqm.toFixed(2)}/m²`;
}

export default function BenchtopPricing() {
  const [records, setRecords] = useState<BenchtopRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<BenchtopRecord>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newRecord, setNewRecord] = useState<Omit<BenchtopRecord, 'id'>>(BLANK);

  useEffect(() => { loadRecords(); }, []);

  const loadRecords = async () => {
    try {
      const data = await fetchAllPricingRows<BenchtopRecord>('benchtop_pricing');
      setRecords(data.sort((a, b) => a.brand.localeCompare(b.brand)));
    } catch (error) {
      toast.error('Failed to load benchtop pricing');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const recs = lines.slice(1).filter(l => l.trim()).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const r: Record<string, string> = {};
      headers.forEach((h, i) => { r[h] = values[i] ?? ''; });
      return r;
    });
    toast.info(`Importing ${recs.length} benchtop items…`);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pricing`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ table: 'benchtop_pricing', records: recs }),
      }
    );
    const result = await response.json();
    if (result.success) {
      toast.success(`Imported ${result.inserted} benchtop items`);
      loadRecords();
    } else {
      toast.error(result.error ?? 'Import failed');
    }
  };

  const startEdit = (item: BenchtopRecord) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (editValues.is_default) {
      await (supabase as any).from('benchtop_pricing').update({ is_default: false }).neq('id', editingId);
    }
    const { error } = await (supabase as any)
      .from('benchtop_pricing')
      .update(editValues)
      .eq('id', editingId);
    if (error) { toast.error('Failed to save'); return; }
    toast.success('Saved');
    setEditingId(null);
    loadRecords();
  };

  const addRecord = async () => {
    if (!newRecord.brand) { toast.error('Brand is required'); return; }
    if (newRecord.is_default) {
      await (supabase as any).from('benchtop_pricing').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    }
    const { error } = await (supabase as any).from('benchtop_pricing').insert(newRecord);
    if (error) { toast.error('Failed to add record'); return; }
    toast.success('Record added');
    setShowAdd(false);
    setNewRecord(BLANK);
    loadRecords();
  };

  const filtered = records.filter(r =>
    r.brand.toLowerCase().includes(search.toLowerCase()) ||
    r.range_tier?.toLowerCase().includes(search.toLowerCase()) ||
    r.material_type?.toLowerCase().includes(search.toLowerCase()) ||
    r.supply_pathway?.toLowerCase().includes(search.toLowerCase()) ||
    r.supplier?.toLowerCase().includes(search.toLowerCase()) ||
    r.item_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Benchtop Pricing</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Material
          </Button>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
          <Button asChild variant="outline">
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-4 h-4 mr-2" /> Import CSV
            </label>
          </Button>
        </div>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <Input placeholder="Brand (e.g. Meganite)" value={newRecord.brand}
                onChange={e => setNewRecord({ ...newRecord, brand: e.target.value })} />
              <Input placeholder="Range / tier" value={newRecord.range_tier ?? ''}
                onChange={e => setNewRecord({ ...newRecord, range_tier: e.target.value })} />
              <Select value={newRecord.material_type}
                onValueChange={v => setNewRecord({ ...newRecord, material_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid_surface">Solid Surface</SelectItem>
                  <SelectItem value="laminate">Laminate</SelectItem>
                  <SelectItem value="stone">Stone</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newRecord.pricing_method}
                onValueChange={v => setNewRecord({ ...newRecord, pricing_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_sheet">Per Sheet</SelectItem>
                  <SelectItem value="per_lm">Per LM</SelectItem>
                  <SelectItem value="per_sqm">Per m²</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <Input type="number" placeholder="Stock length mm"
                value={newRecord.stock_length_mm}
                onChange={e => setNewRecord({ ...newRecord, stock_length_mm: +e.target.value })} />
              <Input type="number" placeholder="Stock depth mm"
                value={newRecord.stock_depth_mm}
                onChange={e => setNewRecord({ ...newRecord, stock_depth_mm: +e.target.value })} />
              {newRecord.pricing_method === 'per_sheet' && (
                <Input type="number" placeholder="$/sheet"
                  value={newRecord.price_per_sheet ?? ''}
                  onChange={e => setNewRecord({ ...newRecord, price_per_sheet: +e.target.value })} />
              )}
              {newRecord.pricing_method === 'per_lm' && (
                <>
                  <Input type="number" placeholder="$/LM supply"
                    value={newRecord.price_per_lm ?? ''}
                    onChange={e => setNewRecord({ ...newRecord, price_per_lm: +e.target.value })} />
                  <Input type="number" placeholder="$/LM install"
                    value={newRecord.install_per_lm ?? ''}
                    onChange={e => setNewRecord({ ...newRecord, install_per_lm: +e.target.value })} />
                </>
              )}
              {newRecord.pricing_method === 'per_sqm' && (
                <>
                  <Input type="number" placeholder="Trade supply $/m²"
                    value={newRecord.trade_supply_per_sqm}
                    onChange={e => setNewRecord({ ...newRecord, trade_supply_per_sqm: +e.target.value })} />
                  <Input type="number" placeholder="Install $/m²"
                    value={newRecord.install_supply_per_sqm}
                    onChange={e => setNewRecord({ ...newRecord, install_supply_per_sqm: +e.target.value })} />
                </>
              )}
            </div>
            <div className="mb-4 rounded-lg border bg-muted/20 p-4">
              <MatrixInputs value={newRecord} onChange={(patch) => setNewRecord({ ...newRecord, ...patch })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={addRecord}>Save</Button>
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewRecord(BLANK); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingId && (
        <Card className="border-primary/30">
          <CardHeader>
            <div>
              <h2 className="font-semibold">Finished-top matrix</h2>
              <p className="text-sm text-muted-foreground">Supplier product plus CNC, fabrication, finishing, cut-out, order and freight charges.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <MatrixInputs value={editValues} onChange={(patch) => setEditValues({ ...editValues, ...patch })} />
            <div className="flex gap-2">
              <Button onClick={saveEdit}><Save className="mr-2 h-4 w-4" />Save complete matrix</Button>
              <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search benchtop materials…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 max-w-md" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Range / Tier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Pathway</TableHead>
                  <TableHead>Stock (L × D mm)</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.brand}</TableCell>
                    {editingId === item.id ? (
                      <>
                        <TableCell>
                          <Input value={editValues.range_tier ?? ''}
                            onChange={e => setEditValues({ ...editValues, range_tier: e.target.value })}
                            className="w-36" />
                        </TableCell>
                        <TableCell className="min-w-48">
                          <Select value={editValues.supply_pathway ?? 'supplier_custom'} onValueChange={(v) => setEditValues({ ...editValues, supply_pathway: v as BenchtopRecord['supply_pathway'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(PATHWAY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={editValues.material_type ?? 'solid_surface'}
                            onValueChange={v => setEditValues({ ...editValues, material_type: v })}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="solid_surface">Solid Surface</SelectItem>
                              <SelectItem value="laminate">Laminate</SelectItem>
                              <SelectItem value="stone">Stone</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={editValues.pricing_method ?? 'per_sheet'}
                            onValueChange={v => setEditValues({ ...editValues, pricing_method: v })}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_sheet">Per Sheet</SelectItem>
                              <SelectItem value="per_lm">Per LM</SelectItem>
                              <SelectItem value="per_sqm">Per m²</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Input type="number" value={editValues.stock_length_mm ?? 0}
                              onChange={e => setEditValues({ ...editValues, stock_length_mm: +e.target.value })}
                              className="w-20" />
                            <Input type="number" value={editValues.stock_depth_mm ?? 0}
                              onChange={e => setEditValues({ ...editValues, stock_depth_mm: +e.target.value })}
                              className="w-20" />
                          </div>
                        </TableCell>
                        <TableCell>
                          {editValues.pricing_method === 'per_sheet' && (
                            <Input type="number" value={editValues.price_per_sheet ?? ''}
                              onChange={e => setEditValues({ ...editValues, price_per_sheet: +e.target.value })}
                              className="w-24" placeholder="$/sht" />
                          )}
                          {editValues.pricing_method === 'per_lm' && (
                            <div className="flex gap-1">
                              <Input type="number" value={editValues.price_per_lm ?? ''}
                                onChange={e => setEditValues({ ...editValues, price_per_lm: +e.target.value })}
                                className="w-20" placeholder="$/LM" />
                              <Input type="number" value={editValues.install_per_lm ?? ''}
                                onChange={e => setEditValues({ ...editValues, install_per_lm: +e.target.value })}
                                className="w-20" placeholder="inst" />
                            </div>
                          )}
                          {editValues.pricing_method === 'per_sqm' && (
                            <div className="flex gap-1">
                              <Input type="number" value={editValues.trade_supply_per_sqm ?? 0}
                                onChange={e => setEditValues({ ...editValues, trade_supply_per_sqm: +e.target.value })}
                                className="w-20" placeholder="$/m²" />
                              <Input type="number" value={editValues.install_supply_per_sqm ?? 0}
                                onChange={e => setEditValues({ ...editValues, install_supply_per_sqm: +e.target.value })}
                                className="w-20" placeholder="inst" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{item.range_tier}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{MATERIAL_TYPE_LABELS[item.material_type] ?? item.material_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={methodBadgeVariant(item.pricing_method)}>
                            {PRICING_METHOD_LABELS[item.pricing_method] ?? item.pricing_method}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{PATHWAY_LABELS[item.supply_pathway] ?? item.supply_pathway}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.stock_length_mm} × {item.stock_depth_mm}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{formatPrice(item)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>Edit</Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length === 0 && !loading && (
            <p className="text-center py-8 text-muted-foreground">
              No benchtop materials found. Run the Supabase migration then add records.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
