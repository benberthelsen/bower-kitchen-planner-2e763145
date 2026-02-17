import { useCallback, useMemo } from 'react';
import jsPDF from 'jspdf';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ConfiguredCabinet, TradeRoom } from '@/contexts/TradeRoomContext';

interface PersistedTradeDesignData {
  tradeRooms: TradeRoom[];
  lastSyncedAt: string;
}

type JobStatus = 'draft' | 'submitted' | 'processing' | 'completed';

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

export function useTradeJobPersistence(jobId?: string) {
  const queryClient = useQueryClient();

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

  const roomsFromServer = useMemo(() => {
    const designData = (jobQuery.data?.design_data || {}) as Partial<PersistedTradeDesignData>;
    const rooms = Array.isArray(designData.tradeRooms) ? designData.tradeRooms : [];
    return normalizeRooms(rooms as TradeRoom[]);
  }, [jobQuery.data?.design_data]);

  const upsertJobMutation = useMutation({
    mutationFn: async (input: { id: string; name: string; status?: JobStatus; rooms: TradeRoom[] }) => {
      const payload = {
        id: input.id,
        name: input.name,
        status: input.status ?? 'draft',
        design_data: {
          tradeRooms: serializeRooms(input.rooms),
          lastSyncedAt: new Date().toISOString(),
        } as PersistedTradeDesignData,
      };

      const { data, error } = await supabase
        .from('jobs')
        .upsert(payload)
        .select('id, name, status, design_data, updated_at')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(jobQueryKey(data.id), data);
    },
  });

  const upsertRoomMutation = useMutation({
    mutationFn: async (input: { jobId: string; room: TradeRoom }) => {
      const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
      const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
      const normalizedExisting = normalizeRooms(existing);

      const nextRooms = normalizedExisting.some((room) => room.id === input.room.id)
        ? normalizedExisting.map((room) => (room.id === input.room.id ? input.room : room))
        : [...normalizedExisting, input.room];

      return upsertJobMutation.mutateAsync({
        id: input.jobId,
        name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
        status: (current?.status as JobStatus) || 'draft',
        rooms: nextRooms,
      });
    },
  });

  const upsertCabinetMutation = useMutation({
    mutationFn: async (input: { jobId: string; roomId: string; cabinet: ConfiguredCabinet }) => {
      const current = queryClient.getQueryData<any>(jobQueryKey(input.jobId)) ?? jobQuery.data;
      const existing = ((current?.design_data as PersistedTradeDesignData | null)?.tradeRooms || []) as TradeRoom[];
      const normalizedExisting = normalizeRooms(existing);

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

      return upsertJobMutation.mutateAsync({
        id: input.jobId,
        name: current?.name || `Job ${input.jobId.slice(0, 8)}`,
        status: (current?.status as JobStatus) || 'draft',
        rooms: nextRooms,
      });
    },
  });

  const updateJobStatus = useCallback(async (status: JobStatus) => {
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
    const data = (jobQuery.data.design_data || {}) as PersistedTradeDesignData;
    const rooms = normalizeRooms((data.tradeRooms || []) as TradeRoom[]);

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Job ${jobQuery.data.name}`, 14, 18);
    doc.setFontSize(11);
    doc.text(`Status: ${jobQuery.data.status || 'draft'}`, 14, 26);
    doc.text(`Rooms: ${rooms.length}`, 14, 33);

    let y = 44;
    rooms.forEach((room, index) => {
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${room.name}`, 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Size: ${room.config.width} x ${room.config.depth} x ${room.config.height} mm`, 18, y);
      y += 5;
      doc.text(`Cabinets: ${room.cabinets.length}`, 18, y);
      y += 8;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`job-${jobQuery.data.id}.pdf`);
  }, [jobQuery.data]);

  return {
    jobQuery,
    roomsFromServer,
    upsertJob: upsertJobMutation.mutateAsync,
    upsertRoom: upsertRoomMutation.mutateAsync,
    upsertCabinet: upsertCabinetMutation.mutateAsync,
    updateJobStatus,
    exportJobJson,
    exportJobPdf,
    isSaving: upsertJobMutation.isPending || upsertRoomMutation.isPending || upsertCabinetMutation.isPending,
  };
}
