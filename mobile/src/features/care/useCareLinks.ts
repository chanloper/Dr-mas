import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { withCareNames } from '../../services/careNames';
import { getSupabaseClient } from '../../services/supabase';
import { createCareLinkRepository, careLinkErrorMessage, CareLinkError, type CareActor, type CareLink, type CareCursor, type CarePage } from '../../services/careLinks';

export function useCareLinks(actor: CareActor) {
  const [rows, setRows] = useState<CareLink[]>([]), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [supportsReconnect, setSupportsReconnect] = useState(false), [hasMore, setHasMore] = useState(false);
  const next = useRef<CareCursor | null>(null);
  const loaded = useRef<CareLink[]>([]);
  const epoch = useRef(0), mounted = useRef(false), lock = useRef(false), verifiedList = useRef(false);
  const invalidate = useCallback(() => { mounted.current = false; epoch.current++; lock.current = false; verifiedList.current = false; }, []);
  const applyPage = useCallback((data: CarePage) => {
    verifiedList.current = true; loaded.current = data.rows; next.current = data.next;
    setRows(data.rows); setHasMore(data.next !== null); setSupportsReconnect(data.supportsReconnect);
  }, []);
  const refresh = useCallback(async () => {
    if (!mounted.current || lock.current) return;
    lock.current = true; verifiedList.current = false; const version = ++epoch.current;
    setBusy(true); setReady(false); setRows([]); loaded.current = []; next.current = null;
    setSupportsReconnect(false); setHasMore(false); setError(null); setNotice(null);
    try {
      const data = await createCareLinkRepository(getSupabaseClient()).page({ id: actor.id, role: actor.role });
      data.rows = await withCareNames(getSupabaseClient(), { id: actor.id, role: actor.role }, data.rows);
      if (mounted.current && epoch.current === version) { applyPage(data); setReady(true); }
    } catch (e) { if (mounted.current && epoch.current === version) setError(careLinkErrorMessage(e)); }
    finally { if (mounted.current && epoch.current === version) { lock.current = false; setBusy(false); } }
  }, [actor.id, actor.role, applyPage]);
  async function loadMore() {
    if (!mounted.current || lock.current || !verifiedList.current || !next.current) return;
    if (loaded.current.length >= 500) { setError(careLinkErrorMessage(new CareLinkError('LIMIT', '한 번에 500개까지 확인할 수 있습니다. 목록을 새로고침해 주세요.'))); return; }
    lock.current = true; const version = epoch.current; setBusy(true); setError(null);
    try {
      const data = await createCareLinkRepository(getSupabaseClient()).page(actor, next.current);
      data.rows = await withCareNames(getSupabaseClient(), { id: actor.id, role: actor.role }, data.rows);
      if (!mounted.current || epoch.current !== version) return;
      if (data.supportsReconnect !== supportsReconnect) throw new CareLinkError('RESPONSE', '서버의 연결 기능이 변경되었습니다. 목록을 새로고침해 주세요.');
      const all = new Map(loaded.current.map(row => [row.id, row]));
      for (const row of data.rows) all.set(row.id, row);
      applyPage({ ...data, rows: [...all.values()] });
    } catch (e) {
      if (mounted.current && epoch.current === version) {
        verifiedList.current = false; next.current = null; loaded.current = [];
        setError(careLinkErrorMessage(e)); setRows([]); setReady(false); setSupportsReconnect(false); setHasMore(false);
      }
    } finally { if (mounted.current && epoch.current === version) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    mounted.current = true;
    const version = epoch.current;
    void Promise.resolve().then(() => { if (mounted.current && epoch.current === version) return refresh(); });
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { invalidate(); subscription.remove(); };
  }, [refresh, invalidate]);
  async function perform(action: 'request' | 'approve' | 'reject' | 'revoke' | 'cancel', id: string): Promise<boolean> {
    if (!mounted.current || lock.current || !verifiedList.current) return false;
    lock.current = true; const version = epoch.current; setBusy(true); setError(null); setNotice(null);
    try {
      const repo = createCareLinkRepository(getSupabaseClient());
      if (action === 'request') await repo.request(actor, id); else await repo.decide(actor, id, action);
      if (!mounted.current || epoch.current !== version) return false;
      const data = await repo.page(actor);
      data.rows = await withCareNames(getSupabaseClient(), { id: actor.id, role: actor.role }, data.rows);
      if (!mounted.current || epoch.current !== version) return false;
      applyPage(data); setNotice(action === 'request' ? '연결 요청을 보냈습니다. 환자의 승인을 기다려 주세요.' : action === 'approve' ? '연결을 승인했습니다.' : action === 'reject' ? '연결 요청을 거절했습니다.' : action === 'cancel' ? '연결 요청을 취소했습니다.' : '연결을 해제했습니다.');
      return true;
    } catch (e) {
      if (mounted.current && epoch.current === version) { verifiedList.current = false; next.current = null; loaded.current = []; setError(careLinkErrorMessage(e)); setRows([]); setReady(false); setSupportsReconnect(false); setHasMore(false); }
      return false;
    } finally { if (mounted.current && epoch.current === version) { lock.current = false; setBusy(false); } }
  }
  return { rows, ready, busy, error, notice, supportsReconnect, hasMore, loadMore, refresh, perform };
}
