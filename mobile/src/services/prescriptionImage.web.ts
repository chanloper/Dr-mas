import { PrescriptionImageError, validateImageHeader, validateImageSize, type PrescriptionImage, type PrescriptionImageSource } from './prescriptionImagePolicy';

export function pickPrescriptionImage(_source: PrescriptionImageSource, signal?: AbortSignal): Promise<PrescriptionImage | null> {
  if (signal?.aborted) return Promise.resolve(null);
  if (typeof document === 'undefined') return Promise.reject(new PrescriptionImageError('UNAVAILABLE'));
  return new Promise((resolve, reject) => {
    let done = false;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.multiple = false;
    input.style.display = 'none';
    function finish(value: PrescriptionImage | null, error?: PrescriptionImageError) {
      if (done) { if (value) void value.release(); return; }
      done = true; signal?.removeEventListener('abort', cancel); input.remove();
      input.onchange = null; input.oncancel = null;
      if (error) reject(error); else resolve(value);
    }
    const cancel = () => finish(null);
    input.oncancel = cancel;
    input.onchange = () => { void (async () => {
      try {
        const file = input.files?.[0];
        if (!file) { finish(null); return; }
        validateImageSize(file.size);
        const type = validateImageHeader(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type);
        if (done || signal?.aborted) { finish(null); return; }
        const uri = URL.createObjectURL(file); let released = false;
        finish({ uri, size: file.size, mimeType: type, release: async () => { if (!released) { URL.revokeObjectURL(uri); released = true; } return true; } });
      } catch (error) { finish(null, error instanceof PrescriptionImageError ? error : new PrescriptionImageError('READ')); }
    })(); };
    signal?.addEventListener('abort', cancel, { once: true });
    try { document.body.appendChild(input); input.click(); } catch { finish(null, new PrescriptionImageError('UNAVAILABLE')); }
  });
}
