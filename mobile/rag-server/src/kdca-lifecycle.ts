import { createHash } from 'node:crypto';
import type { State } from './model.js';
import type { Repository } from './repository.js';
import { kdcaCatalog, kdcaOfflineReviewMaxBytes } from './kdca-catalog.js';
import { parseKdcaXml } from './kdca-healthinfo.js';

export type KdcaLifecycleRecord = {
  status: 'active' | 'revoked' | 'changed_pending_review' | 'refresh_failed';
  reviewer: string; changedAt: string; contentHash?: string; rawHash?: string;
  observedRawHash?: string; lastVerifiedAt?: string;
};
export function validateKdcaLifecycle(value: State['kdcaLifecycle']): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('KDCA_LIFECYCLE_INVALID');
  for (const [id, record] of Object.entries(value)) {
    if (!/^kdca-\d{1,10}$/.test(id) || !record ||
      !['active','revoked','changed_pending_review','refresh_failed'].includes(record.status) ||
      typeof record.reviewer !== 'string' || !record.reviewer.trim() || record.reviewer.length > 100 ||
      !Number.isFinite(Date.parse(record.changedAt))) throw Error('KDCA_LIFECYCLE_INVALID');
    for (const digest of [record.rawHash, record.contentHash, record.observedRawHash])
      if (digest !== undefined && !/^[a-f0-9]{64}$/.test(digest)) throw Error('KDCA_LIFECYCLE_INVALID');
    if (record.lastVerifiedAt !== undefined && !Number.isFinite(Date.parse(record.lastVerifiedAt))) throw Error('KDCA_LIFECYCLE_INVALID');
    if (record.status === 'active' && (!record.rawHash || !record.contentHash || !record.lastVerifiedAt)) throw Error('KDCA_LIFECYCLE_INVALID');
  }
}
// Applied on every repository read and after snapshot restore. Tombstones survive deletion.
export function applyKdcaLifecycle(state: State): void {
  validateKdcaLifecycle(state.kdcaLifecycle);
  for (const [id, control] of Object.entries(state.kdcaLifecycle ?? {})) {
    const doc = state.documents[id];
    if (!doc) continue;
    if (control.status === 'active' && control.contentHash === doc.contentHash) continue;
    doc.rights.permission = 'pending';
    if (doc.rights.kdcaUse) doc.rights.kdcaUse.status = control.status === 'active' ? 'changed_pending_review' : control.status;
    for (const scope of ['local_search','quotation'] as const)
      if (doc.rights.scopes?.[scope]) doc.rights.scopes[scope]!.decision = 'denied';
  }
}
function checkOperator(reviewer: string) {
  if (!reviewer.trim() || reviewer.length > 100) throw Error('KDCA_OPERATOR_REQUIRED');
}
export async function disableKdca(repo: Repository, contentId: string, status: 'revoked' | 'changed_pending_review', reviewer: string) {
  checkOperator(reviewer);
  if (!/^\d{1,10}$/.test(contentId) || !['revoked','changed_pending_review'].includes(status)) throw Error('KDCA_CONTROL_ARGUMENTS_INVALID');
  return repo.transaction(state => {
    const id = 'kdca-' + contentId;
    state.kdcaLifecycle ??= {};
    state.kdcaLifecycle[id] = { ...state.kdcaLifecycle[id], status, reviewer, changedAt: new Date().toISOString() };
    applyKdcaLifecycle(state);
    return { contentId, status, searchEnabled: false, quotationEnabled: false };
  });
}
// Accept bytes from a bounded official response. Never store changed content or grant rights.
// Missing/invalid responses fail closed. An unchanged response cannot clear an operator stop.
export async function observeKdcaResponse(repo: Repository, contentId: string, bytes: Buffer | undefined, reviewer: string) {
  checkOperator(reviewer);
  const id = 'kdca-' + contentId;
  return repo.transaction(state => {
    const control = state.kdcaLifecycle?.[id];
    if (!control?.rawHash) throw Error('KDCA_REVIEWED_BASELINE_REQUIRED');
    let status: KdcaLifecycleRecord['status'] = 'refresh_failed', observedRawHash: string | undefined;
    try {
      if (!bytes || bytes.length > kdcaOfflineReviewMaxBytes) throw Error();
      const xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      const entry = kdcaCatalog.find(item => item.contentId === contentId);
      if (!entry) throw Error();
      parseKdcaXml(xml, entry, { offlineReview: true });
      observedRawHash = createHash('sha256').update(bytes).digest('hex');
      status = observedRawHash === control.rawHash ? 'active' : 'changed_pending_review';
    } catch { /* Fail closed without exposing upstream content. */ }
    if (control.status === 'active') {
      control.status = status;
      control.changedAt = new Date().toISOString();
      control.reviewer = reviewer;
      if (status === 'active') {
        control.lastVerifiedAt = control.changedAt;
        const doc = state.documents[id];
        if (doc?.rights.kdcaUse?.status === 'active' && doc.contentHash === control.contentHash)
          doc.rights.kdcaUse.lastVerifiedAt = control.changedAt;
      }
    }
    if (observedRawHash) control.observedRawHash = observedRawHash;
    applyKdcaLifecycle(state);
    return { contentId, status: control.status, unchanged: status === 'active', requiresReview: control.status !== 'active' };
  });
}
