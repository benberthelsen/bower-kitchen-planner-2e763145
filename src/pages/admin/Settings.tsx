import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Download, RefreshCw, Loader2, CheckCircle2, XCircle, AlertCircle, Plus, Trash2, Save } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useDimensionPresets, DimensionPreset } from '@/hooks/useDimensionPresets';

// ─── Deployment readiness ─────────────────────────────────────────────────────

interface CheckResult {
  label: string;
  ok: boolean | null;   // null = pending
  detail: string;
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />;
  if (ok) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function DeploymentReadiness() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    const results: CheckResult[] = [];

    // 1. Supabase URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
    results.push({
      label: 'VITE_SUPABASE_URL set',
      ok: !!supabaseUrl && !supabaseUrl.includes('placeholder'),
      detail: supabaseUrl
        ? supabaseUrl.replace(/^https?:\/\//, '').slice(0, 40)
        : 'Missing — add to .env.local',
    });

    // 2. Anon key
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
    results.push({
      label: 'VITE_SUPABASE_ANON_KEY set',
      ok: !!anonKey && anonKey.length > 20,
      detail: anonKey ? `${anonKey.slice(0, 6)}…${anonKey.slice(-4)}` : 'Missing',
    });

    // 3. HTTPS
    const isHttps = window.location.protocol === 'https:';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    results.push({
      label: 'Served over HTTPS',
      ok: isHttps || isLocalhost,
      detail: isLocalhost ? `localhost (OK for dev)` : window.location.origin,
    });

    // 4. Supabase connectivity
    setChecks([...results, { label: 'Supabase connectivity', ok: null, detail: 'Pinging…' }]);
    try {
      const { error } = await supabase.from('jobs').select('id', { count: 'exact', head: true });
      results.push({
        label: 'Supabase connectivity',
        ok: !error,
        detail: error ? error.message : 'Connected successfully',
      });
    } catch (e) {
      results.push({
        label: 'Supabase connectivity',
        ok: false,
        detail: (e as Error).message,
      });
    }

    // 5. Production build
    const isProd = import.meta.env.PROD;
    results.push({
      label: 'Production build',
      ok: isProd,
      detail: isProd ? 'Running production bundle' : 'Running dev server (expected locally)',
    });

    // 6. Auth working
    const { data: { session } } = await supabase.auth.getSession();
    results.push({
      label: 'Admin session active',
      ok: !!session,
      detail: session ? session.user.email ?? 'Authenticated' : 'No session — log in as admin',
    });

    setChecks(results);
    setRunning(false);
  };

  const allOk = checks.length > 0 && checks.every(c => c.ok !== false);
  const hasFailures = checks.some(c => c.ok === false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Deployment Readiness</CardTitle>
            <CardDescription>Pre-flight checks before going live.</CardDescription>
          </div>
          {checks.length > 0 && (
            <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${
              allOk ? 'bg-green-100 text-green-700' :
              hasFailures ? 'bg-red-100 text-red-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {allOk ? '✓ Ready' : hasFailures ? '✗ Issues found' : 'Checking…'}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {checks.length > 0 && (
          <div className="divide-y rounded-lg border overflow-hidden">
            {checks.map(c => (
              <div key={c.label} className="flex items-center gap-3 px-4 py-3 bg-white">
                <StatusIcon ok={c.ok} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{c.label}</p>
                  <p className="text-xs text-gray-400 truncate">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!running && checks.length === 0 && (
          <p className="text-sm text-gray-500">
            Run the checks to verify your environment is ready for production.
          </p>
        )}

        {allOk && (
          <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>All checks passed. Deploy with <code className="bg-green-100 px-1 rounded">npm run build</code> and host the <code className="bg-green-100 px-1 rounded">dist/</code> folder on your preferred platform.</p>
          </div>
        )}

        <Button onClick={runChecks} disabled={running} variant="outline">
          {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</> : 'Run checks'}
        </Button>

        {/* Env template */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer font-medium text-gray-600 hover:text-gray-900">
            View .env.local template
          </summary>
          <pre className="mt-2 bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto leading-relaxed">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>`}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}

// ─── Import/Export types ──────────────────────────────────────────────────────

interface ImportResult {
  success: boolean;
  imported?: number;
  categoryCounts?: Record<string, number>;
  message?: string;
  error?: string;
}

// ─── #17: Dimension presets editor ───────────────────────────────────────────

const PRESET_DIM_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'toeKickHeight', label: 'Toe Kick' },
  { key: 'baseHeight', label: 'Base H' },
  { key: 'baseDepth', label: 'Base D' },
  { key: 'wallHeight', label: 'Wall H' },
  { key: 'wallDepth', label: 'Wall D' },
  { key: 'wallMountHeight', label: 'Wall Mount H' },
  { key: 'tallHeight', label: 'Tall H' },
  { key: 'tallDepth', label: 'Tall D' },
];

function DimensionPresetsCard() {
  const { presets, fromDb, loading, save, remove, refresh } = useDimensionPresets();
  const [drafts, setDrafts] = useState<DimensionPreset[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { setDrafts(presets.map(p => ({ ...p, dimensions: { ...p.dimensions } }))); }, [presets]);

  const patchDraft = (id: string, patch: Partial<DimensionPreset>) =>
    setDrafts(ds => ds.map(d => (d.id === id ? { ...d, ...patch } : d)));

  const patchDim = (id: string, key: string, value: number) =>
    setDrafts(ds => ds.map(d => (d.id === id ? { ...d, dimensions: { ...d.dimensions, [key]: value } } : d)));

  const handleSave = async (d: DimensionPreset) => {
    setSaving(d.id);
    try {
      await save(d);
      toast.success(`Saved "${d.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save preset (admin only)');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (d: DimensionPreset) => {
    if (d.id.startsWith('standard')) { toast.error('Built-in fallback — run the dimension_presets migration first.'); return; }
    try {
      await remove(d.id);
      toast.success(`Deleted "${d.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete preset');
    }
  };

  const handleAdd = () => {
    const base = drafts[0]?.dimensions ?? {};
    setDrafts(ds => [...ds, {
      id: `new-${Date.now()}`,
      name: 'New Preset',
      sortOrder: ds.length,
      isDefault: false,
      dimensions: { ...base },
    }]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Dimension Presets</CardTitle>
            <CardDescription>
              Size presets offered in the room setup wizard (mm).
              {!fromDb && ' Currently showing built-in fallbacks — save to create DB presets.'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-1" /> Add Preset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && drafts.length === 0 && <div className="text-sm text-muted-foreground">Loading…</div>}
        {drafts.map((d) => (
          <div key={d.id} className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-3">
              <Input
                className="max-w-xs font-medium"
                value={d.name}
                onChange={(e) => patchDraft(d.id, { name: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={d.isDefault}
                  onChange={(e) => patchDraft(d.id, { isDefault: e.target.checked })}
                />
                Default
              </label>
              <div className="flex-1" />
              <Button size="sm" onClick={() => handleSave(d)} disabled={saving === d.id}>
                {saving === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span className="ml-1">Save</span>
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(d)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {PRESET_DIM_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{label}</Label>
                  <Input
                    type="number"
                    className="h-8"
                    value={d.dimensions[key] ?? ''}
                    onChange={(e) => patchDim(d.id, key, Number(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Reload
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.access_token) {
      toast.error('Please sign in as an admin to import products');
      return null;
    }

    // Ensure we have a fresh access token (prevents 401 from expired JWT)
    const { data: refreshedData } = await supabase.auth.refreshSession();
    return refreshedData.session?.access_token ?? session.access_token;
  };

  const formatFunctionError = async (error: any, response?: Response) => {
    try {
      if (response) {
        const text = await response.text();
        return `${response.status}: ${text}`;
      }
    } catch {
      // ignore
    }
    return error?.message || 'Import failed';
  };

  const syncProductsFromMicrovellum = async () => {
    try {
      // Fetch all Microvellum products and sync to products table
      const { data: mvProducts, error: fetchError } = await supabase
        .from('microvellum_products')
        .select('*');

      if (fetchError) throw fetchError;

      if (!mvProducts || mvProducts.length === 0) {
        toast.error('No Microvellum products to sync. Import products first.');
        return;
      }

      const products = mvProducts.map(item => ({
        id: item.id,
        sku: item.microvellum_link_id || item.id,
        name: item.name,
        category: item.category || null,
        item_type: item.cabinet_type || 'Cabinet',
        default_width: item.default_width,
        default_depth: item.default_depth,
        default_height: item.default_height,
        price: 0,
      }));

      const { error } = await supabase
        .from('products')
        .upsert(products, { onConflict: 'id' });

      if (error) throw error;
      toast.success(`Synced ${products.length} products from Microvellum catalog`);
    } catch (error) {
      console.error('Error syncing products:', error);
      toast.error('Failed to sync products');
    }
  };

  const handleImportFromBundled = async () => {
    const token = await getAccessToken();
    if (!token) return;

    setImporting(true);
    try {
      const response = await fetch('/data/microvellum-products.xml');
      if (!response.ok) throw new Error('Failed to load bundled XML file');
      const xmlContent = await response.text();
      
      const functions = supabase.functions;
      functions.setAuth(token);
      console.log('[import-microvellum] invoking (settings)', { tokenLen: token.length });

      const { data, error, response: fnResponse } = await functions.invoke('import-microvellum', {
        body: { xmlContent },
      });

      if (error) {
        throw new Error(await formatFunctionError(error, fnResponse));
      }

      const result = data as ImportResult;
      if (result.success) {
        toast.success(result.message || `Imported ${result.imported} products`);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import products');
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xml')) {
      toast.error('Please select an XML file');
      return;
    }

    const token = await getAccessToken();
    if (!token) return;

    setImporting(true);
    try {
      const xmlContent = await file.text();
      
      const functions = supabase.functions;
      functions.setAuth(token);
      console.log('[import-microvellum] invoking (settings upload)', { tokenLen: token.length });

      const { data, error, response: fnResponse } = await functions.invoke('import-microvellum', {
        body: { xmlContent },
      });

      if (error) {
        throw new Error(await formatFunctionError(error, fnResponse));
      }

      const result = data as ImportResult;
      if (result.success) {
        toast.success(result.message || `Imported ${result.imported} products`);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import products');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleExportProducts = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('microvellum_products')
        .select('*')
        .order('category')
        .order('name');

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('No products to export');
        return;
      }

      // Create JSON export
      const exportData = {
        exportDate: new Date().toISOString(),
        productCount: data.length,
        products: data.map(p => ({
          microvellum_link_id: p.microvellum_link_id,
          name: p.name,
          category: p.category,
          cabinet_type: p.cabinet_type,
          default_width: p.default_width,
          default_depth: p.default_depth,
          default_height: p.default_height,
          door_count: p.door_count,
          drawer_count: p.drawer_count,
          is_corner: p.is_corner,
          is_sink: p.is_sink,
          is_blind: p.is_blind,
          spec_group: p.spec_group,
          room_component_type: p.room_component_type,
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `microvellum-products-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${data.length} products`);
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(error.message || 'Failed to export products');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="grid gap-6">
        <DeploymentReadiness />
        <DimensionPresetsCard />
        <Card>
          <CardHeader>
            <CardTitle>Microvellum Product Catalog</CardTitle>
            <CardDescription>
              Import and export Microvellum product definitions. Upload an XML file or use the bundled product list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={handleImportFromBundled} 
                disabled={importing}
                variant="default"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Import Bundled Products
                  </>
                )}
              </Button>

              <Button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={importing}
                variant="secondary"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload XML File
              </Button>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                onChange={handleFileUpload}
                className="hidden"
              />

              <Button 
                onClick={handleExportProducts} 
                disabled={exporting}
                variant="outline"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Products (JSON)
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Imported products will appear in the planner sidebar and can be used for kitchen designs.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product Catalog Sync</CardTitle>
            <CardDescription>
              Sync the built-in product catalog to the database. This will create or update all products with their default prices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={syncProductsFromMicrovellum}>
              Sync Products from Microvellum
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database Info</CardTitle>
            <CardDescription>
              Information about the connected database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Tables:</strong> profiles, user_roles, products, jobs, price_history, microvellum_products</p>
            <p><strong>Features:</strong></p>
            <ul className="list-disc list-inside ml-4 text-muted-foreground">
              <li>Row Level Security (RLS) enabled on all tables</li>
              <li>Automatic profile creation on signup</li>
              <li>Role-based access control (admin, moderator, user)</li>
              <li>Price change history logging</li>
              <li>Microvellum XML import/export</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
