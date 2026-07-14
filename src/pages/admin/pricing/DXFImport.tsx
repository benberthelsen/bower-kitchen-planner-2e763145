import React, { useState, useCallback } from 'react';
import { Upload, FileArchive, CheckCircle, AlertCircle, Loader2, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { processZipFile, processMultipleZips, ExtractedCabinetData, DXFProcessingResult } from '@/lib/dxf';
import { supabase } from '@/integrations/supabase/client';

const DXFImport: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<DXFProcessingResult | null>(null);
  const [selectedCabinet, setSelectedCabinet] = useState<ExtractedCabinetData | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setResults(null);

    try {
      const zipFiles: Array<{ name: string; data: ArrayBuffer }> = [];
      
      for (const file of Array.from(files)) {
        if (file.name.endsWith('.zip')) {
          const data = await file.arrayBuffer();
          zipFiles.push({ name: file.name, data });
        }
      }

      if (zipFiles.length === 0) {
        toast.error('Please upload ZIP files containing DXF drawings');
        return;
      }

      const result = await processMultipleZips(zipFiles);
      setResults(result);

      if (result.success) {
        toast.success(`Processed ${result.processedFiles} of ${result.totalFiles} DXF files`);
      } else {
        toast.error('Failed to process DXF files');
      }
    } catch (error) {
      console.error('File processing error:', error);
      toast.error('Error processing files');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleImportToDatabase = async () => {
    if (!results || results.cabinets.length === 0) return;

    setImportProgress({ current: 0, total: results.cabinets.length });

    try {
      let imported = 0;
      let skipped = 0;

      for (const cabinet of results.cabinets) {
        try {
          // Check if product already exists by name
          const { data: existing } = await supabase
            .from('microvellum_products')
            .select('id')
            .eq('name', cabinet.name)
            .maybeSingle();

          if (existing) {
            skipped++;
            setImportProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
            continue;
          }

          // Insert new product
          const { error } = await supabase
            .from('microvellum_products')
            .insert({
              name: cabinet.name,
              category: cabinet.category,
              cabinet_type: cabinet.cabinetType,
              default_width: cabinet.width,
              default_height: cabinet.height,
              default_depth: cabinet.depth,
              door_count: cabinet.doorCount,
              drawer_count: cabinet.drawerCount,
              is_corner: cabinet.isCorner,
              is_blind: cabinet.isBlind,
              is_sink: cabinet.isSink,
              has_false_front: cabinet.hasFalseFront,
              has_adjustable_shelves: cabinet.hasAdjustableShelves,
              visible_to_standard: true,
              visible_to_trade: true,
              raw_metadata: {
                source: 'dxf_import',
                filename: cabinet.filename,
                layers: cabinet.layers,
                entityCounts: cabinet.entityCounts
              }
            });

          if (error) throw error;
          imported++;
        } catch (error) {
          console.error(`Failed to import ${cabinet.name}:`, error);
        }

        setImportProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
      }

      toast.success(`Imported ${imported} cabinets, skipped ${skipped} duplicates`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import cabinets to database');
    } finally {
      setImportProgress(null);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Base': return 'bg-blue-500/20 text-blue-700';
      case 'Wall': return 'bg-green-500/20 text-green-700';
      case 'Tall': return 'bg-purple-500/20 text-purple-700';
      default: return 'bg-gray-500/20 text-gray-700';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Sink': return 'bg-cyan-500/20 text-cyan-700';
      case 'Corner': return 'bg-orange-500/20 text-orange-700';
      case 'Blind': return 'bg-yellow-500/20 text-yellow-700';
      case 'Drawer': return 'bg-pink-500/20 text-pink-700';
      case 'Pantry': return 'bg-emerald-500/20 text-emerald-700';
      default: return 'bg-slate-500/20 text-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            DXF Cabinet Import
          </CardTitle>
          <CardDescription>
            Upload ZIP files containing DXF cabinet drawings to extract dimensions and features for the 3D renderer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Upload area */}
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".zip"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="dxf-upload"
                disabled={isProcessing}
              />
              <label
                htmlFor="dxf-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                ) : (
                  <Upload className="h-10 w-10 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {isProcessing ? 'Processing DXF files...' : 'Click to upload ZIP files containing DXF cabinet drawings'}
                </span>
              </label>
            </div>

            {/* Results summary */}
            {results && (
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-4">
                  {results.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className="font-medium">
                      Processed {results.processedFiles} of {results.totalFiles} files
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {results.cabinets.length} cabinets extracted
                      {results.errors.length > 0 && `, ${results.errors.length} errors`}
                    </p>
                  </div>
                </div>
                <Button onClick={handleImportToDatabase} disabled={results.cabinets.length === 0 || !!importProgress}>
                  {importProgress ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing {importProgress.current}/{importProgress.total}
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Import to Database
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Extracted cabinets table */}
      {results && results.cabinets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Cabinets ({results.cabinets.length})</CardTitle>
            <CardDescription>
              Review extracted cabinet data before importing to the database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">W×H×D (mm)</TableHead>
                    <TableHead className="text-center">Doors</TableHead>
                    <TableHead className="text-center">Drawers</TableHead>
                    <TableHead>Features</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.cabinets.map((cabinet, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{cabinet.name}</TableCell>
                      <TableCell>
                        <Badge className={getCategoryColor(cabinet.category)}>
                          {cabinet.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getTypeColor(cabinet.cabinetType)}>
                          {cabinet.cabinetType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {cabinet.width}×{cabinet.height}×{cabinet.depth}
                      </TableCell>
                      <TableCell className="text-center">{cabinet.doorCount}</TableCell>
                      <TableCell className="text-center">{cabinet.drawerCount}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cabinet.isCorner && <Badge variant="secondary" className="text-xs">Corner</Badge>}
                          {cabinet.isBlind && <Badge variant="secondary" className="text-xs">Blind</Badge>}
                          {cabinet.isSink && <Badge variant="secondary" className="text-xs">Sink</Badge>}
                          {cabinet.hasFalseFront && <Badge variant="secondary" className="text-xs">False Front</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedCabinet(cabinet)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>{cabinet.name}</DialogTitle>
                              <DialogDescription>DXF analysis details</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <h4 className="font-medium mb-2">Dimensions</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Width: {cabinet.width}mm<br />
                                    Height: {cabinet.height}mm<br />
                                    Depth: {cabinet.depth}mm
                                  </p>
                                </div>
                                <div>
                                  <h4 className="font-medium mb-2">Configuration</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Doors: {cabinet.doorCount}<br />
                                    Drawers: {cabinet.drawerCount}<br />
                                    Has Shelves: {cabinet.hasAdjustableShelves ? 'Yes' : 'No'}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <h4 className="font-medium mb-2">DXF Layers ({cabinet.layers.length})</h4>
                                <div className="flex flex-wrap gap-1">
                                  {cabinet.layers.map((layer, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">{layer}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="font-medium mb-2">Entity Counts</h4>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(cabinet.entityCounts).map(([type, count]) => (
                                    <Badge key={type} variant="secondary" className="text-xs">
                                      {type}: {count}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {results && results.errors.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Processing Errors ({results.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40">
              <ul className="text-sm space-y-1">
                {results.errors.map((error, i) => (
                  <li key={i} className="text-red-600">{error}</li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DXFImport;
