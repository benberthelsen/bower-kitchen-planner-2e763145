import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, Save } from "lucide-react";


interface DoorDrawerPricing {
  id: string;
  item_code: string;
  name: string;
  outsourced: boolean;
  filter_name: string | null;
  handling_cost: number;
  area_handling_cost: number;
  machining_cost: number;
  area_machining_cost: number;
  unit_cost: number;
  assembly_cost: number;
  area_assembly_cost: number;
  visibility_status: string;
}

export default function DoorDrawerPricing() {
  const [items, setItems] = useState<DoorDrawerPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<DoorDrawerPricing>>({});

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    const { data, error } = await supabase
      .from("door_drawer_pricing")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load door/drawer pricing");
      console.error(error);
    } else {
      setItems(data || []);
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

    toast.info(`Importing ${records.length} door/drawer items...`);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ table: "door_drawer_pricing", records }),
      }
    );

    const result = await response.json();
    if (result.success) {
      toast.success(`Imported ${result.inserted} door/drawer items`);
      loadItems();
    } else {
      toast.error(result.error || "Import failed");
    }
  };

  const startEdit = (item: DoorDrawerPricing) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("door_drawer_pricing")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadItems();
    }
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.item_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Door & Drawer Pricing</h1>
          <div className="flex gap-2">
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

        <Card>
          <CardHeader>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search door/drawer styles..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Outsourced</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Handling</TableHead>
                      <TableHead>Area Handling</TableHead>
                      <TableHead>Machining</TableHead>
                      <TableHead>Assembly</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.outsourced ? "Yes" : "No"}</TableCell>
                        {editingId === item.id ? (
                          <>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.unit_cost || 0}
                                onChange={e => setEditValues({ ...editValues, unit_cost: parseFloat(e.target.value) })}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.handling_cost || 0}
                                onChange={e => setEditValues({ ...editValues, handling_cost: parseFloat(e.target.value) })}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.area_handling_cost || 0}
                                onChange={e => setEditValues({ ...editValues, area_handling_cost: parseFloat(e.target.value) })}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.machining_cost || 0}
                                onChange={e => setEditValues({ ...editValues, machining_cost: parseFloat(e.target.value) })}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editValues.assembly_cost || 0}
                                onChange={e => setEditValues({ ...editValues, assembly_cost: parseFloat(e.target.value) })}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={editValues.visibility_status || "Available"}
                                onValueChange={v => setEditValues({ ...editValues, visibility_status: v })}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Available">Available</SelectItem>
                                  <SelectItem value="Hidden">Hidden</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" onClick={saveEdit}>
                                <Save className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>${item.unit_cost.toFixed(2)}</TableCell>
                            <TableCell>${item.handling_cost.toFixed(2)}</TableCell>
                            <TableCell>${item.area_handling_cost.toFixed(2)}/m²</TableCell>
                            <TableCell>${item.machining_cost.toFixed(2)}</TableCell>
                            <TableCell>${item.assembly_cost.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={item.visibility_status === "Available" ? "text-green-600" : "text-muted-foreground"}>
                                {item.visibility_status}
                              </span>
                            </TableCell>
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
              </div>
            )}
            {filteredItems.length === 0 && !loading && (
              <p className="text-center py-8 text-muted-foreground">
                No door/drawer styles found. Import a CSV to get started.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
