import type { SupabaseClient } from '@supabase/supabase-js';

export function rlsDiagnosticsEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
    && process.env.EXPO_PUBLIC_APP_ENV === 'development'
    && process.env.EXPO_PUBLIC_RLS_DIAGNOSTICS === '1';
}
export type TestAccount = 'A' | 'B' | 'G' | 'H';
export type DiagnosticRow = { check: string; count: number | null; error: boolean; result: 'PASS' | 'FAIL' | '미검증'; reason: string };
type Baseline = { a: string; g: string; schedules: number; records: number; links: number; expires: number };
type SosBaseline = { a: string; g: string; recipientCount: number; guardianVerified: boolean; expires: number };
const uuid = (x: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
// This module retains only a short-lived, in-memory synthetic-fixture baseline.
// No tokens, query rows, logs, storage or admin key. Dispose after the test.
export function createRlsDiagnostics(client: SupabaseClient, enabled: () => boolean = rlsDiagnosticsEnabled, matchesProject: (ref: string) => boolean = () => false) {
  let baseline: Baseline | null = null;
  let sosBaseline: SosBaseline | null = null;
  let busy = false;
  const fail = (reason: string): DiagnosticRow[] => [{ check: '실행 조건', count: null, error: true, result: 'FAIL', reason }];
  return {
    clearBaseline() { baseline = null; sosBaseline = null; },
    async run(account: TestAccount, patient: string, guardian: string): Promise<DiagnosticRow[]> {
      if (!enabled()) return fail('DEV_ONLY');
      if (busy) return fail('BUSY');
      const a = patient.trim().toLowerCase(), g = guardian.trim().toLowerCase();
      if (!['A', 'B', 'G', 'H'].includes(account) || !uuid(a) || !uuid(g) || a === g) return fail('INPUT');
      const ref = process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_REF;
      try {
        if (!ref || !/^[a-z0-9-]+$/.test(ref) || !matchesProject(ref)) return fail('PROJECT');
      } catch { return fail('PROJECT'); }
      busy = true;
      if (account === 'A') { baseline = null; sosBaseline = null; }
      if (account === 'G' && sosBaseline?.a === a && sosBaseline.g === g) sosBaseline.guardianVerified = false;
      let invalidated = false, owner: string | undefined;
      const abort = new AbortController();
      let unsubscribe = () => {};
      const timer = setTimeout(() => abort.abort(), 45000);
      try {
        const watcher = client.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_OUT' || owner && session?.user.id !== owner) { invalidated = true; abort.abort(); }
        });
        unsubscribe = () => watcher.data.subscription.unsubscribe();
        const auth = await client.auth.getUser();
        if (auth.error || !auth.data.user || invalidated) return fail('AUTH');
        owner = auth.data.user.id;
        const expectedRole = account === 'A' || account === 'B' ? 'patient' : 'guardian';
        if (account === 'A' && owner !== a || account === 'G' && owner !== g
          || account === 'B' && [a, g].includes(owner) || account === 'H' && [a, g].includes(owner)) return fail('ACCOUNT');
        const profile = await client.from('profiles').select('id,role').eq('id', owner).limit(2).abortSignal(abort.signal);
        if (profile.error || !Array.isArray(profile.data) || profile.data.length !== 1
          || profile.data[0].id !== owner || profile.data[0].role !== expectedRole) return fail('OWN_PROFILE');
        const rows: DiagnosticRow[] = [{ check: '본인 인증·프로필·역할', count: 1, error: false, result: 'PASS', reason: 'VERIFIED' }];
        const known = baseline && baseline.a === a && baseline.g === g && baseline.expires > Date.now() ? baseline : null;
        const allowed = account === 'A' || account === 'G';
        async function count(check: string, table: string, filters: Record<string, string>, expect: 'positive' | 'zero' | 'one', needsBaseline: boolean, expectedCount?: number, evidence = !!known, missingReason = 'A_BASELINE_REQUIRED') {
          if (invalidated || abort.signal.aborted || !enabled()) throw Error();
          // HEAD requests return counts only, selecting a real key for each table.
          let query = client.from(table).select(table === 'medication_records' ? 'medication_id' : 'id', { count: 'exact', head: true });
          for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
          const reply = await query.abortSignal(abort.signal);
          const n = reply.count;
          const valid = !reply.error && Number.isSafeInteger(n) && n! >= 0;
          const matches = valid && (expect === 'zero' ? n === 0 : expect === 'one' ? n === 1 : n! > 0)
            && (expectedCount === undefined || n === expectedCount);
          const missingBaseline = needsBaseline && !evidence;
          rows.push({ check, count: valid ? n : null, error: !valid,
            result: !valid || !matches ? 'FAIL' : missingBaseline ? '미검증' : 'PASS',
            reason: !valid ? 'QUERY_ERROR' : !matches ? 'UNEXPECTED_COUNT' : missingBaseline ? missingReason : 'EXPECTED_COUNT' });
          return valid ? n! : null;
        }
        const schedules = await count('A 복약 일정', 'medications', { patient_id: a }, allowed ? 'positive' : 'zero', account !== 'A', allowed ? known?.schedules : undefined);
        const records = await count('A 복약 기록', 'medication_records', { patient_id: a }, allowed ? 'positive' : 'zero', account !== 'A', allowed ? known?.records : undefined);
        const links = await count('A–G 연결 이력', 'care_links', { patient_id: a, guardian_id: g }, allowed ? 'positive' : 'zero', account !== 'A', allowed ? known?.links : undefined);
        const activeApprovedCount = await count('A–G 현재 승인 연결', 'care_links', { patient_id: a, guardian_id: g, status: 'approved' }, allowed ? 'one' : 'zero', account !== 'A');
        if (account !== 'A') await count('A 프로필 차단', 'profiles', { id: a }, 'zero', true);
        const medicationChecksPassed = rows.every(r => r.result === 'PASS');
        const sosKnown = sosBaseline && sosBaseline.a === a && sosBaseline.g === g && sosBaseline.expires > Date.now() ? sosBaseline : null;
        let sosEvidence = account === 'G' ? !!sosKnown : !!sosKnown?.guardianVerified;
        const sosStart = rows.length;
        if (account === 'H') {
          const approved = await count('H–A 승인 연결 없음', 'care_links', { patient_id: a, guardian_id: owner, status: 'approved' }, 'zero', false);
          sosEvidence = sosEvidence && approved === 0;
        }
        // A sees all recipients; G only its own deliveries. Never assume those counts equal.
        await count('A SOS 이력', 'sos_alerts', { patient_id: a }, allowed ? 'positive' : 'zero', account !== 'A',
          account === 'G' ? sosKnown?.recipientCount : undefined, sosEvidence, 'A_G_SOS_BASELINE_REQUIRED');
        const sosRecipientCount = await count('A–G SOS 이력', 'sos_alerts', { patient_id: a, guardian_id: g }, allowed ? 'positive' : 'zero', account !== 'A',
          account === 'G' ? sosKnown?.recipientCount : undefined, sosEvidence, 'A_G_SOS_BASELINE_REQUIRED');
        const finalAuth = await client.auth.getUser();
        if (invalidated || abort.signal.aborted || !enabled() || finalAuth.error || finalAuth.data.user?.id !== owner) return fail('SESSION_CHANGED_OR_TIMEOUT');
        if (account === 'A') {
          baseline = medicationChecksPassed && schedules !== null && records !== null && links !== null
            ? { a, g, schedules, records, links, expires: Date.now() + 15 * 60 * 1000 } : null;
          sosBaseline = activeApprovedCount === 1 && rows.slice(sosStart).every(r => r.result === 'PASS') && sosRecipientCount !== null
            ? { a, g, recipientCount: sosRecipientCount, guardianVerified: false, expires: Date.now() + 15 * 60 * 1000 } : null;
        }
        if (account === 'G' && sosKnown && activeApprovedCount === 1 && rows.slice(sosStart).every(r => r.result === 'PASS')) sosKnown.guardianVerified = true;
        return rows;
      } catch { return fail('AUTH_NETWORK_OR_TIMEOUT'); }
      finally { clearTimeout(timer); unsubscribe(); busy = false; }
    },
  };
}
