// Production documents panel — ordering list, cut list, packing list,
// build hours and the cost->sell breakdown, all derived from the quote BOM.

import React, { useMemo, useState } from 'react';
import { Package, Scissors, Boxes, Clock, Receipt, Download } from 'lucide-react';
import type { QuoteBOM } from '@/lib/pricing';

const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n || 0);
const num = (n: number, d = 0) => (n ?? 0).toFixed(d);

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  quoteBOM: QuoteBOM | null;
  jobName?: string;
}

const Section: React.FC<{ title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }>
  = ({ title, icon, right, children }) => (
  <div className="border rounded-md mb-3 overflow-hidden">
    <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">{icon}{title}</div>
      {right}
    </div>
    <div className="p-3 text-[11px]">{children}</div>
  </div>
);

const csvBtn = (onClick: () => void) => (
  <button onClick={onClick} className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800">
    <Download size={12} /> CSV
  </button>
);

export default function ProductionPanel({ quoteBOM, jobName = 'kitchen' }: Props) {
  // Flattened cut list: same panel+size aggregated across the job.
  const cutList = useMemo(() => {
    const map = new Map<string, { name: string; length: number; width: number; role: string; qty: number }>();
    for (const c of quoteBOM?.cabinets ?? []) {
      for (const p of c.parts) {
        const L = Math.round(p.length), W = Math.round(p.width);
        const key = `${p.name}|${L}x${W}`;
        const row = map.get(key);
        if (row) row.qty += p.quantity;
        else map.set(key, { name: p.name, length: L, width: W, role: (p as { materialRole?: string }).materialRole ?? 'carcase', qty: p.quantity });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || b.length - a.length);
  }, [quoteBOM]);

  if (!quoteBOM || quoteBOM.cabinets.length === 0) {
    return <div className="p-4 text-xs text-gray-500">Add cabinets to generate production documents.</div>;
  }

  const g = quoteBOM.grandTotal;
  const bh = quoteBOM.buildHours;
  const totalPanels = cutList.reduce((s, r) => s + r.qty, 0);
  const totalSheets = quoteBOM.consolidatedSheets.reduce((s, sh) => s + sh.sheetsRequired, 0);
  const hasCommercial = (g.margin + g.designFee + g.delivery + g.install + g.clientMarkup) > 0.005;

  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between py-0.5 ${strong ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );

  return (
    <div className="space-y-1">
      {/* Cost -> Sell */}
      <Section title="Quote summary" icon={<Receipt size={13} />}>
        {row('Materials (board)', money(g.materials))}
        {row('Edging', money(g.edging))}
        {row('Hardware', money(g.hardware))}
        {row('Handling / machining / assembly', money(g.handling + g.machining + g.assembly))}
        {row('Labor', money(g.labor))}
        <div className="border-t my-1" />
        {row('Cost (ex GST)', money(g.cost), true)}
        {hasCommercial && <>
          {g.margin > 0 && row('+ Margin', money(g.margin))}
          {g.designFee > 0 && row('+ Design fee', money(g.designFee))}
          {g.delivery > 0 && row('+ Delivery', money(g.delivery))}
          {g.install > 0 && row('+ Install', money(g.install))}
          {g.clientMarkup > 0 && row('+ Client markup', money(g.clientMarkup))}
          <div className="border-t my-1" />
          {row('Sell (ex GST)', money(g.subtotalExGst), true)}
        </>}
        {row('GST', money(g.gst))}
        {row('TOTAL (inc GST)', money(g.total), true)}
      </Section>

      {/* Build hours */}
      <Section title="Build hours" icon={<Clock size={13} />}>
        {row('Cutting', `${num(bh.cut, 2)} h`)}
        {row('Edge-banding', `${num(bh.edge, 2)} h`)}
        {row('Assembly', `${num(bh.assembly, 2)} h`)}
        <div className="border-t my-1" />
        {row('Total build time', `${num(bh.total, 1)} h`, true)}
        <div className="text-[10px] text-gray-400 mt-1">Hours-cost {money(bh.cost)} — scheduling cross-check vs costed labor {money(g.labor)}.</div>
      </Section>

      {/* Ordering list */}
      <Section title="Ordering list" icon={<Package size={13} />}
        right={csvBtn(() => downloadCsv(`${jobName}-ordering.csv`, [
          ['Category', 'Item', 'Qty', 'Cost'],
          ...quoteBOM.consolidatedSheets.map(s => ['Board', s.materialName, `${s.sheetsRequired} sheets`, s.totalMaterialCost.toFixed(2)]),
          ...quoteBOM.consolidatedEdgeTape.map(e => ['Edge tape', e.edgeName, `${e.rollsRequired ?? ''} x ${e.rollLengthM ?? ''}m`, e.totalCost.toFixed(2)]),
          ...quoteBOM.consolidatedHardware.map(h => ['Hardware', h.name, `${h.quantity}`, h.totalCost.toFixed(2)]),
        ]))}>
        <div className="font-semibold text-gray-500 mb-1">Board</div>
        {quoteBOM.consolidatedSheets.map((s, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span className="text-gray-700">{s.materialName}{s.materialRole === 'exterior' ? ' (doors)' : ''}</span>
            <span className="text-gray-600">{s.sheetsRequired} sht · {money(s.totalMaterialCost)}</span>
          </div>
        ))}
        <div className="font-semibold text-gray-500 mt-2 mb-1">Edge tape</div>
        {quoteBOM.consolidatedEdgeTape.map((e, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span className="text-gray-700">{e.edgeName}</span>
            <span className="text-gray-600">{e.rollsRequired} × {e.rollLengthM}m · {money(e.totalCost)}</span>
          </div>
        ))}
        <div className="font-semibold text-gray-500 mt-2 mb-1">Hardware</div>
        {quoteBOM.consolidatedHardware.map((h, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span className="text-gray-700">{h.name}</span>
            <span className="text-gray-600">{h.quantity} ea · {money(h.totalCost)}</span>
          </div>
        ))}
      </Section>

      {/* Cut list */}
      <Section title={`Cut list — ${totalPanels} panels, ${totalSheets} sheets`} icon={<Scissors size={13} />}
        right={csvBtn(() => downloadCsv(`${jobName}-cutlist.csv`, [
          ['Panel', 'Length', 'Width', 'Material', 'Qty'],
          ...cutList.map(r => [r.name, r.length, r.width, r.role, r.qty]),
        ]))}>
        <table className="w-full">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="font-medium pb-1">Panel</th>
              <th className="font-medium pb-1 text-right">Size (mm)</th>
              <th className="font-medium pb-1 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {cutList.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-0.5 text-gray-700">{r.name}{r.role === 'exterior' ? ' *' : ''}</td>
                <td className="py-0.5 text-right text-gray-600">{r.length}×{r.width}</td>
                <td className="py-0.5 text-right text-gray-700">{r.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[10px] text-gray-400 mt-1">* exterior/door finish</div>
      </Section>

      {/* Packing list per cabinet */}
      <Section title="Packing list" icon={<Boxes size={13} />}>
        {quoteBOM.cabinets.map((c, i) => (
          <details key={i} className="mb-1.5">
            <summary className="cursor-pointer text-gray-700 font-medium">
              {c.cabinetNumber} {c.cabinetName !== 'Unknown' ? c.cabinetName : c.cabinetSku} · {money(c.totalCost)}
            </summary>
            <div className="pl-3 pt-1 pb-2">
              <div className="text-gray-400 font-medium">Panels</div>
              {c.parts.map((p, j) => (
                <div key={j} className="flex justify-between text-gray-600">
                  <span>{p.quantity}× {p.name}</span>
                  <span>{Math.round(p.length)}×{Math.round(p.width)}</span>
                </div>
              ))}
              {c.hardware.filter(h => h.quantity > 0).length > 0 && <>
                <div className="text-gray-400 font-medium mt-1">Hardware bag</div>
                {c.hardware.filter(h => h.quantity > 0).map((h, j) => (
                  <div key={j} className="flex justify-between text-gray-600">
                    <span>{h.name}</span><span>{h.quantity}×</span>
                  </div>
                ))}
              </>}
            </div>
          </details>
        ))}
      </Section>
    </div>
  );
}
