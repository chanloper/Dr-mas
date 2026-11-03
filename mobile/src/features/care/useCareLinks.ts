import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSupabaseClient } from '../../services/supabase';
import { createCareLinkRepository, careLinkErrorMessage, type CareActor, type CareLink } from '../../services/careLinks';

export function useCareLinks(actor: CareActor) {
  const [rows, setRows] = useState<CareLink[]>([]), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const epoch = useRef(0), mounted = useRef(false), lock = useRef(false), verifiedList = useRef(false);
  const invalidate = useCallback(() => { mounted.current = false; epoch.current++; lock.current = false; verifiedList.current = false; }, []);
  const refresh = useCallback(async () => {
    if (!mounted.current || lock.current) return;
    lock.current = true; verifiedList.current = false; const version = ++epoch.current;
    setBusy(true); setReady(false); setRows([]); setError(null); setNotice(null);
    try {
      const data = await createCareLinkRepository(getSupabaseClient()).list({ id: actor.id, role: actor.role });
      if (mounted.current && epoch.current === version) { verifiedList.current = true; setRows(data); setReady(true); }
    } catch (e) { if (mounted.current && epoch.current === version) setError(careLinkErrorMessage(e)); }
    finally { if (mounted.current && epoch.current === version) { lock.current = false; setBusy(false); } }
  }, [actor.id, actor.role]);
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
      const data = await repo.list(actor);
      if (!mounted.current || epoch.current !== version) return false;
      setRows(data); setNotice(action === 'request' ? '연결 요청을 보냈습니다. 환자의 승인을 기다려 주세요.' : action === 'approve' ? '연결을 승인했습니다.' : action === 'reject' ? '연결 요청을 거절했습니다.' : '연결을 해제하거나 요청을 취소했습니다.');
      return true;
    } catch (e) {
      if (mounted.current && epoch.current === version) { verifiedList.current = false; setError(careLinkErrorMessage(e)); setRows([]); setReady(false); }
      return false;
    } finally { if (mounted.current && epoch.current === version) { lock.current = false; setBusy(false); } }
  }
  return { rows, ready, busy, error, notice, refresh, perform };
}
