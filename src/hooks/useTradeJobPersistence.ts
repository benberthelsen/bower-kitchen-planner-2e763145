import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ConfiguredCabinet, TradeRoom, TradeJobStatus, isTradeJobStatus, QuoteSnapshot } from '@/types/trade';
import { generateTradeQuotePDF } from '@/lib/pdfQuoteGenerator';

interface PersistedTradeDesignData {
  tradeRooms: TradeRoom[];
  quoteSnapshot?: QuoteSnapshot;
  quoteSnapshotsByRoom?: Record<string, QuoteSnapshot>;
  jobTotals?: {
    subtotal?: number;
    tax?: number;
    total?: number;
    updatedAt: string;
  };
  lastSyncedAt: string;
}

interface PersistJobInput {
  id: string;
  name: string;
  status?: TradeJobStatus;
  rooms: TradeRoom[];
  designDataPatch?: Partial<PersistedTradeDesignData>;
  existingDesignData?: Partial<PersistedTradeDesignData>;
  /** When provided, also persisted to the jobs cost columns (admin lists read these). */
  costExclTax?: number;
  costInclTax?: number;
}

const jobQueryKey = (jobId?: string) => ['trade-job', jobId];

const normalizeRooms = (rooms: TradeRoom[]): TradeRoom[] =>
  rooms.map((room) => ({
    ...room,
    createdAt: new Date(room.createdAt),
    updatedAt: new Date(room.updatedAt),
    cabinets: room.cabinets.map((cabinet) => ({
      ...cabinet,
      createdAt: new Date(cabinet.createdAt),
      updatedAt: new Date(cabinet.updatedAt),
    })),
  }));

const serializeRooms = (rooms: TradeRoom[]) =>
  rooms.map((room) => ({
    ...room,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    cabinets: room.cabinets.map((cabinet) => ({
      ...cabinet,
      createdAt: cabinet.createdAt.toISOString(),
      updatedAt: cabinet.updatedAt.toISOString(),
    })),
  }));

function normalizeStatus(value?: string): TradeJobStatus {
  return value && isTradeJobStatus(value) ? value : 'draft';
}

export function useTradeJobPersistence(jobId?: string) {
  const queryClient = useQueryClient();

  const jobQuery = useQuery({
    queryKey: jobQueryKey(jobId),
    enabled: Boolean(jobId && jobId !== 'new'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, status, design_data, updated_at, job_number')
        .eq('id', jobId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });


  const getCurrentJob = useCallback((id: string) => {
    return queryClient.getQueryData<any>(jobQueryKey(id)) ?? jobQuery.data;
  }, [jobQuery.data, queryClient]);

  const roomsFromServer = useMemo(() => {
    const designData = (jobQuery.data?.design_data || {}) as Partial<PersistedTradeDesignData>;
    const rooms = Array.isArray(designData.tradeRooms) ? designData.tradeRooms : [];
    return normalizeRooms(rooms as TradeRoom[]);
  }, [jobQuery.data?.design_data]);

  const upsertJobMutation = useMutation({
    mutationFn: async (input: PersistJobInput) => {
      const mergedDesignData = {
        ...(input.existingDesignData || {}),
        tradeRooms: serializeRooms(input.rooms),
        ...(input.designDataPatch || {}),
        lastSyncedAt: new Date().toISOString(),
      } as PersistedTradeDesignData;

      // Fetch the current user so customer_id is always set on insert/upsert.
      // supabase.auth.getUser() is sync-safe here (returns cached session).
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        id: input.id,
        name: input.name,
        status: input.status ?? 'draft',
        design_data: mergedDesignData as unknown as PersistedTradeDesignData,
        ...(typeof input.costExclTax === 'number' ? { cost_excl_tax: input.costExclTax } : {}),
        ...(typeof input.costInclTax === 'number' ? { cost_incl_tax: input.costInclTax } : {}),
        ...(user ? { customer_id: user.id } : {}),
      };

      const { data, error } = await supabase
        .from('jobs')
        .upsert(payload as any)
        .select('id, name, status, design_data, updated_at, job_number')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(jobQueryKey(data.id), data);
    },
  });

  const persistRooms = useCallback(async (input: { jobId: string; rooms: TradeRoom[] }) => {
    const current = getCurrentJob(input.jobId);
    const existingDesignData = (current?.design_data || {}) as Partial<PersistedTradeDesignData>;

    return upsertJobMutation.mutateAsync({
      id: input.jobId,
      name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
      status: normalizeStatus(current?.status),
      rooms: input.rooms,
      existingDesignData,
    });
  }, [getCurrentJob, upsertJobMutation]);

  const upsertRoom = useCallback(async (input: { jobId: string; room: TradeRoom }) => {
    const current = getCurrentJob(input.jobId);
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const normalizedExisting = normalizeRooms(existing);

    const nextRooms = normalizedExisting.some((room) => room.id === input.room.id)
      ? normalizedExisting.map((room) => (room.id === input.room.id ? input.room : room))
      : [...normalizedExisting, input.room];

    return persistRooms({ jobId: input.jobId, rooms: nextRooms });
  }, [getCurrentJob, persistRooms]);

  const replaceRoomInJob = useCallback(async (input: { jobId: string; room: TradeRoom }) => {
    return upsertRoom(input);
  }, [upsertRoom]);

  const upsertCabinet = useCallback(async (input: { jobId: string; roomId: string; cabinet: ConfiguredCabinet; roomFallback?: TradeRoom }) => {
    const current = getCurrentJob(input.jobId);
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const normalizedExisting = normalizeRooms(existing);

    const hasRoom = normalizedExisting.some((room) => room.id === input.roomId);

    if (!hasRoom && input.roomFallback) {
      const fallbackRoom = {
        ...input.roomFallback,
        cabinets: [input.cabinet],
        updatedAt: new Date(),
      };
      return persistRooms({ jobId: input.jobId, rooms: [...normalizedExisting, fallbackRoom] });
    }

    if (!hasRoom) return;

    const nextRooms = normalizedExisting.map((room) => {
      if (room.id !== input.roomId) return room;
      const nextCabinets = room.cabinets.some((cabinet) => cabinet.instanceId === input.cabinet.instanceId)
        ? room.cabinets.map((cabinet) => (cabinet.instanceId === input.cabinet.instanceId ? input.cabinet : cabinet))
        : [...room.cabinets, input.cabinet];

      return {
        ...room,
        cabinets: nextCabinets,
        updatedAt: new Date(),
      };
    });

    return persistRooms({ jobId: input.jobId, rooms: nextRooms });
  }, [getCurrentJob, persistRooms]);

  const removeCabinetFromJob = useCallback(async (input: { jobId: string; roomId: string; instanceId: string }) => {
    const current = getCurrentJob(input.jobId);
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const normalizedExisting = normalizeRooms(existing);

    const nextRooms = normalizedExisting.map((room) =>
      room.id === input.roomId
        ? { ...room, cabinets: room.cabinets.filter((cabinet) => cabinet.instanceId !== input.instanceId), updatedAt: new Date() }
        : room,
    );

    return persistRooms({ jobId: input.jobId, rooms: nextRooms });
  }, [getCurrentJob, persistRooms]);

  const persistQuoteSnapshot = useCallback(async (input: { jobId: string; snapshot: QuoteSnapshot; rooms?: TradeRoom[] }) => {
    const current = getCurrentJob(input.jobId);
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const existingDesignData = (current?.design_data || {}) as Partial<PersistedTradeDesignData>;
    const quoteSnapshotsByRoom = {
      ...(existingDesignData.quoteSnapshotsByRoom || {}),
      [input.snapshot.roomId]: input.snapshot,
    };

    return upsertJobMutation.mutateAsync({
      id: input.jobId,
      name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
      status: normalizeStatus(current?.status),
      // Prefer the caller's live rooms; fall back to cache only if not provided.
      // (Writing the stale cached rooms here was dropping newly-added cabinets.)
      rooms: input.rooms ?? normalizeRooms(existing),
      existingDesignData,
      designDataPatch: {
        quoteSnapshot: input.snapshot,
        quoteSnapshotsByRoom,
      },
    });
  }, [getCurrentJob, upsertJobMutation]);

  const persistJobTotals = useCallback(async (input: { jobId: string; subtotal?: number; tax?: number; total?: number; rooms?: TradeRoom[] }) => {
    const current = getCurrentJob(input.jobId);
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const existingDesignData = (current?.design_data || {}) as Partial<PersistedTradeDesignData>;

    return upsertJobMutation.mutateAsync({
      id: input.jobId,
      name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
      status: normalizeStatus(current?.status),
      // Prefer caller's live rooms; cache fallback dropped newly-added cabinets.
      rooms: input.rooms ?? normalizeRooms(existing),
      existingDesignData,
      designDataPatch: {
        jobTotals: {
          subtotal: input.subtotal,
          tax: input.tax,
          total: input.total,
          updatedAt: new Date().toISOString(),
        },
      },
      costExclTax: input.subtotal,
      costInclTax: input.total,
    });
  }, [getCurrentJob, upsertJobMutation]);

  const updateJobStatus = useCallback(async (status: TradeJobStatus) => {
    if (!jobId || jobId === 'new') return;

    const { error } = await supabase.from('jobs').update({ status }).eq('id', jobId);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: jobQueryKey(jobId) });
  }, [jobId, queryClient]);

  const exportJobJson = useCallback(() => {
    if (!jobQuery.data) return;
    const blob = new Blob([JSON.stringify(jobQuery.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `job-${jobQuery.data.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [jobQuery.data]);

  const exportJobPdf = useCallback(() => {
    if (!jobQuery.data) return;
    const data = (jobQuery.data.design_data || {}) as unknown as PersistedTradeDesignData;
    const rooms = normalizeRooms((data.tradeRooms || []) as TradeRoom[]);

    const quoteSnapshot = data.quoteSnapshot;
    const quoteSnapshotsByRoom = data.quoteSnapshotsByRoom || {};

    generateTradeQuotePDF({
      job: {
        id: jobQuery.data.id,
        name: jobQuery.data.name,
        status: jobQuery.data.status || 'draft',
        updatedAt: jobQuery.data.updated_at,
      },
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        cabinets: room.cabinets.map((cab) => ({
          cabinetNumber: cab.cabinetNumber,
          productName: cab.productName,
          category: cab.category,
          dimensions: cab.dimensions,
          estimatedTotal: quoteSnapshotsByRoom[room.id]?.perCabinetTotals?.[cab.instanceId] ?? quoteSnapshot?.perCabinetTotals?.[cab.instanceId],
        })),
      })),
      totals: data.jobTotals,
    });
  }, [jobQuery.data]);


  const persistedDesignData = useMemo(() => {
    return (jobQuery.data?.design_data || {}) as Partial<PersistedTradeDesignData>;
  }, [jobQuery.data?.design_data]);

  const persistedJobTotals = useMemo(() => persistedDesignData.jobTotals ?? null, [persistedDesignData]);
  const persistedQuoteSnapshot = useMemo(() => persistedDesignData.quoteSnapshot ?? null, [persistedDesignData]);
  const persistedQuoteSnapshotsByRoom = useMemo(
    () => persistedDesignData.quoteSnapshotsByRoom ?? {},
    [persistedDesignData],
  );

  return {
    jobQuery,
    roomsFromServer,
    persistedJobTotals,
    persistedQuoteSnapshot,
    persistedQuoteSnapshotsByRoom,
    upsertJob: upsertJobMutation.mutateAsync,
    upsertRoom,
    replaceRoomInJob,
    upsertCabinet,
    removeCabinetFromJob,
    persistQuoteSnapshot,
    persistJobTotals,
    updateJobStatus,
    exportJobJson,
    exportJobPdf,
    isSaving: upsertJobMutation.isPending,
  };
}
