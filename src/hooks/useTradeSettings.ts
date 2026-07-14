import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TradeSettingsState = {
  materialDefault: string;
  hardwareSku: string;
  markupProfileId: string;
};

type MarkupProfile = {
  id: string;
  name: string;
};

const defaultState: TradeSettingsState = {
  materialDefault: 'Standard White Melamine',
  hardwareSku: '',
  markupProfileId: '',
};

export function useTradeSettings(userId?: string) {
  const storageKey = useMemo(() => `trade.settings.${userId ?? 'anonymous'}`, [userId]);
  const [settings, setSettings] = useState<TradeSettingsState>(defaultState);
  const [markupProfiles, setMarkupProfiles] = useState<MarkupProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setSettings(defaultState);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<TradeSettingsState>;
      setSettings({
        materialDefault: parsed.materialDefault ?? defaultState.materialDefault,
        hardwareSku: parsed.hardwareSku ?? defaultState.hardwareSku,
        markupProfileId: parsed.markupProfileId ?? defaultState.markupProfileId,
      });
    } catch {
      setSettings(defaultState);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!userId) return;

    const loadProfiles = async () => {
      setLoadingProfiles(true);
      const { data, error } = await supabase
        .from('client_markup_settings')
        .select('id, name, is_default')
        .eq('client_id', userId)
        .order('name', { ascending: true });

      if (error) {
        setMarkupProfiles([]);
        setLoadingProfiles(false);
        return;
      }

      const profiles = (data ?? []).map((profile) => ({ id: profile.id, name: profile.name }));
      setMarkupProfiles(profiles);

      const hasSelection = settings.markupProfileId && profiles.some((profile) => profile.id === settings.markupProfileId);
      if (!hasSelection) {
        const defaultProfile = data?.find((profile) => profile.is_default) ?? data?.[0];
        if (defaultProfile) {
          setSettings((prev) => ({ ...prev, markupProfileId: defaultProfile.id }));
        }
      }

      setLoadingProfiles(false);
    };

    void loadProfiles();
  }, [userId]);

  const updateSettings = useCallback(
    (updates: Partial<TradeSettingsState>) => {
      setSettings((prev) => {
        const next = { ...prev, ...updates };
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey],
  );

  return { settings, updateSettings, markupProfiles, loadingProfiles };
}
