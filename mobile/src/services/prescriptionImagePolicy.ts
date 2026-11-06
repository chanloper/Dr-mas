export const MAX_PRESCRIPTION_IMAGE_BYTES = 10 * 1024 * 1024;
export type PrescriptionImageSource = 'camera' | 'album';
export type PrescriptionImage = { uri: string; size: number; mimeType: string; release: () => Promise<boolean> };
export class PrescriptionImageError extends Error {
  constructor(public code: 'TYPE' | 'SIZE' | 'READ' | 'PERMISSION' | 'UNAVAILABLE') {
    super({ TYPE: 'JPEG·PNG·WebP 이미지만 선택할 수 있습니다. PDF·HEIC 등은 지원하지 않습니다.', SIZE: '이미지는 0바이트보다 크고 10MiB 이하여야 합니다.', READ: '이미지를 읽거나 표시하지 못했습니다. 다른 이미지로 다시 선택해 주세요.', PERMISSION: '카메라 권한이 없습니다. 기기 설정에서 권한을 확인하거나 앨범에서 선택해 주세요.', UNAVAILABLE: '이 환경에서 이미지 선택기를 열지 못했습니다. 앱 빌드와 기기 지원 상태를 확인해 주세요.' }[code]);
  }
}
export function validateImageSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PRESCRIPTION_IMAGE_BYTES) throw new PrescriptionImageError('SIZE');
}
export function validateImageHeader(bytes: Uint8Array, declaredType?: string | null): string {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  const type = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : png.every((v, i) => bytes[i] === v) ? 'image/png'
      : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : null;
  if (!type || declaredType && declaredType !== 'application/octet-stream' && declaredType !== type) throw new PrescriptionImageError('TYPE');
  return type;
}
export function isPickerCacheFile(uri: string, cache: string): boolean {
  try {
    const file = new URL(uri), root = new URL('ImagePicker/', cache.endsWith('/') ? cache : `${cache}/`);
    if (file.protocol !== 'file:' || root.protocol !== 'file:' || file.host !== root.host || file.search || file.hash) return false;
    const filePath = decodeURIComponent(file.pathname), prefix = decodeURIComponent(root.pathname);
    return filePath.startsWith(prefix) && /^[a-zA-Z0-9_.-]+$/.test(filePath.slice(prefix.length)) && !['.', '..'].includes(filePath.slice(prefix.length));
  } catch { return false; }
}
