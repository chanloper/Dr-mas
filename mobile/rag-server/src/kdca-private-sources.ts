// Server-only issued URL vault. Never serialize credentials into catalog,
// checkpoints, review files or error messages. No default network transport.
import { open } from 'node:fs/promises';
import { kdcaCatalog, kdcaOfficialEndpoint, normalizeKdcaToken, requireKdcaLiveReady } from './kdca-catalog.js';
import { stageKdcaXml } from './kdca-offline.js';
import { fetchKdca } from './kdca-healthinfo.js';
import type { KdcaContent } from './kdca-catalog.js';

const maxFileBytes = 8_000_000;
type Credential = { token: string; encodedToken: string };
export class KdcaPrivateSources {
  #credentials = new Map<string, Credential>();
  constructor(input: unknown) {
    try {
      const value = input as { schema: unknown; items: unknown[] };
      if (!value || value.schema !== 1 || !Array.isArray(value.items) || !value.items.length || value.items.length > 1000
        || Object.keys(value).some(key => !['schema', 'items'].includes(key))) throw Error();
      for (const item of value.items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error();
        const row = item as Record<string, unknown>;
        if (Object.keys(row).some(key => !['contentId', 'issuedUrl'].includes(key))
          || typeof row.contentId !== 'string' || !/^\d{1,10}$/.test(row.contentId)
          || typeof row.issuedUrl !== 'string' || row.issuedUrl.length > 16_000
          || /[\u0000-\u0020\u007f\\]/u.test(row.issuedUrl) || this.#credentials.has(row.contentId)) throw Error();
        // Match the literal official endpoint. Do not canonicalize an alternate
        // host, port, scheme or path into the issued contract.
        if (!row.issuedUrl.startsWith(kdcaOfficialEndpoint + '?')) throw Error();
        const url = new URL(row.issuedUrl);
        if (url.origin + url.pathname !== kdcaOfficialEndpoint || url.hash || url.username || url.password) throw Error();
        const parts = row.issuedUrl.slice(kdcaOfficialEndpoint.length + 1).split('&');
        if (parts.length !== 2) throw Error();
        const fields = new Map<string, string>();
        for (const part of parts) {
          const equal = part.indexOf('=');
          const key = part.slice(0, equal), raw = part.slice(equal + 1);
          if (equal < 1 || !['TOKEN', 'cntntsSn'].includes(key) || fields.has(key) || !raw) throw Error();
          fields.set(key, raw);
        }
        if (fields.get('cntntsSn') !== row.contentId) throw Error();
        // Percent decode once; '+' is literal, never form-decoded to a space.
        const encodedToken = fields.get('TOKEN')!;
        const token = normalizeKdcaToken(encodedToken, 'url-component');
        this.#credentials.set(row.contentId, { token, encodedToken });
      }
    } catch { throw Error('KDCA_PRIVATE_LIST_INVALID'); }
  }
  toJSON() { return { code: 'KDCA_PRIVATE_LIST_REDACTED', count: this.#credentials.size }; }
  describe() {
    return { count: this.#credentials.size, supportedCount: kdcaCatalog.filter(entry => this.#credentials.has(entry.contentId)).length,
      liveEnabled: false, externalAiEnabled: false };
  }
  #entry(contentId: string): KdcaContent {
    const entry = kdcaCatalog.find(item => item.contentId === contentId);
    if (!entry || !this.#credentials.has(contentId)) throw Error('KDCA_NOT_APPROVED_OR_NOT_CONFIGURED');
    return entry;
  }
  assertXmlHasNoCredentials(xml: string) {
    // Check every issued credential, including a token for a different content.
    for (const { token, encodedToken } of this.#credentials.values()) {
      if ([token, encodedToken, encodeURIComponent(token)].some(secret => xml.includes(secret))) throw Error('KDCA_SECRET_IN_RESPONSE');
    }
  }
  async stageXml(file: string, parent: string, contentId: string, options: { synthetic?: boolean } = {}) {
    this.#entry(contentId);
    // Reuse bounded XML parsing, exact ID/title checks, raw hashes and review
    // quarantine. Inspect the same bytes that will be parsed (no double-read).
    return stageKdcaXml(file, parent, contentId, { ...options, inspectXml: xml => this.assertXmlHasNoCredentials(xml) });
  }
  async collect(contentId: string, env: Record<string, string | undefined>) {
    // Always throws today, before TOKEN/URL construction or network activity.
    // No flag alone can resolve the official HTTP/SSL contradiction.
    requireKdcaLiveReady(env);
    const entry = this.#entry(contentId);
    return fetchKdca(entry, this.#credentials.get(contentId)!.token);
  }
}

export async function readKdcaPrivateSources(env: Record<string, string | undefined>): Promise<KdcaPrivateSources> {
  const path = env.KDCA_ISSUED_URLS_FILE;
  if (!path || env.EXPO_PUBLIC_KDCA_ISSUED_URLS_FILE) throw Error('KDCA_PRIVATE_FILE_REQUIRED');
  try {
    const file = await open(path, 'r');
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size > maxFileBytes
        || process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) throw Error();
      const buffer = Buffer.alloc(maxFileBytes + 1);
      let size = 0;
      while (size < buffer.length) {
        const part = await file.read(buffer, size, buffer.length - size, null);
        if (!part.bytesRead) break;
        size += part.bytesRead;
      }
      if (size > maxFileBytes) throw Error();
      return new KdcaPrivateSources(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))));
    } finally { await file.close(); }
  } catch { throw Error('KDCA_PRIVATE_FILE_INVALID'); }
}
