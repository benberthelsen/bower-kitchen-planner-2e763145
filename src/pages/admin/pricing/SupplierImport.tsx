/**
 * R5: Unified supplier CSV import with preview/diff.
 * Flow: select table → upload CSV → review diff (new / updated / unchanged) → apply.
 * No external parser dependency — uses a minimal inline CSV parser.
 */

import React, { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Upload, Download, CheckCircle2, AlertCircle, Minus, ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react';

// ─── Table configs ───────────────────────────────────────────────────────────

type TableKey = 'material_pricing' | 'hardware_pricing' | 'edge_pricing' | 'benchtop_pricing';

interface TableConfig {
  label: string;
  description: string;
  /** Single key column name, or array for composite key */
  keyCol: string | string[];
  /** Columns whose CSV values should be parsed as float (null if empty) */
  numericCols: string[];
  /** Columns shown in the preview table */
  previewCols: string[];
  /** All importable columns (excludes id and admin-only cols) */
  importCols: string[];
}

const TABLE_CONFIGS: Record<TableKey, TableConfig> = {
  material_pricing: {
    label: 'Materials',
    description: 'Carcass / door sheet materials (item_code is the key)',
    keyCol: 'item_code',
    numericCols: ['area_cost', 'area_handling_cost', 'area_assembly_cost', 'thickness'],
    previewCols: ['item_code', 'name', 'brand', 'material_type', 'thickness', 'area_cost'],
    importCols: [
      'item_code', 'name', 'material_type', 'brand', 'finish', 'substrate', 'thickness',
      'area_cost', 'area_handling_cost', 'area_assembly_cost', 'source_supplier', 'source_url',
      'sample_image_url', 'thumbnail_url',
    ],
  },
  hardware_pricing: {
    label: 'Hardware',
    description: 'Hinges, runners, drawer systems (item_code is the key)',
    keyCol: 'item_code',
    numericCols: ['handling_cost', 'unit_cost', 'machining_cost', 'assembly_cost', 'runner_height', 'runner_depth'],
    previewCols: ['item_code', 'name', 'brand', 'hardware_type', 'unit_cost', 'handling_cost'],
    importCols: [
      'item_code', 'name', 'hardware_type', 'brand', 'series',
      'runner_height', 'runner_depth', 'handling_cost', 'unit_cost', 'machining_cost', 'assembly_cost',
    ],
  },
  edge_pricing: {
    label: 'Edge Tape',
    description: 'Edge banding and tape (item_code is the key)',
    keyCol: 'item_code',
    numericCols: ['handling_cost', 'length_cost', 'application_cost', 'thickness'],
    previewCols: ['item_code', 'name', 'brand', 'edge_type', 'length_cost', 'application_cost'],
    importCols: [
      'item_code', 'name', 'edge_type', 'brand', 'finish', 'thickness',
      'handling_cost', 'length_cost', 'application_cost',
    ],
  },
  benchtop_pricing: {
    label: 'Benchtops',
    description: 'Benchtop supply + install pricing (brand + material_type + range_tier is the key)',
    keyCol: ['brand', 'material_type', 'range_tier'],
    numericCols: [
      'stock_length_mm', 'stock_depth_mm', 'price_per_sheet', 'price_per_lm',
      'trade_supply_per_sqm', 'install_per_lm', 'install_supply_per_sqm',
    ],
    previewCols: ['brand', 'material_type', 'range_tier', 'pricing_method', 'trade_supply_per_sqm', 'install_supply_per_sqm'],
    importCols: [
      'brand', 'range_tier', 'material_type', 'pricing_method',
      'stock_length_mm', 'stock_depth_mm', 'price_per_sheet', 'price_per_lm',
      'trade_supply_per_sqm', 'install_per_lm', 'install_supply_per_sqm',
    ],
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

type DbRow = Record<string, unknown>;
type CsvRow = Record<string, string>;

interface DiffRow {
  csvRow: CsvRow;
  existing: DbRow;
  changedCols: string[];  // columns whose value differs
}

interface Diff {
  newRows: CsvRow[];
  updatedRows: DiffRow[];
  unchangedCount: number;
  unknownHeaders: string[];
}

type Phase = 'idle' | 'loading' | 'preview' | 'applying' | 'done';

// ─── CSV parser ──────────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if ((c === ',' || c === '\t') && !inQ) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseCSV(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
  return { headers, rows };
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

function getKey(row: DbRow | CsvRow, keyCol: string | string[]): string {
  if (Array.isArray(keyCol)) {
    return keyCol.map(k => String((row as Record<string, unknown>)[k] ?? '')).join('|');
  }
  return String((row as Record<string, unknown>)[keyCol] ?? '');
}

// ─── Value comparison ────────────────────────────────────────────────────────

function parseNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function valuesEqual(csvVal: string, dbVal: unknown, isNumeric: boolean): boolean {
  if (isNumeric) {
    const csv = parseNum(csvVal);
    const db = dbVal == null ? null : Number(dbVal);
    if (csv == null && db == null) return true;
    if (csv == null || db == null) return false;
    return Math.abs(csv - db) < 0.0001;
  }
  return (csvVal ?? '').trim() === String(dbVal ?? '').trim();
}

// ─── Diff computation ─────────────────────────────────────────────────────────

function computeDiff(csvRows: CsvRow[], dbRows: DbRow[], config: TableConfig): Diff {
  const { keyCol, numericCols, importCols } = config;

  // CSV header set
  const csvHeaders = Object.keys(csvRows[0] ?? {});
  const knownHeaders = new Set(importCols.map(c => c.toLowerCase()));
  const unknownHeaders = csvHeaders.filter(h => !knownHeaders.has(h) && h !== 'id');

  // DB map by key
  const dbMap = new Map<string, DbRow>();
  for (const row of dbRows) {
    dbMap.set(getKey(row, keyCol), row);
  }

  const newRows: CsvRow[] = [];
  const updatedRows: DiffRow[] = [];
  let unchangedCount = 0;

  for (const csvRow of csvRows) {
    const key = getKey(csvRow, keyCol);
    if (!key || key.replace(/\|/g, '') === '') continue; // skip rows with empty key

    const existing = dbMap.get(key);
    if (!existing) {
      newRows.push(csvRow);
      continue;
    }

    // Find changed columns (only among importCols that appear in the CSV)
    const changedCols: string[] = [];
    for (const col of importCols) {
      if (!(col in csvRow)) continue;
      const isNumeric = numericCols.includes(col);
      if (!valuesEqual(csvRow[col], existing[col], isNumeric)) {
        changedCols.push(col);
      }
    }

    if (changedCols.length > 0) {
      updatedRows.push({ csvRow, existing, changedCols });
    } else {
      unchangedCount++;
    }
  }

  return { newRows, updatedRows, unchangedCount, unknownHeaders };
}

// ─── Apply helpers ───────────────────────────────────────────────────────────

function coerceRow(csvRow: CsvRow, config: TableConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of config.importCols) {
    if (!(col in csvRow)) continue;
    const v = csvRow[col];
    if (config.numericCols.includes(col)) {
      out[col] = v === '' ? null : parseNum(v);
    } else {
      out[col] = v === '' ? null : v;
    }
  }
  return out;
}

// ─── Download template ───────────────────────────────────────────────────────

function downloadTemplate(tableKey: TableKey) {
  const config = TABLE_CONFIGS[tableKey];
  const csv = config.importCols.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tableKey}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionToggle({ label, count, colorClass, children }: {
  label: string;
  count: number;
  colorClass: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count <= 20);
  if (count === 0) return null;
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          <span className="font-medium text-sm">{label}</span>
          <Badge className={colorClass}>{count}</Badge>
        </div>
      </button>
      {open && <div className="overflow-x-auto">{children}</div>}
    </div>
  );
}

function PreviewTable({ rows, columns, highlightCols = [] }: {
  rows: CsvRow[];
  columns: string[];
  highlightCols?: string[];
}) {
  const highlightSet = new Set(highlightCols);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b bg-gray-50">
          {columns.map(c => (
            <th
              key={c}
              className={`px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap ${
                highlightSet.has(c) ? 'bg-amber-50' : ''
              }`}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
            {columns.map(c => (
              <td
                key={c}
                className={`px-3 py-1.5 whitespace-nowrap ${
                  highlightSet.has(c) ? 'bg-amber-50 font-medium' : 'text-gray-700'
                }`}
              >
                {row[c] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UpdatesTable({ rows, columns }: { rows: DiffRow[]; columns: string[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b bg-gray-50">
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Column</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap w-20">Key</th>
          <th className="px-3 py-2 text-left font-medium text-red-600 whitespace-nowrap">Old value</th>
          <th className="px-3 py-2 text-left font-medium text-green-700 whitespace-nowrap">New value</th>
        </tr>
      </thead>
      <tbody>
        {rows.flatMap(({ csvRow, existing, changedCols }, ri) =>
          changedCols.map((col, ci) => (
            <tr key={`${ri}-${ci}`} className={`border-b last:border-0 ${ci === 0 ? 'border-t-2 border-gray-200' : ''}`}>
              <td className="px-3 py-1.5 font-mono text-gray-500">{col}</td>
              <td className="px-3 py-1.5 text-gray-400 truncate max-w-[80px]">
                {getKey(csvRow, columns)}
              </td>
              <td className="px-3 py-1.5 text-red-600 line-through">
                {String(existing[col] ?? '')}
              </td>
              <td className="px-3 py-1.5 text-green-700 font-medium">
                {csvRow[col] ?? ''}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SupplierImport() {
  const [tableKey, setTableKey] = useState<TableKey>('material_pricing');
  const [phase, setPhase] = useState<Phase>('idle');
  const [diff, setDiff] = useState<Diff | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [applyResult, setApplyResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const config = TABLE_CONFIGS[tableKey];
  const totalChanges = (diff?.newRows.length ?? 0) + (diff?.updatedRows.length ?? 0);

  const reset = () => {
    setPhase('idle');
    setDiff(null);
    setCsvRows([]);
    setApplyResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv') && file.type !== 'text/csv') {
      toast.error('Please upload a .csv file');
      return;
    }
    setPhase('loading');
    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (rows.length === 0) {
        toast.error('CSV is empty or has no data rows');
        setPhase('idle');
        return;
      }

      // Validate key column(s) are present
      const keyColArr = Array.isArray(config.keyCol) ? config.keyCol : [config.keyCol];
      const missingKey = keyColArr.filter(k => !headers.includes(k));
      if (missingKey.length > 0) {
        toast.error(`CSV missing required key column(s): ${missingKey.join(', ')}`);
        setPhase('idle');
        return;
      }

      // Fetch existing rows from DB
      const { data: dbRows, error } = await supabase
        .from(tableKey)
        .select('*');

      if (error) throw error;

      const d = computeDiff(rows, dbRows as DbRow[], config);
      setCsvRows(rows);
      setDiff(d);
      setPhase('preview');

      if (d.unknownHeaders.length > 0) {
        toast.warning(`Unrecognised CSV columns will be ignored: ${d.unknownHeaders.join(', ')}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to process CSV');
      setPhase('idle');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const applyChanges = async () => {
    if (!diff) return;
    setPhase('applying');
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    try {
      // INSERT new rows in batches of 50
      const BATCH = 50;
      for (let i = 0; i < diff.newRows.length; i += BATCH) {
        const batch = diff.newRows.slice(i, i + BATCH).map(r => coerceRow(r, config));
        const { error } = await supabase.from(tableKey).insert(batch as never[]);
        if (error) { errors.push(`Insert batch ${i}: ${error.message}`); }
        else inserted += batch.length;
      }

      // UPDATE changed rows one-by-one by existing id
      for (const { csvRow, existing, changedCols } of diff.updatedRows) {
        const patch: Record<string, unknown> = {};
        for (const col of changedCols) {
          const v = csvRow[col];
          if (config.numericCols.includes(col)) {
            patch[col] = v === '' ? null : parseNum(v);
          } else {
            patch[col] = v === '' ? null : v;
          }
        }
        const { error } = await supabase
          .from(tableKey)
          .update(patch)
          .eq('id', existing.id as string);
        if (error) { errors.push(`Update ${existing.id}: ${error.message}`); }
        else updated++;
      }

      setApplyResult({ inserted, updated });
      setPhase('done');

      if (errors.length > 0) {
        toast.warning(`Applied with ${errors.length} error(s). Check console.`);
        console.error('Import errors:', errors);
      } else {
        toast.success(`Import complete: ${inserted} added, ${updated} updated`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Import failed');
      setPhase('preview');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supplier Import</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload a supplier CSV to update pricing — review the diff before applying.
        </p>
      </div>

      {/* Table selector */}
      <Card>
        <CardContent className="pt-5 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Target table</label>
            <Select value={tableKey} onValueChange={v => { setTableKey(v as TableKey); reset(); }}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TABLE_CONFIGS) as TableKey[]).map(k => (
                  <SelectItem key={k} value={k}>
                    {TABLE_CONFIGS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400 mt-1">{config.description}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate(tableKey)}
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            Download template
          </Button>
        </CardContent>
      </Card>

      {/* Upload zone (idle/loading) */}
      {(phase === 'idle' || phase === 'loading') && (
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
            isDragOver ? 'border-slate-500 bg-slate-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {phase === 'loading' ? (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <p className="font-medium">Comparing with database…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Upload className="w-8 h-8" />
              <p className="font-medium text-gray-700">Drop a CSV here or click to browse</p>
              <p className="text-sm">
                Required column: <code className="bg-gray-100 px-1 rounded text-xs text-gray-700">
                  {Array.isArray(config.keyCol) ? config.keyCol.join(', ') : config.keyCol}
                </code>
              </p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Preview / diff */}
      {(phase === 'preview' || phase === 'applying') && diff && (
        <>
          {/* Summary badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">{diff.newRows.length} new</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">{diff.updatedRows.length} updated</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              <Minus className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">{diff.unchangedCount} unchanged</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Change file
              </Button>
              <Button
                onClick={applyChanges}
                disabled={totalChanges === 0 || phase === 'applying'}
                className="gap-1.5 bg-slate-900 hover:bg-slate-800 text-white"
                size="sm"
              >
                {phase === 'applying' ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Applying…</>
                ) : (
                  <>Apply {totalChanges} change{totalChanges !== 1 ? 's' : ''}</>
                )}
              </Button>
            </div>
          </div>

          {totalChanges === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-gray-500 text-sm">
                All {diff.unchangedCount} rows are already up to date — nothing to apply.
              </CardContent>
            </Card>
          )}

          {/* New rows */}
          <SectionToggle label="New rows" count={diff.newRows.length} colorClass="bg-green-100 text-green-800 border-green-200">
            <PreviewTable rows={diff.newRows} columns={config.previewCols} />
          </SectionToggle>

          {/* Updated rows */}
          <SectionToggle label="Updated rows" count={diff.updatedRows.length} colorClass="bg-amber-100 text-amber-800 border-amber-200">
            <UpdatesTable
              rows={diff.updatedRows}
              columns={Array.isArray(config.keyCol) ? config.keyCol : [config.keyCol]}
            />
          </SectionToggle>
        </>
      )}

      {/* Done */}
      {phase === 'done' && applyResult && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div>
              <p className="text-lg font-semibold text-gray-900">Import complete</p>
              <p className="text-sm text-gray-500 mt-1">
                {applyResult.inserted} row{applyResult.inserted !== 1 ? 's' : ''} added,{' '}
                {applyResult.updated} row{applyResult.updated !== 1 ? 's' : ''} updated in{' '}
                <strong>{TABLE_CONFIGS[tableKey].label}</strong>
              </p>
            </div>
            <Button variant="outline" onClick={reset}>Import another file</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
