import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, Send, Plus, LayoutGrid, Box, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TradeLayout from './components/TradeLayout';
import RoomSetupWizard, { RoomConfig } from './components/RoomSetupWizard';
import { useTradeRoom, TradeRoom } from '@/contexts/TradeRoomContext';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { useTradeJobPersistence } from '@/hooks/useTradeJobPersistence';

const toRoomConfig = (room: TradeRoom): RoomConfig => ({
  name: room.name,
  description: room.description,
  shape: room.shape,
  roomWidth: room.config.width,
  roomDepth: room.config.depth,
  roomHeight: room.config.height,
  cutoutWidth: room.config.cutoutWidth,
  cutoutDepth: room.config.cutoutDepth,
  exteriorMaterial: room.materialDefaults.exteriorFinish,
  exteriorEdge: room.materialDefaults.edgeBanding,
  doorStyle: room.materialDefaults.doorStyle,
  carcaseMaterial: room.materialDefaults.carcaseFinish,
  carcaseEdge: room.materialDefaults.edgeBanding,
  hingeStyle: room.hardwareDefaults.hingeType,
  drawerStyle: room.hardwareDefaults.drawerType,
  supplyHardware: room.hardwareDefaults.supplyHardware,
  adjustableLegs: room.hardwareDefaults.adjustableLegs,
  toeKickHeight: room.dimensions.toeKickHeight,
  shelfSetback: room.dimensions.shelfSetback,
  baseHeight: room.dimensions.baseHeight,
  baseDepth: room.dimensions.baseDepth,
  wallHeight: room.dimensions.wallHeight,
  wallDepth: room.dimensions.wallDepth,
  tallHeight: room.dimensions.tallHeight,
  tallDepth: room.dimensions.tallDepth,
  doorGap: room.dimensions.doorGap,
  drawerGap: room.dimensions.drawerGap,
  leftGap: room.dimensions.leftGap,
  rightGap: room.dimensions.rightGap,
  upperTopMargin: room.dimensions.topMargin,
  upperBottomMargin: room.dimensions.bottomMargin,
  baseTopMargin: room.dimensions.topMargin,
});

export default function JobEditor() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const isNewJob = jobId === 'new';

  const { rooms, addRoom, updateRoom, hydrateRooms } = useTradeRoom();
  const {
    jobQuery,
    roomsFromServer,
    upsertJob,
    upsertRoom,
    updateJobStatus,
    exportJobJson,
    exportJobPdf,
    isSaving,
  } = useTradeJobPersistence(jobId);

  const [showRoomWizard, setShowRoomWizard] = useState(isNewJob);
  const [editingRoom, setEditingRoom] = useState<TradeRoom | null>(null);

  useEffect(() => {
    if (!isNewJob && jobQuery.data) {
      hydrateRooms(roomsFromServer);
    }
  }, [isNewJob, jobQuery.data, roomsFromServer, hydrateRooms]);

  const displayRooms = useMemo(() => rooms, [rooms]);

  const persistFullJob = async (status: 'draft' | 'submitted' = 'draft') => {
    if (!jobId || jobId === 'new') {
      toast.error('A persisted job id is required for save/submit.');
      return;
    }

    await upsertJob({
      id: jobId,
      name: jobQuery.data?.name || `Job ${jobId.slice(0, 8)}`,
      status,
      rooms: displayRooms,
    });
  };

  const handleRoomComplete = async (config: RoomConfig) => {
    if (!jobId) return;

    if (editingRoom) {
      const updatedRoom: TradeRoom = {
        ...editingRoom,
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        config: {
          width: config.roomWidth,
          depth: config.roomDepth,
          height: config.roomHeight,
          shape: config.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
          cutoutWidth: config.cutoutWidth || 0,
          cutoutDepth: config.cutoutDepth || 0,
        },
        dimensions: {
          ...editingRoom.dimensions,
          toeKickHeight: config.toeKickHeight,
          baseHeight: config.baseHeight,
          baseDepth: config.baseDepth,
          wallHeight: config.wallHeight,
          wallDepth: config.wallDepth,
          tallHeight: config.tallHeight,
          tallDepth: config.tallDepth,
          doorGap: config.doorGap,
          drawerGap: config.drawerGap,
        },
        materialDefaults: {
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
        },
        hardwareDefaults: {
          ...editingRoom.hardwareDefaults,
          hingeType: config.hingeStyle,
          drawerType: config.drawerStyle,
          supplyHardware: config.supplyHardware,
          adjustableLegs: config.adjustableLegs,
        },
        updatedAt: new Date(),
      };

      updateRoom(editingRoom.id, updatedRoom);
      if (!isNewJob) {
        await upsertRoom({ jobId, room: updatedRoom });
      }
      toast.success(`Room "${config.name}" updated`);
    } else {
      const newRoom = addRoom({
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        config: {
          width: config.roomWidth,
          depth: config.roomDepth,
          height: config.roomHeight,
          shape: config.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
          cutoutWidth: config.cutoutWidth || 0,
          cutoutDepth: config.cutoutDepth || 0,
        },
        dimensions: {
          ...DEFAULT_GLOBAL_DIMENSIONS,
          toeKickHeight: config.toeKickHeight,
          baseHeight: config.baseHeight,
          baseDepth: config.baseDepth,
          wallHeight: config.wallHeight,
          wallDepth: config.wallDepth,
          tallHeight: config.tallHeight,
          tallDepth: config.tallDepth,
          doorGap: config.doorGap,
          drawerGap: config.drawerGap,
        },
        materialDefaults: {
          exteriorFinish: config.exteriorMaterial,
          carcaseFinish: config.carcaseMaterial,
          doorStyle: config.doorStyle,
          edgeBanding: config.exteriorEdge,
        },
        hardwareDefaults: {
          handleType: 'bar-handle',
          handleColor: '#1a1a1a',
          hingeType: config.hingeStyle,
          drawerType: config.drawerStyle,
          softClose: true,
          supplyHardware: config.supplyHardware,
          adjustableLegs: config.adjustableLegs,
        },
      });

      if (!isNewJob) {
        await upsertRoom({ jobId, room: newRoom });
      }

      toast.success(`Room "${config.name}" created`);
      navigate(`/trade/job/${jobId}/room/${newRoom.id}/planner`);
      return;
    }

    setShowRoomWizard(false);
    setEditingRoom(null);
  };

  const handleRoomCancel = () => {
    if (isNewJob && displayRooms.length === 0) {
      navigate('/trade/dashboard');
    } else {
      setShowRoomWizard(false);
      setEditingRoom(null);
    }
  };

  const handleEditRoom = (room: TradeRoom) => {
    setEditingRoom(room);
    setShowRoomWizard(true);
  };

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/trade/dashboard')} className="text-trade-muted hover:text-trade-navy">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-display font-bold text-trade-navy">{isNewJob ? 'Create New Job' : `Job #${jobId}`}</h1>
              <p className="text-trade-muted text-sm">
                {showRoomWizard
                  ? (editingRoom ? `Editing: ${editingRoom.name}` : 'Configure room defaults')
                  : `${displayRooms.length} room${displayRooms.length !== 1 ? 's' : ''} configured`}
              </p>
            </div>
          </div>

          {!showRoomWizard && displayRooms.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" className="border-trade-border" onClick={exportJobPdf}>
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="outline" className="border-trade-border" onClick={exportJobJson}>
                <FileJson className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                className="border-trade-border"
                disabled={isSaving || isNewJob}
                onClick={async () => {
                  try {
                    await persistFullJob('draft');
                    await updateJobStatus('draft');
                    toast.success('Draft saved', { description: 'Job and rooms persisted.' });
                  } catch {
                    toast.error('Failed to save draft');
                  }
                }}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button
                className="bg-trade-amber hover:bg-trade-amber-light text-white"
                disabled={isSaving || isNewJob}
                onClick={async () => {
                  try {
                    await persistFullJob('submitted');
                    await updateJobStatus('submitted');
                    toast.success('Job submitted');
                  } catch {
                    toast.error('Failed to submit job');
                  }
                }}
              >
                <Send className="h-4 w-4 mr-2" />
                Submit Job
              </Button>
            </div>
          )}
        </div>

        {showRoomWizard ? (
          <RoomSetupWizard onComplete={handleRoomComplete} onCancel={handleRoomCancel} initialConfig={editingRoom ? toRoomConfig(editingRoom) : undefined} />
        ) : displayRooms.length > 0 ? (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayRooms.map((room) => (
                <div key={room.id} className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-trade-amber/10 rounded-lg"><LayoutGrid className="h-5 w-5 text-trade-amber" /></div>
                    <span className="text-xs text-trade-muted bg-trade-surface px-2 py-1 rounded">{room.shape === 'l-shaped' ? 'L-Shape' : 'Rectangle'}</span>
                  </div>
                  <h3 className="font-display font-semibold text-trade-navy text-lg">{room.name}</h3>
                  {room.description && <p className="text-sm text-trade-muted mt-1 line-clamp-2">{room.description}</p>}
                  <div className="mt-4 pt-3 border-t border-trade-border flex items-center justify-between">
                    <span className="text-sm text-trade-muted">{room.cabinets.length} products</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditRoom(room)}>Edit</Button>
                      <Button size="sm" className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy" onClick={() => navigate(`/trade/job/${jobId}/room/${room.id}/planner`)}>
                        <Box className="h-4 w-4 mr-1" />
                        Open Planner
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => { setEditingRoom(null); setShowRoomWizard(true); }} className="bg-trade-surface-elevated rounded-xl border-2 border-dashed border-trade-border p-5 hover:border-trade-amber hover:bg-trade-amber/5 transition-all flex flex-col items-center justify-center min-h-[180px] group">
                <div className="p-3 bg-trade-surface rounded-full group-hover:bg-trade-amber/10 transition-colors"><Plus className="h-6 w-6 text-trade-muted group-hover:text-trade-amber" /></div>
                <span className="mt-3 font-medium text-trade-muted group-hover:text-trade-amber">Add Another Room</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-trade-amber/10 rounded-full flex items-center justify-center mx-auto mb-4"><Plus className="h-8 w-8 text-trade-amber" /></div>
              <h2 className="text-xl font-display font-semibold text-trade-navy mb-2">No Rooms Yet</h2>
              <p className="text-trade-muted mb-6">Start by adding your first room to configure its default materials, hardware, and dimensions.</p>
              <Button onClick={() => { setEditingRoom(null); setShowRoomWizard(true); }} className="bg-trade-navy hover:bg-trade-navy-light text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add First Room
              </Button>
            </div>
          </div>
        )}
      </div>
    </TradeLayout>
  );
}
