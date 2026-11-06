import { isPickerCacheFile, PrescriptionImageError, validateImageHeader, validateImageSize, type PrescriptionImage, type PrescriptionImageSource } from './prescriptionImagePolicy';

// Lazy native imports keep an older development build usable; a missing native
// module becomes a safe picker error, never a startup failure for other screens.
export async function pickPrescriptionImage(source: PrescriptionImageSource, signal?: AbortSignal): Promise<PrescriptionImage | null> {
  if (signal?.aborted) return null;
  let cleanup: (() => Promise<boolean>) | undefined;
  try {
    const picker = await import('expo-image-picker');
    const fs = await import('expo-file-system');
    if (signal?.aborted) return null;
    if (source === 'camera') {
      const permission = await picker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new PrescriptionImageError('PERMISSION');
    }
    if (signal?.aborted) return null;
    const options = { mediaTypes: ['images'] as ['images'], allowsEditing: false, allowsMultipleSelection: false, base64: false, exif: false, quality: 1 };
    // Images-only Android system photo picker needs no broad library scan.
    const result = source === 'camera' ? await picker.launchCameraAsync(options) : await picker.launchImageLibraryAsync(options);
    if (result.canceled) return null;
    if (result.assets.length !== 1) throw new PrescriptionImageError('READ');
    const asset = result.assets[0]!;
    const file = new fs.File(asset.uri);
    const owned = isPickerCacheFile(file.uri, fs.Paths.cache.uri);
    let released = false;
    cleanup = async () => {
      if (released || !owned) return true;
      try { if (file.exists) file.delete(); released = true; return true; } catch { return false; }
    };
    if (signal?.aborted) { await cleanup(); return null; }
    validateImageSize(file.size);
    const handle = file.open(fs.FileMode.ReadOnly);
    let header: Uint8Array;
    try { header = await handle.readBytes(12); } finally { handle.close(); }
    const mimeType = validateImageHeader(header, asset.mimeType);
    if (signal?.aborted) { await cleanup(); return null; }
    return { uri: file.uri, size: file.size, mimeType, release: cleanup };
  } catch (error) {
    await cleanup?.();
    if (signal?.aborted) return null;
    if (error instanceof PrescriptionImageError) throw error;
    throw new PrescriptionImageError('UNAVAILABLE');
  }
}
