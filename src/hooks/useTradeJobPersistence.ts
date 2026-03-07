import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ConfiguredCabinet, TradeRoom, TradeJobStatus, isTradeJobStatus, QuoteSnapshot } from '@/types/trade';

interface PersistedTradeDesignData {
  tradeRooms: TradeRoom[];
  quoteSnapshot?: QuoteSnapshot;
  jobTotals?: {
    subtotal?: number;
    tax?: number;
    total?: number;
    updatedAt: string;
  };
  lastSyncedAt: string;
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

  const getCurrentJob = useCallback((id: string) => {
    return queryClient.getQueryData<any>(jobQueryKey(id)) ?? jobQuery.data;
  }, [jobQuery.data, queryClient]);

  const jobQuery = useQuery({
    queryKey: jobQueryKey(jobId),
    enabled: Boolean(jobId && jobId !== 'new'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, status, design_data, updated_at')
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
    mutationFn: async (input: { id: string; name: string; status?: TradeJobStatus; rooms: TradeRoom[]; designDataPatch?: Partial<PersistedTradeDesignData> }) => {
      const payload = {
        id: input.id,
        name: input.name,
        status: input.status ?? 'draft',
        design_data: {
          tradeRooms: serializeRooms(input.rooms),
          lastSyncedAt: new Date().toISOString(),
          ...(input.designDataPatch || {}),
        } as unknown as PersistedTradeDesignData,
      };

      const { data, error } = await supabase
        .from('jobs')
        .upsert(payload as any)
        .select('id, name, status, design_data, updated_at')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(jobQueryKey(data.id), data);
    },
  });

  const persistRooms = useCallback(async (input: { jobId: string; rooms: TradeRoom[] }) => {
    const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
    return upsertJobMutation.mutateAsync({
      id: input.jobId,
      name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
      status: normalizeStatus(current?.status),
      rooms: input.rooms,
    });
  }, [jobQuery.data, queryClient, upsertJobMutation]);

  const upsertRoom = useCallback(async (input: { jobId: string; room: TradeRoom }) => {
    const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const normalizedExisting = normalizeRooms(existing);

    const nextRooms = normalizedExisting.some((room) => room.id === input.room.id)
      ? normalizedExisting.map((room) => (room.id === input.room.id ? input.room : room))
      : [...normalizedExisting, input.room];

    return persistRooms({ jobId: input.jobId, rooms: nextRooms });
  }, [jobQuery.data, persistRooms, queryClient]);

  const replaceRoomInJob = useCallback(async (input: { jobId: string; room: TradeRoom }) => {
    return upsertRoom(input);
  }, [upsertRoom]);

  const upsertCabinet = useCallback(async (input: { jobId: string; roomId: string; cabinet: ConfiguredCabinet }) => {
    const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const normalizedExisting = normalizeRooms(existing);

    const hasRoom = normalizedExisting.some((room) => room.id === input.roomId);
    if (!hasRoom) {
      return;
    }

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
  }, [jobQuery.data, persistRooms, queryClient]);

  const removeCabinetFromJob = useCallback(async (input: { jobId: string; roomId: string; instanceId: string }) => {
    const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
    const normalizedExisting = normalizeRooms(existing);

    const nextRooms = normalizedExisting.map((room) =>
      room.id === input.roomId
        ? { ...room, cabinets: room.cabinets.filter((cabinet) => cabinet.instanceId !== input.instanceId), updatedAt: new Date() }
        : room,
    );

    return persistRooms({ jobId: input.jobId, rooms: nextRooms });
  }, [jobQuery.data, persistRooms, queryClient]);

  const persistQuoteSnapshot = useCallback(async (input: { jobId: string; snapshot: QuoteSnapshot }) => {
    const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];

    return upsertJobMutation.mutateAsync({
      id: input.jobId,
      name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
      status: normalizeStatus(current?.status),
      rooms: normalizeRooms(existing),
      designDataPatch: { quoteSnapshot: input.snapshot },
    });
  }, [jobQuery.data, queryClient, upsertJobMutation]);

  const persistJobTotals = useCallback(async (input: { jobId: string; subtotal?: number; tax?: number; total?: number }) => {
    const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
    const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];

    return upsertJobMutation.mutateAsync({
      id: input.jobId,
      name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
      status: normalizeStatus(current?.status),
      rooms: normalizeRooms(existing),
      designDataPatch: {
        jobTotals: {
          subtotal: input.subtotal,
          tax: input.tax,
          total: input.total,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }, [jobQuery.data, queryClient, upsertJobMutation]);

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
        })),
      })),
      totals: data.jobTotals,
    });
  }, [jobQuery.data]);

  return {
    jobQuery,
    roomsFromServer,
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
