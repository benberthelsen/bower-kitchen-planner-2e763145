import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, Save, ChevronLeft, ChevronRight } from "lucide-react";


interface HardwarePricing {
  id: string;
  item_code: string;
  name: string;
  hardware_type: string | null;
  brand: string | null;
  series: string | null;
  runner_height: number | null;
  runner_depth: number | null;
  handling_cost: number;
  unit_cost: number;
  machining_cost: number;
  assembly_cost: number;
  visibility_status: string;
}

const PAGE_SIZE = 50;

export default function HardwarePricing() {
  const [hardware, setHardware] = useState<HardwarePricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<HardwarePricing>>({});

  useEffect(() => {
    loadHardware();
  }, []);

  const loadHardware = async () => {
    const { data, error } = await supabase
      .from("hardware_pricing")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load hardware pricing");
      console.error(error);
    } else {
      setHardware(data || []);
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

    toast.info(`Importing ${records.length} hardware items...`);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ table: "hardware_pricing", records }),
      }
    );

    const result = await response.json();
    if (result.success) {
      toast.success(`Imported ${result.inserted} hardware items`);
      loadHardware();
    } else {
      toast.error(result.error || "Import failed");
    }
  };

  const startEdit = (item: HardwarePricing) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("hardware_pricing")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadHardware();
    }
  };

  const types = [...new Set(hardware.map(h => h.hardware_type))].filter(Boolean) as string[];
  const brands = [...new Set(hardware.map(h => h.brand))].filter(Boolean) as string[];

  const filteredHardware = hardware.filter(h => {
    const matchesSearch = h.name.toLowerCase().includes(search.toLowerCase()) ||
                          h.item_code.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || h.hardware_type === typeFilter;
    const matchesBrand = brandFilter === "all" || h.brand === brandFilter;
    return matchesSearch && matchesType && matchesBrand;
  });

  const totalPages = Math.ceil(filteredHardware.length / PAGE_SIZE);
  const paginatedHardware = filteredHardware.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Hardware Pricing</h1>
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
            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or code..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {types.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={brandFilter} onValueChange={v => { setBrandFilter(v); setPage(0); }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map(brand => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Series</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Handling</TableHead>
                        <TableHead>Machining</TableHead>
                        <TableHead>Assembly</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedHardware.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.name}</TableCell>
                          <TableCell>{item.hardware_type}</TableCell>
                          <TableCell>{item.brand}</TableCell>
                          <TableCell>{item.series}</TableCell>
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

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredHardware.length)} of {filteredHardware.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {filteredHardware.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    No hardware found. Import a CSV to get started.
                  </p>
              )}
            </>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
