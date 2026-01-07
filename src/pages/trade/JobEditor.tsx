import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, Send, Plus, LayoutGrid, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TradeLayout from './components/TradeLayout';
import RoomSetupWizard, { RoomConfig } from './components/RoomSetupWizard';
import { useTradeRoom, defaultMaterialDefaults, defaultHardwareDefaults } from '@/contexts/TradeRoomContext';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';

interface Room {
  id: string;
  config: RoomConfig;
  products: any[];
}

export default function JobEditor() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const isNewJob = jobId === 'new';
  
  const { addRoom: addTradeRoom } = useTradeRoom();
  
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showRoomWizard, setShowRoomWizard] = useState(isNewJob);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const handleRoomComplete = (config: RoomConfig) => {
    if (editingRoom) {
      setRooms(rooms.map(r => 
        r.id === editingRoom.id ? { ...r, config } : r
      ));
      toast.success(`Room "${config.name}" updated`);
    } else {
      // Add new room to TradeRoomContext  
      const newTradeRoom = addTradeRoom({
        name: config.name,
        description: config.description || '',
        shape: config.shape === 'l-shaped' ? 'l-shaped' : 'rectangular',
        config: {
          width: 4000,
          depth: 3000,
          height: 2400,
          shape: config.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
          cutoutWidth: 0,
          cutoutDepth: 0,
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
      
      const newRoom: Room = {
        id: newTradeRoom.id,
        config,
        products: [],
      };
      setRooms([...rooms, newRoom]);
      toast.success(`Room "${config.name}" created`);
      
      // Navigate to the planner
      navigate(`/trade/job/${jobId}/room/${newTradeRoom.id}/planner`);
      return;
    }
    setShowRoomWizard(false);
    setEditingRoom(null);
  };

  const handleRoomCancel = () => {
    if (isNewJob && rooms.length === 0) {
      navigate('/trade/dashboard');
    } else {
      setShowRoomWizard(false);
      setEditingRoom(null);
    }
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoom(room);
    setShowRoomWizard(true);
  };

  const handleOpenPlanner = (room: Room) => {
    navigate(`/trade/job/${jobId}/room/${room.id}/planner`);
  };

  const handleAddRoom = () => {
    setEditingRoom(null);
    setShowRoomWizard(true);
  };

  return (
    <TradeLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/trade/dashboard')}
              className="text-trade-muted hover:text-trade-navy"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-display font-bold text-trade-navy">
                {isNewJob ? 'Create New Job' : `Job #${jobId}`}
              </h1>
              <p className="text-trade-muted text-sm">
                {showRoomWizard 
                  ? (editingRoom ? `Editing: ${editingRoom.config.name}` : 'Configure room defaults')
                  : `${rooms.length} room${rooms.length !== 1 ? 's' : ''} configured`
                }
              </p>
            </div>
          </div>
          
          {!showRoomWizard && rooms.length > 0 && (
            <div className="flex items-center gap-3">
              <Button variant="outline" className="border-trade-border">
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="outline" className="border-trade-border">
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button className="bg-trade-amber hover:bg-trade-amber-light text-white">
                <Send className="h-4 w-4 mr-2" />
                Submit Job
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        {showRoomWizard ? (
          <RoomSetupWizard 
            onComplete={handleRoomComplete}
            onCancel={handleRoomCancel}
            initialConfig={editingRoom?.config}
          />
        ) : rooms.length > 0 ? (
          <div className="space-y-6">
            {/* Rooms Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div 
                  key={room.id}
                  className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-trade-amber/10 rounded-lg">
                      <LayoutGrid className="h-5 w-5 text-trade-amber" />
                    </div>
                    <span className="text-xs text-trade-muted bg-trade-surface px-2 py-1 rounded">
                      {room.config.shape === 'l-shaped' ? 'L-Shape' : 'Rectangle'}
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-trade-navy text-lg">
                    {room.config.name}
                  </h3>
                  {room.config.description && (
                    <p className="text-sm text-trade-muted mt-1 line-clamp-2">
                      {room.config.description}
                    </p>
                  )}
                  <div className="mt-4 pt-3 border-t border-trade-border flex items-center justify-between">
                    <span className="text-sm text-trade-muted">
                      {room.products.length} products
                    </span>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEditRoom(room)}
                      >
                        Edit
                      </Button>
                      <Button 
                        size="sm"
                        className="bg-trade-amber hover:bg-trade-amber/90 text-trade-navy"
                        onClick={() => handleOpenPlanner(room)}
                      >
                        <Box className="h-4 w-4 mr-1" />
                        Open Planner
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Room Card */}
              <button
                onClick={handleAddRoom}
                className="bg-trade-surface-elevated rounded-xl border-2 border-dashed border-trade-border p-5 hover:border-trade-amber hover:bg-trade-amber/5 transition-all flex flex-col items-center justify-center min-h-[180px] group"
              >
                <div className="p-3 bg-trade-surface rounded-full group-hover:bg-trade-amber/10 transition-colors">
                  <Plus className="h-6 w-6 text-trade-muted group-hover:text-trade-amber" />
                </div>
                <span className="mt-3 font-medium text-trade-muted group-hover:text-trade-amber">
                  Add Another Room
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-trade-amber/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="h-8 w-8 text-trade-amber" />
              </div>
              <h2 className="text-xl font-display font-semibold text-trade-navy mb-2">
                No Rooms Yet
              </h2>
              <p className="text-trade-muted mb-6">
                Start by adding your first room to configure its default materials, hardware, and dimensions.
              </p>
              <Button 
                onClick={handleAddRoom}
                className="bg-trade-navy hover:bg-trade-navy-light text-white"
              >
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
