import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Search, Save, Plus } from "lucide-react";


interface StonePricing {
  id: string;
  brand: string;
  range_tier: string | null;
  trade_supply_per_sqm: number;
  install_supply_per_sqm: number;
}

export default function StonePricing() {
  const [stones, setStones] = useState<StonePricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<StonePricing>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newStone, setNewStone] = useState({ brand: "", range_tier: "", trade_supply_per_sqm: 0, install_supply_per_sqm: 0 });

  useEffect(() => {
    loadStones();
  }, []);

  const loadStones = async () => {
    const { data, error } = await supabase
      .from("stone_pricing")
      .select("*")
      .order("brand");

    if (error) {
      toast.error("Failed to load stone pricing");
      console.error(error);
    } else {
      setStones(data || []);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split("\n");
    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    
    const records = lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(",").map(v => v.trim().replace(/"/g, ""));
        const record: Record<string, string> = {};
        headers.forEach((header, i) => {
          record[header] = values[i] || "";
        });
        return record;
      });

    toast.info(`Importing ${records.length} stone items...`);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ table: "stone_pricing", records }),
      }
    );

    const result = await response.json();
    if (result.success) {
      toast.success(`Imported ${result.inserted} stone items`);
      loadStones();
    } else {
      toast.error(result.error || "Import failed");
    }
  };

  const startEdit = (item: StonePricing) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("stone_pricing")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadStones();
    }
  };

  const addStone = async () => {
    if (!newStone.brand) {
      toast.error("Brand is required");
      return;
    }

    const { error } = await supabase
      .from("stone_pricing")
      .insert(newStone);

    if (error) {
      toast.error("Failed to add stone");
    } else {
      toast.success("Stone added");
      setShowAdd(false);
      setNewStone({ brand: "", range_tier: "", trade_supply_per_sqm: 0, install_supply_per_sqm: 0 });
      loadStones();
    }
  };

  const filteredStones = stones.filter(s => 
    s.brand.toLowerCase().includes(search.toLowerCase()) ||
    s.range_tier?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Stone Pricing</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Stone
            </Button>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
            />
            <Button asChild variant="outline">
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </label>
            </Button>
          </div>
        </div>

        {showAdd && (
          <Card>
            <CardHeader>
              <CardTitle>Add New Stone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <Input
                  placeholder="Brand"
                  value={newStone.brand}
                  onChange={e => setNewStone({ ...newStone, brand: e.target.value })}
                />
                <Input
                  placeholder="Range/Tier"
                  value={newStone.range_tier}
                  onChange={e => setNewStone({ ...newStone, range_tier: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Trade Supply $/m²"
                  value={newStone.trade_supply_per_sqm}
                  onChange={e => setNewStone({ ...newStone, trade_supply_per_sqm: parseFloat(e.target.value) })}
                />
                <Input
                  type="number"
                  placeholder="Install Supply $/m²"
                  value={newStone.install_supply_per_sqm}
                  onChange={e => setNewStone({ ...newStone, install_supply_per_sqm: parseFloat(e.target.value) })}
                />
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={addStone}>Save</Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search stones..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 max-w-md"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Range/Tier</TableHead>
                    <TableHead>Trade Supply $/m²</TableHead>
                    <TableHead>Install Supply $/m²</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStones.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.brand}</TableCell>
                      {editingId === item.id ? (
                        <>
                          <TableCell>
                            <Input
                              value={editValues.range_tier || ""}
                              onChange={e => setEditValues({ ...editValues, range_tier: e.target.value })}
                              className="w-32"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editValues.trade_supply_per_sqm || 0}
                              onChange={e => setEditValues({ ...editValues, trade_supply_per_sqm: parseFloat(e.target.value) })}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editValues.install_supply_per_sqm || 0}
                              onChange={e => setEditValues({ ...editValues, install_supply_per_sqm: parseFloat(e.target.value) })}
                              className="w-24"
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
                          <TableCell>{item.range_tier}</TableCell>
                          <TableCell>${item.trade_supply_per_sqm.toFixed(2)}</TableCell>
                          <TableCell>${item.install_supply_per_sqm.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                              Edit
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {filteredStones.length === 0 && !loading && (
              <p className="text-center py-8 text-muted-foreground">
                No stones found. Import a CSV to get started.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
