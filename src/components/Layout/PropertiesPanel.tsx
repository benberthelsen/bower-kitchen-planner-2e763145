import React, { useMemo, useState } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { CATALOG, FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS } from '../../constants';
import { Trash2, Settings, Box, Ruler, Wrench, Home, FileText, Download } from 'lucide-react';
import CabinetPropertiesTab from './CabinetPropertiesTab';
import GlobalDimensionsPanel from './GlobalDimensionsPanel';
import HardwareOptionsPanel from './HardwareOptionsPanel';
import RoomConfigPanel from './RoomConfigPanel';

interface PropertiesPanelProps {
  onClose?: () => void;
}

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n || 0);

type TabId = 'schedule' | 'selected' | 'dimensions' | 'hardware' | 'room' | 'materials';

export default function PropertiesPanel({ onClose }: PropertiesPanelProps) {
  const { 
    items, selectedItemId, selectItem, removeItem, 
    projectSettings, setProjectSettings, 
    selectedFinish, setFinish, 
    selectedBenchtop, setBenchtop, 
    selectedKick, setKick, 
    totalPrice, placeOrder 
  } = usePlanner();
  
  const [activeTab, setActiveTab] = useState<TabId>('schedule');

  const selected = useMemo(() => items.find(i => i.instanceId === selectedItemId) || null, [items, selectedItemId]);
  const selectedDef = useMemo(() => selected ? CATALOG.find(d => d.id === selected.definitionId) || null : null, [selected]);

  // Auto-switch to selected tab when item selected
  React.useEffect(() => {
    if (selected && selectedDef) {
      setActiveTab('selected');
    }
  }, [selectedItemId]);

  const pricingRows = useMemo(() => {
    return items.filter(it => {
      const def = CATALOG.find(d => d.id === it.definitionId);
      return def && (def.itemType === 'Cabinet' || def.itemType === 'Appliance');
    }).map(it => {
      const def = CATALOG.find(d => d.id === it.definitionId)!;
      return { 
        instanceId: it.instanceId, 
        cabinetNumber: it.cabinetNumber || '', 
        sku: def.sku, 
        name: def.name, 
        price: def.price,
        category: def.category || def.itemType
      };
    });
  }, [items]);

  const handleExportSchedule = () => {
    const order = placeOrder();
    const blob = new Blob([JSON.stringify(order, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectSettings.jobName || 'kitchen-order'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'schedule', label: 'Schedule', icon: <FileText size={14} /> },
    { id: 'selected', label: 'Cabinet', icon: <Box size={14} /> },
    { id: 'materials', label: 'Finishes', icon: <Settings size={14} /> },
    { id: 'dimensions', label: 'Dims', icon: <Ruler size={14} /> },
    { id: 'hardware', label: 'Hardware', icon: <Wrench size={14} /> },
    { id: 'room', label: 'Room', icon: <Home size={14} /> },
  ];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Tab Bar */}
      <div className="flex border-b overflow-x-auto">
        {tabs.map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)} 
            className={`flex items-center gap-1 px-2 py-2 text-[10px] font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id 
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="space-y-3">
            {/* Job Info */}
            <div className="space-y-2 pb-3 border-b">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Job Name</label>
                <input 
                  type="text" 
                  value={projectSettings.jobName} 
                  onChange={e => setProjectSettings({ ...projectSettings, jobName: e.target.value })} 
                  className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500" 
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Reference</label>
                  <input 
                    type="text" 
                    value={projectSettings.jobReference} 
                    onChange={e => setProjectSettings({ ...projectSettings, jobReference: e.target.value })} 
                    className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Contact</label>
                  <input 
                    type="text" 
                    value={projectSettings.contactNumber} 
                    onChange={e => setProjectSettings({ ...projectSettings, contactNumber: e.target.value })} 
                    className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-bold text-blue-600">{money(totalPrice)}</span>
            </div>

            {/* Cabinet List */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium">Ref</th>
                    <th className="text-left py-2 px-2 font-medium">SKU</th>
                    <th className="text-right py-2 px-2 font-medium">Price</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        No cabinets added yet
                      </td>
                    </tr>
                  ) : (
                    pricingRows.map(row => (
                      <tr 
                        key={row.instanceId} 
                        className={`border-t hover:bg-gray-50 cursor-pointer ${
                          selectedItemId === row.instanceId ? 'bg-blue-50' : ''
                        }`} 
                        onClick={() => selectItem(row.instanceId)}
                      >
                        <td className="py-1.5 px-2 font-mono text-blue-600">{row.cabinetNumber}</td>
                        <td className="py-1.5 px-2">{row.sku}</td>
                        <td className="py-1.5 px-2 text-right">{money(row.price)}</td>
                        <td className="py-1.5 px-1">
                          <button 
                            onClick={e => { e.stopPropagation(); removeItem(row.instanceId); }} 
                            className="p-1 hover:bg-red-100 rounded"
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Export Button */}
            <button 
              onClick={handleExportSchedule}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Download size={14} />
              Export Schedule
            </button>
          </div>
        )}

        {/* Selected Cabinet Tab */}
        {activeTab === 'selected' && (
          <>
            {selected && selectedDef ? (
              <CabinetPropertiesTab item={selected} def={selectedDef} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Box size={32} className="mb-2" />
                <p className="text-sm">Select a cabinet to edit</p>
              </div>
            )}
          </>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Door Finish</label>
              <div className="grid grid-cols-2 gap-2">
                {FINISH_OPTIONS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFinish(f)}
                    className={`flex items-center gap-2 p-2 rounded border text-left transition-colors ${
                      selectedFinish.id === f.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div 
                      className="w-6 h-6 rounded border border-gray-200" 
                      style={{ backgroundColor: f.hex }}
                    />
                    <span className="text-xs truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Benchtop</label>
              <div className="grid grid-cols-2 gap-2">
                {BENCHTOP_OPTIONS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setBenchtop(f)}
                    className={`flex items-center gap-2 p-2 rounded border text-left transition-colors ${
                      selectedBenchtop.id === f.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div 
                      className="w-6 h-6 rounded border border-gray-200" 
                      style={{ backgroundColor: f.hex }}
                    />
                    <span className="text-xs truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Toe Kick</label>
              <div className="grid grid-cols-2 gap-2">
                {KICK_OPTIONS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setKick(f)}
                    className={`flex items-center gap-2 p-2 rounded border text-left transition-colors ${
                      selectedKick.id === f.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div 
                      className="w-6 h-6 rounded border border-gray-200" 
                      style={{ backgroundColor: f.hex }}
                    />
                    <span className="text-xs truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dimensions Tab */}
        {activeTab === 'dimensions' && <GlobalDimensionsPanel />}

        {/* Hardware Tab */}
        {activeTab === 'hardware' && <HardwareOptionsPanel />}

        {/* Room Tab */}
        {activeTab === 'room' && <RoomConfigPanel />}
      </div>
    </div>
  );
}
