import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, Save } from "lucide-react";


interface PartPricing {
  id: string;
  name: string;
  part_type: string;
  length_function: string | null;
  width_function: string | null;
  edging: string | null;
  handling_cost: number;
  area_handling_cost: number;
  machining_cost: number;
  area_machining_cost: number;
  assembly_cost: number;
  area_assembly_cost: number;
  visibility_status: string;
}

export default function PartsPricing() {
  const [parts, setParts] = useState<PartPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<PartPricing>>({});

  useEffect(() => {
    loadParts();
  }, []);

  const loadParts = async () => {
    const { data, error } = await supabase
      .from("parts_pricing")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load parts pricing");
      console.error(error);
    } else {
      setParts(data || []);
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

    toast.info(`Importing ${records.length} parts...`);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ table: "parts_pricing", records }),
      }
    );

    const result = await response.json();
    if (result.success) {
      toast.success(`Imported ${result.inserted} parts`);
      loadParts();
    } else {
      toast.error(result.error || "Import failed");
    }
  };

  const startEdit = (part: PartPricing) => {
    setEditingId(part.id);
    setEditValues(part);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("parts_pricing")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadParts();
    }
  };

  const partTypes = [...new Set(parts.map(p => p.part_type))].filter(Boolean);

  const filteredParts = parts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || p.part_type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Parts Pricing</h1>
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
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search parts..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {partTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Handling</TableHead>
                      <TableHead>Area Handling</TableHead>
                      <TableHead>Machining</TableHead>
                      <TableHead>Area Machining</TableHead>
                      <TableHead>Assembly</TableHead>
                      <TableHead>Area Assembly</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredParts.map(part => (
                      <TableRow key={part.id}>
                        <TableCell className="font-medium">{part.name}</TableCell>
                        <TableCell>{part.part_type}</TableCell>
                        {editingId === part.id ? (
                          <>
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
                                value={editValues.area_machining_cost || 0}
                                onChange={e => setEditValues({ ...editValues, area_machining_cost: parseFloat(e.target.value) })}
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
                              <Input
                                type="number"
                                value={editValues.area_assembly_cost || 0}
                                onChange={e => setEditValues({ ...editValues, area_assembly_cost: parseFloat(e.target.value) })}
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
                            <TableCell>${part.handling_cost.toFixed(2)}</TableCell>
                            <TableCell>${part.area_handling_cost.toFixed(2)}</TableCell>
                            <TableCell>${part.machining_cost.toFixed(2)}</TableCell>
                            <TableCell>${part.area_machining_cost.toFixed(2)}</TableCell>
                            <TableCell>${part.assembly_cost.toFixed(2)}</TableCell>
                            <TableCell>${part.area_assembly_cost.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={part.visibility_status === "Available" ? "text-green-600" : "text-muted-foreground"}>
                                {part.visibility_status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => startEdit(part)}>
                                Edit
                              </Button>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredParts.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    No parts found. Import a CSV to get started.
                  </p>
                )}
              </div>
            )}
          </CardContent>
      </Card>
    </div>
  );
}
