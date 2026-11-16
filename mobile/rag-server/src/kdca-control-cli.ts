import { stopSupabaseKdca } from './kdca-control-store.js';
// Operator explicitly invokes this only after authorization. No activation/upsert API.
const [command, id, status, operator, extra] = process.argv.slice(2);
if (command !== 'disable' || !id || !operator || extra || !['revoked','changed_pending_review'].includes(status ?? '')) {
  console.error('KDCA_CONTROL_ARGUMENTS_INVALID'); process.exitCode = 1;
} else {
  stopSupabaseKdca(id, status as 'revoked' | 'changed_pending_review', operator, process.env)
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('KDCA_DURABLE_STOP_FAILED'); process.exitCode = 1; });
}
