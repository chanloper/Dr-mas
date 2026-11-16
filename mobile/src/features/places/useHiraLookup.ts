import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { lookupHira, hiraErrorMessage } from '../../services/hira';
import type { HiraPage, HiraQuery } from '../../services/hiraClient';

export function useHiraLookup() {
  const [result, setResult] = useState<HiraPage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null), epoch = useRef(0), busy = useRef(false), lastQuery = useRef<HiraQuery | null>(null);
  const stop = useCallback(() => { epoch.current++; active.current?.abort(); active.current = null; busy.current = false; }, []);
  const reset = useCallback(() => { stop(); lastQuery.current = null; setResult(null); setError(null); setLoading(false); }, [stop]);
  const pause = useCallback(() => { const wasBusy = busy.current; stop(); if (wasBusy) { setLoading(false); setError('화면을 벗어나 공공자료 조회를 취소했어요.'); } }, [stop]);
  useEffect(() => { const subscription = AppState.addEventListener('change', state => { if (state !== 'active') pause(); }); return () => { subscription.remove(); stop(); }; }, [pause, stop]);
  useFocusEffect(useCallback(() => () => { pause(); }, [pause]));
  async function run(input: HiraQuery | (() => Promise<HiraQuery>), more = false) {
    if (busy.current) return;
    const currentEpoch = ++epoch.current; const controller = new AbortController(); active.current = controller; busy.current = true;
    const current = () => epoch.current === currentEpoch;
    setLoading(true); setError(null); if (!more) { setResult(null); lastQuery.current = null; }
    try {
      const query = typeof input === 'function' ? await input() : input;
      if (!current()) return;
      lastQuery.current = query;
      const page = await lookupHira(query, controller.signal);
      if (!current()) return;
      setResult(previous => {
        if (!more || !previous) return page;
        const unique = new Map(previous.items.map(item => ['id' in item ? item.id : item.code, item]));
        for (const item of page.items) { const key = 'id' in item ? item.id : item.code; if (!unique.has(key)) unique.set(key, item); }
        return { ...page, items: [...unique.values()] };
      });
    } catch (failure) { if (current()) setError(hiraErrorMessage(failure)); }
    finally { if (current()) { setLoading(false); busy.current = false; active.current = null; } }
  }
  const more = () => { if (lastQuery.current && result?.hasMore) void run({ ...lastQuery.current, page: result.page + 1 }, true); };
  const retry = () => { if (lastQuery.current) void run(lastQuery.current, (lastQuery.current.page ?? 1) > 1); };
  return { result, loading, error, reset, run, more, retry, cancel: () => { stop(); setLoading(false); setError('공공자료 조회를 취소했어요.'); } };
}
