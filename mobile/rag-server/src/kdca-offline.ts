// Local XML intake only. No TOKEN loading, network transport or live-store writes.
import { stat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from './model.js';
import { kdcaCatalog, kdcaLimits, kdcaOfflineReviewMaxBytes } from './kdca-catalog.js';
import { parseKdcaXml, KdcaError } from './kdca-healthinfo.js';
import { createKdcaStaging, runKdcaBatch } from './kdca-batch.js';

export async function stageKdcaXml(file: string, parent: string, contentId: string, options: { synthetic?: boolean } = {}) {
  const entry = kdcaCatalog.find(item => item.contentId === contentId);
  if (!entry) throw new KdcaError('NOT_APPROVED');
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > kdcaOfflineReviewMaxBytes) throw new KdcaError('TOO_LARGE');
  let xml: string;
  try { xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(file)); }
  catch { throw new KdcaError('INVALID_XML'); }
  // An exported page or URL containing credentials is not an importable document.
  if (/(?:[?&]|&amp;|%3[fF]|%26)\s*TOKEN(?:=|%3[dD])/i.test(xml)) throw new KdcaError('SECRET_IN_RESPONSE');
  const payload = parseKdcaXml(xml, entry, { offlineReview: true });
  const directory = await createKdcaStaging(parent);
  const result = await runKdcaBatch({ directory, entries: [entry],
    policy: { intervalMs: 1000, retryDelayMs: 1000, maxAttempts: 1 },
    maxRequests: 1, offlineReview: true, load: async () => payload });
  if (result.items[contentId]?.status !== 'done') throw new KdcaError('INVALID_RESPONSE');
  await writeFile(join(directory, 'intake.json'), JSON.stringify({ schema: 1, contentId,
    material: options.synthetic === true ? 'synthetic' : 'unverified', rawHash: hash(xml) }), { flag: 'wx', mode: 0o600 });
  return { directory, contentId, sections: payload.sections.length, status: 'REVIEW_PENDING' as const,
    bytes: Buffer.byteLength(xml, 'utf8'), exceedsGuideMessageSize: Buffer.byteLength(xml, 'utf8') > kdcaLimits.maxResponseBytes,
    networkRequests: 0, searchEnabled: false, externalAiEnabled: false };
}
