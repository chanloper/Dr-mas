// Public institution numbers only. Never invoked on mount or automatically.
export function placePhoneUrl(phone: string): string | null {
  if (!/^\+?[0-9 ()-]{7,30}$/.test(phone)) return null;
  const number = phone.replace(/[ ()-]/g, '');
  return /^\+?\d{7,15}$/.test(number) ? `tel:${number}` : null;
}
export async function requestPlaceDialer(phone: string, openURL: (url: string) => Promise<unknown>): Promise<boolean> {
  const url = placePhoneUrl(phone); if (!url) return false;
  try { await openURL(url); return true; } catch { return false; }
}
