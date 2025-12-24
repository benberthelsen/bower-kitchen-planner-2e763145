import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus, Trash2 } from "lucide-react";


interface LaborRate {
  id: string;
  name: string;
  rate_type: string;
  rate: number;
  description: string | null;
}

export default function LaborRates() {
  const [rates, setRates] = useState<LaborRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<LaborRate>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newRate, setNewRate] = useState({ name: "", rate_type: "hourly", rate: 0, description: "" });

  useEffect(() => {
    loadRates();
  }, []);

  const loadRates = async () => {
    const { data, error } = await supabase
      .from("labor_rates")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load labor rates");
      console.error(error);
    } else {
      setRates(data || []);
    }
    setLoading(false);
  };

  const startEdit = (item: LaborRate) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("labor_rates")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadRates();
    }
  };

  const addRate = async () => {
    if (!newRate.name) {
      toast.error("Name is required");
      return;
    }

    const { error } = await supabase
      .from("labor_rates")
      .insert(newRate);

    if (error) {
      toast.error("Failed to add rate");
    } else {
      toast.success("Rate added");
      setShowAdd(false);
      setNewRate({ name: "", rate_type: "hourly", rate: 0, description: "" });
      loadRates();
    }
  };

  const deleteRate = async (id: string) => {
    const { error } = await supabase
      .from("labor_rates")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete rate");
    } else {
      toast.success("Rate deleted");
      loadRates();
    }
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Labor Rates</h1>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Rate
          </Button>
        </div>

        {showAdd && (
          <Card>
            <CardHeader>
              <CardTitle>Add New Labor Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <Input
                  placeholder="Name (e.g., Shop Labor)"
                  value={newRate.name}
                  onChange={e => setNewRate({ ...newRate, name: e.target.value })}
                />
                <Select value={newRate.rate_type} onValueChange={v => setNewRate({ ...newRate, rate_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="per_unit">Per Unit</SelectItem>
                    <SelectItem value="per_sqm">Per m²</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Rate"
                  value={newRate.rate}
                  onChange={e => setNewRate({ ...newRate, rate: parseFloat(e.target.value) })}
                />
                <Input
                  placeholder="Description"
                  value={newRate.description}
                  onChange={e => setNewRate({ ...newRate, description: e.target.value })}
                />
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={addRate}>Save</Button>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map(item => (
                    <TableRow key={item.id}>
                      {editingId === item.id ? (
                        <>
                          <TableCell>
                            <Input
                              value={editValues.name || ""}
                              onChange={e => setEditValues({ ...editValues, name: e.target.value })}
                              className="w-40"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={editValues.rate_type || "hourly"}
                              onValueChange={v => setEditValues({ ...editValues, rate_type: v })}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hourly">Hourly</SelectItem>
                                <SelectItem value="per_unit">Per Unit</SelectItem>
                                <SelectItem value="per_sqm">Per m²</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editValues.rate || 0}
                              onChange={e => setEditValues({ ...editValues, rate: parseFloat(e.target.value) })}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editValues.description || ""}
                              onChange={e => setEditValues({ ...editValues, description: e.target.value })}
                              className="w-48"
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
                          <TableCell className="capitalize">{item.rate_type.replace("_", " ")}</TableCell>
                          <TableCell>
                            ${item.rate.toFixed(2)}
                            {item.rate_type === "hourly" && "/hr"}
                            {item.rate_type === "per_sqm" && "/m²"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.description}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteRate(item.id)}>
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
            )}
            {rates.length === 0 && !loading && (
              <p className="text-center py-8 text-muted-foreground">
                No labor rates configured. Add one to get started.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
