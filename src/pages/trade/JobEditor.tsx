import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileDown, Send, Plus, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TradeLayout from './components/TradeLayout';
import RoomSetupWizard, { RoomConfig } from './components/RoomSetupWizard';

interface Room {
  id: string;
  config: RoomConfig;
  products: any[];
}

export default function JobEditor() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const isNewJob = jobId === 'new';
  
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showRoomWizard, setShowRoomWizard] = useState(isNewJob);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const handleRoomComplete = (config: RoomConfig) => {
    if (editingRoom) {
      // Update existing room
      setRooms(rooms.map(r => 
        r.id === editingRoom.id ? { ...r, config } : r
      ));
      toast.success(`Room "${config.name}" updated`);
    } else {
      // Add new room
      const newRoom: Room = {
        id: crypto.randomUUID(),
        config,
        products: [],
      };
      setRooms([...rooms, newRoom]);
      toast.success(`Room "${config.name}" created`);
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
                  className="bg-trade-surface-elevated rounded-xl border border-trade-border p-5 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleEditRoom(room)}
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
                  <div className="mt-4 pt-3 border-t border-trade-border flex items-center justify-between text-sm">
                    <span className="text-trade-muted">
                      {room.products.length} products
                    </span>
                    <span className="text-trade-amber font-medium">
                      Edit →
                    </span>
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

            {/* Products Section Placeholder */}
            <div className="bg-trade-surface-elevated rounded-xl border border-trade-border p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-14 h-14 bg-trade-amber/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <LayoutGrid className="h-7 w-7 text-trade-amber" />
                </div>
                <h3 className="text-lg font-display font-semibold text-trade-navy mb-2">
                  Ready to Add Products
                </h3>
                <p className="text-trade-muted mb-4">
                  Your rooms are configured. Phase 3 will add the Product Catalog where you can browse and add cabinets to each room.
                </p>
                <Button 
                  variant="outline" 
                  className="border-trade-amber text-trade-amber hover:bg-trade-amber hover:text-white"
                  onClick={() => navigate('/trade/catalog')}
                >
                  Browse Product Catalog
                </Button>
              </div>
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
