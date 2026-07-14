import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, Save, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";


interface MaterialPricing {
  id: string;
  item_code: string;
  name: string;
  material_type: string | null;
  brand: string | null;
  finish: string | null;
  substrate: string | null;
  thickness: number | null;
  area_cost: number | null;
  area_handling_cost: number | null;
  area_assembly_cost: number | null;
  sample_image_url: string | null;
  source_supplier: string | null;
  source_url: string | null;
  price_status: string | null;
  review_status: string | null;
  visibility_status: string;
}

const PAGE_SIZE = 50;

const readableStatus = (value: string | null | undefined) => (value ? value.replace(/_/g, " ") : "manual");

export default function MaterialPricing() {
  const [materials, setMaterials] = useState<MaterialPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<MaterialPricing>>({});

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    const { data, error } = await supabase
      .from("material_pricing")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load material pricing");
      console.error(error);
    } else {
      setMaterials(data || []);
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

    toast.info(`Importing ${records.length} materials...`);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ table: "material_pricing", records }),
      }
    );

    const result = await response.json();
    if (result.success) {
      toast.success(`Imported ${result.inserted} materials`);
      loadMaterials();
    } else {
      toast.error(result.error || "Import failed");
    }
  };

  const startEdit = (item: MaterialPricing) => {
    setEditingId(item.id);
    setEditValues(item);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("material_pricing")
      .update(editValues)
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to save changes");
    } else {
      toast.success("Changes saved");
      setEditingId(null);
      loadMaterials();
    }
  };

  const brands = [...new Set(materials.map(m => m.brand))].filter(Boolean) as string[];

  const filteredMaterials = materials.filter(m => {
    const searchText = [
      m.name,
      m.item_code,
      m.brand,
      m.finish,
      m.source_supplier,
      m.price_status,
      m.review_status,
    ].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesBrand = brandFilter === "all" || m.brand === brandFilter;
    return matchesSearch && matchesBrand;
  });

  const totalPages = Math.ceil(filteredMaterials.length / PAGE_SIZE);
  const paginatedMaterials = filteredMaterials.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Material Pricing</h1>
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
                        <TableHead>Sample</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Finish</TableHead>
                        <TableHead>Thickness</TableHead>
                        <TableHead>Area Cost</TableHead>
                        <TableHead>Area Handling</TableHead>
                        <TableHead>Area Assembly</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedMaterials.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.sample_image_url ? (
                              <img
                                src={item.sample_image_url}
                                alt={item.name}
                                className="h-12 w-12 rounded border object-cover bg-white"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded border bg-muted" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.item_code}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.name}</TableCell>
                          <TableCell>{item.brand}</TableCell>
                          <TableCell className="text-sm">
                            <div>{item.source_supplier || "Manual"}</div>
                            {item.source_url && (
                              <a
                                href={item.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                Source <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </TableCell>
                          <TableCell>{item.finish}</TableCell>
                          <TableCell>{item.thickness}mm</TableCell>
                          {editingId === item.id ? (
                            <>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={editValues.area_cost || 0}
                                  onChange={e => setEditValues({ ...editValues, area_cost: parseFloat(e.target.value) })}
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
                                  value={editValues.area_assembly_cost || 0}
                                  onChange={e => setEditValues({ ...editValues, area_assembly_cost: parseFloat(e.target.value) })}
                                  className="w-20"
                                />
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="capitalize">{readableStatus(item.price_status)}</div>
                                <div className="text-muted-foreground capitalize">{readableStatus(item.review_status)}</div>
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
                              <TableCell>${Number(item.area_cost ?? 0).toFixed(2)}/m²</TableCell>
                              <TableCell>${Number(item.area_handling_cost ?? 0).toFixed(2)}/m²</TableCell>
                              <TableCell>${Number(item.area_assembly_cost ?? 0).toFixed(2)}/m²</TableCell>
                              <TableCell className="text-xs">
                                <div className="capitalize">{readableStatus(item.price_status)}</div>
                                <div className="text-muted-foreground capitalize">{readableStatus(item.review_status)}</div>
                              </TableCell>
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
                      Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredMaterials.length)} of {filteredMaterials.length}
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

                {filteredMaterials.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    No materials found. Import a CSV to get started.
                  </p>
              )}
            </>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
