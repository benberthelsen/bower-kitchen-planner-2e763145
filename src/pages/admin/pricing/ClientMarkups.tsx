import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Save, Plus, Trash2 } from "lucide-react";


interface ClientMarkup {
  id: string;
  client_id: string | null;
  name: string;
  markup_type: string;
  material_markup: number;
  hardware_markup: number;
  labor_markup: number;
  delivery_markup: number;
  stone_markup: number;
  parts_markup: number;
  edge_markup: number;
  door_drawer_markup: number;
  is_default: boolean;
}

interface Profile {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
}

export default function ClientMarkups() {
  const [markups, setMarkups] = useState<ClientMarkup[]>([]);
  const [clients, setClients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ClientMarkup>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newMarkup, setNewMarkup] = useState<Partial<ClientMarkup>>({
    name: "",
    client_id: null,
    markup_type: "percentage",
    material_markup: 0,
    hardware_markup: 0,
    labor_markup: 0,
    delivery_markup: 0,
    stone_markup: 0,
    parts_markup: 0,
    edge_markup: 0,
    door_drawer_markup: 0,
    is_default: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [markupsRes, clientsRes] = await Promise.all([
      supabase.from("client_markup_settings").select("*").order("name"),
      supabase.from("profiles").select("id, full_name, company_name, email").order("full_name"),
    ]);

    if (markupsRes.error) {
      toast.error("Failed to load markup settings");
    } else {
      setMarkups(markupsRes.data || []);
    }

    if (!clientsRes.error) {
      setClients(clientsRes.data || []);
    }

    setLoading(false);
  };

  const startEdit = (item: ClientMarkup) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("client_markup_settings")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadData();
    }
  };

  const addMarkup = async () => {
    if (!newMarkup.name) {
      toast.error("Name is required");
      return;
    }

    const { error } = await supabase
      .from("client_markup_settings")
      .insert({
        name: newMarkup.name!,
        client_id: newMarkup.client_id,
        markup_type: newMarkup.markup_type,
        material_markup: newMarkup.material_markup,
        hardware_markup: newMarkup.hardware_markup,
        labor_markup: newMarkup.labor_markup,
        delivery_markup: newMarkup.delivery_markup,
        stone_markup: newMarkup.stone_markup,
        parts_markup: newMarkup.parts_markup,
        edge_markup: newMarkup.edge_markup,
        door_drawer_markup: newMarkup.door_drawer_markup,
        is_default: newMarkup.is_default,
      });

    if (error) {
      toast.error("Failed to add markup");
    } else {
      toast.success("Markup added");
      setShowAdd(false);
      setNewMarkup({
        name: "",
        client_id: null,
        markup_type: "percentage",
        material_markup: 0,
        hardware_markup: 0,
        labor_markup: 0,
        delivery_markup: 0,
        stone_markup: 0,
        parts_markup: 0,
        edge_markup: 0,
        door_drawer_markup: 0,
        is_default: false,
      });
      loadData();
    }
  };

  const deleteMarkup = async (id: string) => {
    const { error } = await supabase
      .from("client_markup_settings")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete markup");
    } else {
      toast.success("Markup deleted");
      loadData();
    }
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return "All Clients (Default)";
    const client = clients.find(c => c.id === clientId);
    return client?.company_name || client?.full_name || client?.email || "Unknown";
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Client Markup Settings</h1>
            <p className="text-muted-foreground">Configure pricing markups per client or set defaults</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Markup Profile
          </Button>
        </div>

        {showAdd && (
          <Card>
            <CardHeader>
              <CardTitle>New Markup Profile</CardTitle>
              <CardDescription>Create a new markup profile for a specific client or as a default</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Profile Name</Label>
                  <Input
                    placeholder="e.g., Trade Partner A"
                    value={newMarkup.name || ""}
                    onChange={e => setNewMarkup({ ...newMarkup, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Client (optional)</Label>
                  <Select 
                    value={newMarkup.client_id || "none"} 
                    onValueChange={v => setNewMarkup({ ...newMarkup, client_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific client</SelectItem>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.company_name || client.full_name || client.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Markup Type</Label>
                  <Select 
                    value={newMarkup.markup_type || "percentage"} 
                    onValueChange={v => setNewMarkup({ ...newMarkup, markup_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Material %</Label>
                  <Input
                    type="number"
                    value={newMarkup.material_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, material_markup: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Hardware %</Label>
                  <Input
                    type="number"
                    value={newMarkup.hardware_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, hardware_markup: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Labor %</Label>
                  <Input
                    type="number"
                    value={newMarkup.labor_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, labor_markup: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Delivery %</Label>
                  <Input
                    type="number"
                    value={newMarkup.delivery_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, delivery_markup: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Stone %</Label>
                  <Input
                    type="number"
                    value={newMarkup.stone_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, stone_markup: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Parts %</Label>
                  <Input
                    type="number"
                    value={newMarkup.parts_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, parts_markup: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Edge %</Label>
                  <Input
                    type="number"
                    value={newMarkup.edge_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, edge_markup: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Door/Drawer %</Label>
                  <Input
                    type="number"
                    value={newMarkup.door_drawer_markup || 0}
                    onChange={e => setNewMarkup({ ...newMarkup, door_drawer_markup: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={newMarkup.is_default || false}
                  onCheckedChange={v => setNewMarkup({ ...newMarkup, is_default: v })}
                />
                <Label>Set as default markup for new clients</Label>
              </div>

              <div className="flex gap-2">
                <Button onClick={addMarkup}>Save</Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Hardware</TableHead>
                      <TableHead>Labor</TableHead>
                      <TableHead>Stone</TableHead>
                      <TableHead>Default</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {markups.map(item => (
                      <TableRow key={item.id}>
                        {editingId === item.id ? (
                          <>
                            <TableCell>
                              <Input
                                value={editValues.name || ""}
                                onChange={e => setEditValues({ ...editValues, name: e.target.value })}
                                className="w-32"
                              />
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={editValues.client_id || "none"} 
                                onValueChange={v => setEditValues({ ...editValues, client_id: v === "none" ? null : v })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No specific client</SelectItem>
                                  {clients.map(client => (
                                    <SelectItem key={client.id} value={client.id}>
                                      {client.company_name || client.full_name || client.email}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={editValues.markup_type || "percentage"} 
                                onValueChange={v => setEditValues({ ...editValues, markup_type: v })}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percentage">%</SelectItem>
                                  <SelectItem value="fixed">$</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.material_markup || 0}
                                onChange={e => setEditValues({ ...editValues, material_markup: parseFloat(e.target.value) })}
                                className="w-16"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.hardware_markup || 0}
                                onChange={e => setEditValues({ ...editValues, hardware_markup: parseFloat(e.target.value) })}
                                className="w-16"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.labor_markup || 0}
                                onChange={e => setEditValues({ ...editValues, labor_markup: parseFloat(e.target.value) })}
                                className="w-16"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.stone_markup || 0}
                                onChange={e => setEditValues({ ...editValues, stone_markup: parseFloat(e.target.value) })}
                                className="w-16"
                              />
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={editValues.is_default || false}
                                onCheckedChange={v => setEditValues({ ...editValues, is_default: v })}
                              />
                            </TableCell>
                            <TableCell>
                              <Button size="sm" onClick={saveEdit}>
                                <Save className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{getClientName(item.client_id)}</TableCell>
                            <TableCell className="capitalize">{item.markup_type}</TableCell>
                            <TableCell>{item.material_markup}%</TableCell>
                            <TableCell>{item.hardware_markup}%</TableCell>
                            <TableCell>{item.labor_markup}%</TableCell>
                            <TableCell>{item.stone_markup}%</TableCell>
                            <TableCell>
                              {item.is_default && <span className="text-green-600 font-medium">Default</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                                  Edit
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteMarkup(item.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {markups.length === 0 && !loading && (
              <p className="text-center py-8 text-muted-foreground">
                No markup profiles configured. Add one to get started.
              </p>
              )}
            </CardContent>
          </Card>
        </div>
    );
  }
