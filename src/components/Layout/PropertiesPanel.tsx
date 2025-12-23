import React, { useMemo, useState } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { CATALOG, FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS } from '../../constants';
import { Trash2 } from 'lucide-react';

interface PropertiesPanelProps {
  onClose?: () => void;
}

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n || 0);

export default function PropertiesPanel({ onClose }: PropertiesPanelProps) {
  const { items, selectedItemId, selectItem, updateItem, removeItem, room, setRoom, projectSettings, setProjectSettings, selectedFinish, setFinish, selectedBenchtop, setBenchtop, selectedKick, setKick, totalPrice } = usePlanner();
  const [tab, setTab] = useState<'job' | 'pricing' | 'selected'>('pricing');

  const selected = useMemo(() => items.find(i => i.instanceId === selectedItemId) || null, [items, selectedItemId]);
  const selectedDef = useMemo(() => selected ? CATALOG.find(d => d.id === selected.definitionId) || null : null, [selected]);

  const pricingRows = useMemo(() => {
    return items.filter(it => {
      const def = CATALOG.find(d => d.id === it.definitionId);
      return def && def.itemType === 'Cabinet';
    }).map(it => {
      const def = CATALOG.find(d => d.id === it.definitionId)!;
      return { instanceId: it.instanceId, cabinetNumber: it.cabinetNumber || '', sku: def.sku, name: def.name, price: def.price };
    });
  }, [items]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex border-b">
        {(['pricing', 'job', 'selected'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 px-3 py-2 text-xs font-medium ${tab === t ? 'bg-gray-100 border-b-2 border-blue-500' : 'hover:bg-gray-50'}`}>
            {t === 'pricing' ? 'Schedule' : t === 'job' ? 'Job Info' : 'Selected'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'pricing' && (
          <div>
            <div className="text-lg font-bold mb-3">Total: {money(totalPrice)}</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1">Ref</th>
                  <th className="text-left py-1">SKU</th>
                  <th className="text-right py-1">Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pricingRows.map(row => (
                  <tr key={row.instanceId} className={`border-b hover:bg-gray-50 cursor-pointer ${selectedItemId === row.instanceId ? 'bg-blue-50' : ''}`} onClick={() => selectItem(row.instanceId)}>
                    <td className="py-1 font-medium">{row.cabinetNumber}</td>
                    <td className="py-1">{row.sku}</td>
                    <td className="py-1 text-right">{money(row.price)}</td>
                    <td className="py-1 text-right">
                      <button onClick={e => { e.stopPropagation(); removeItem(row.instanceId); }} className="p-1 hover:bg-red-100 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'job' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Job Name</label>
              <input type="text" value={projectSettings.jobName} onChange={e => setProjectSettings({ ...projectSettings, jobName: e.target.value })} className="w-full px-2 py-1 text-sm border rounded" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Reference</label>
              <input type="text" value={projectSettings.jobReference} onChange={e => setProjectSettings({ ...projectSettings, jobReference: e.target.value })} className="w-full px-2 py-1 text-sm border rounded" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contact</label>
              <input type="text" value={projectSettings.contactNumber} onChange={e => setProjectSettings({ ...projectSettings, contactNumber: e.target.value })} className="w-full px-2 py-1 text-sm border rounded" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Room Width (mm)</label>
              <input type="number" value={room.width} onChange={e => setRoom({ ...room, width: Number(e.target.value) })} className="w-full px-2 py-1 text-sm border rounded" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Room Depth (mm)</label>
              <input type="number" value={room.depth} onChange={e => setRoom({ ...room, depth: Number(e.target.value) })} className="w-full px-2 py-1 text-sm border rounded" />
            </div>
          </div>
        )}

        {tab === 'selected' && (
          <div>
            {selected && selectedDef ? (
              <div className="space-y-3">
                <div className="font-medium">{selectedDef.name}</div>
                <div className="text-xs text-gray-500">{selectedDef.sku}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500">W:</span> {selected.width}mm</div>
                  <div><span className="text-gray-500">H:</span> {selected.height}mm</div>
                  <div><span className="text-gray-500">D:</span> {selected.depth}mm</div>
                </div>
                <button onClick={() => removeItem(selected.instanceId)} className="w-full py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600">Delete Cabinet</button>
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-8">Select a cabinet to view details</div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t space-y-2">
        <div>
          <label className="block text-xs font-medium mb-1">Finish</label>
          <select value={selectedFinish.id} onChange={e => setFinish(FINISH_OPTIONS.find(f => f.id === e.target.value)!)} className="w-full px-2 py-1 text-xs border rounded">
            {FINISH_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Benchtop</label>
          <select value={selectedBenchtop.id} onChange={e => setBenchtop(BENCHTOP_OPTIONS.find(f => f.id === e.target.value)!)} className="w-full px-2 py-1 text-xs border rounded">
            {BENCHTOP_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Kick</label>
          <select value={selectedKick.id} onChange={e => setKick(KICK_OPTIONS.find(f => f.id === e.target.value)!)} className="w-full px-2 py-1 text-xs border rounded">
            {KICK_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
