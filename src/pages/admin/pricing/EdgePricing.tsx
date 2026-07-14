import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, Save, ChevronLeft, ChevronRight } from "lucide-react";


interface EdgePricing {
  id: string;
  item_code: string;
  name: string;
  edge_type: string | null;
  brand: string | null;
  finish: string | null;
  thickness: number | null;
  handling_cost: number;
  length_cost: number;
  application_cost: number;
  visibility_status: string;
}

const PAGE_SIZE = 50;

export default function EdgePricing() {
  const [edges, setEdges] = useState<EdgePricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<EdgePricing>>({});

  useEffect(() => {
    loadEdges();
  }, []);

  const loadEdges = async () => {
    const { data, error } = await supabase
      .from("edge_pricing")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load edge pricing");
      console.error(error);
    } else {
      setEdges(data || []);
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

    toast.info(`Importing ${records.length} edge items...`);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ table: "edge_pricing", records }),
      }
    );

    const result = await response.json();
    if (result.success) {
      toast.success(`Imported ${result.inserted} edge items`);
      loadEdges();
    } else {
      toast.error(result.error || "Import failed");
    }
  };

  const startEdit = (item: EdgePricing) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("edge_pricing")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadEdges();
    }
  };

  const brands = [...new Set(edges.map(e => e.brand))].filter(Boolean) as string[];

  const filteredEdges = edges.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
                          e.item_code.toLowerCase().includes(search.toLowerCase());
    const matchesBrand = brandFilter === "all" || e.brand === brandFilter;
    return matchesSearch && matchesBrand;
  });

  const totalPages = Math.ceil(filteredEdges.length / PAGE_SIZE);
  const paginatedEdges = filteredEdges.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edge Pricing</h1>
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
                        <TableHead>Brand</TableHead>
                        <TableHead>Finish</TableHead>
                        <TableHead>Thickness</TableHead>
                        <TableHead>Length Cost</TableHead>
                        <TableHead>Handling</TableHead>
                        <TableHead>Application</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEdges.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.name}</TableCell>
                          <TableCell>{item.brand}</TableCell>
                          <TableCell>{item.finish}</TableCell>
                          <TableCell>{item.thickness}mm</TableCell>
                          {editingId === item.id ? (
                            <>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={editValues.length_cost || 0}
                                  onChange={e => setEditValues({ ...editValues, length_cost: parseFloat(e.target.value) })}
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
                                  value={editValues.application_cost || 0}
                                  onChange={e => setEditValues({ ...editValues, application_cost: parseFloat(e.target.value) })}
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
                              <TableCell>${item.length_cost.toFixed(2)}/m</TableCell>
                              <TableCell>${item.handling_cost.toFixed(2)}</TableCell>
                              <TableCell>${item.application_cost.toFixed(2)}/m</TableCell>
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
                      Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredEdges.length)} of {filteredEdges.length}
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

                {filteredEdges.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    No edge materials found. Import a CSV to get started.
                  </p>
              )}
            </>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
