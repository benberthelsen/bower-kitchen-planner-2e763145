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

function methodBadgeVariant(method: string): "default" | "secondary" | "outline" {
  if (method === 'per_sheet') return 'default';
  if (method === 'per_lm') return 'secondary';
  return 'outline';
}

function formatPrice(record: BenchtopRecord): string {
  if (record.pricing_method === 'per_sheet' && record.price_per_sheet != null)
    return `$${record.price_per_sheet.toFixed(2)}/sht`;
  if (record.pricing_method === 'per_lm' && record.price_per_lm != null)
    return `$${record.price_per_lm.toFixed(2)}/LM`;
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
    const { data, error } = await supabase
      .from('benchtop_pricing')
      .select('*')
      .order('brand');
    if (error) {
      toast.error('Failed to load benchtop pricing');
      console.error(error);
    } else {
      setRecords((data ?? []) as BenchtopRecord[]);
    }
    setLoading(false);
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
    const { error } = await supabase
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
    const { error } = await supabase.from('benchtop_pricing').insert(newRecord);
    if (error) { toast.error('Failed to add record'); return; }
    toast.success('Record added');
    setShowAdd(false);
    setNewRecord(BLANK);
    loadRecords();
  };

  const filtered = records.filter(r =>
    r.brand.toLowerCase().includes(search.toLowerCase()) ||
    r.range_tier?.toLowerCase().includes(search.toLowerCase()) ||
    r.material_type?.toLowerCase().includes(search.toLowerCase())
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
            <div className="flex gap-2">
              <Button onClick={addRecord}>Save</Button>
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewRecord(BLANK); }}>Cancel</Button>
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
