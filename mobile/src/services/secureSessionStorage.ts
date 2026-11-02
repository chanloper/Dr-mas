import * as SecureStore from 'expo-secure-store';

// Sessions may exceed a single Keychain item's practical size. Store small
// Unicode-safe chunks and publish the manifest only after every chunk is saved.
// Nothing is written to AsyncStorage, logs or an unencrypted fallback.
let sequence = 0;
let queue: Promise<unknown> = Promise.resolve();
export class SessionStorageError extends Error {}
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task).catch(() => { throw new SessionStorageError('안전한 로그인 정보를 처리하지 못했습니다.'); });
  queue = result.catch(() => undefined);
  return result;
}
type Manifest = { generation: string; count: number };
async function manifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return null;
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('generation' in data) || !('count' in data)
    || typeof data.generation !== 'string' || !/^[a-z0-9_-]+$/.test(data.generation)
    || !Number.isInteger(data.count) || Number(data.count) < 1 || Number(data.count) > 512) throw new Error('Invalid session storage');
  return data as Manifest;
}
const partKey = (key: string, data: Manifest, index: number) => `${key}.${data.generation}.${index}`;
async function removeParts(key: string, data: Manifest) {
  for (let i = 0; i < data.count; i++) await SecureStore.deleteItemAsync(partKey(key, data, i));
}
async function available() {
  if (!await SecureStore.isAvailableAsync()) throw new Error('Secure session storage unavailable');
}
export const secureSessionStorage = {
  getItem: (key: string): Promise<string | null> => serialized(async () => {
    await available();
    const data = await manifest(key);
    if (!data) return null;
    const parts: string[] = [];
    for (let i = 0; i < data.count; i++) {
      const value = await SecureStore.getItemAsync(partKey(key, data, i));
      if (value === null) throw new Error('Incomplete session storage');
      parts.push(value);
    }
    return parts.join('');
  }),
  setItem: (key: string, value: string): Promise<void> => serialized(async () => {
    await available();
    const previous = await manifest(key);
    const characters = Array.from(value);
    const count = Math.max(1, Math.ceil(characters.length / 300));
    if (count > 512) throw new Error('Session too large for secure storage');
    let generation: string;
    do { generation = `${Date.now().toString(36)}_${(++sequence).toString(36)}`; } while (generation === previous?.generation);
    const data = { generation, count };
    try {
      for (let i = 0; i < count; i++) await SecureStore.setItemAsync(partKey(key, data, i), characters.slice(i * 300, (i + 1) * 300).join(''));
      await SecureStore.setItemAsync(key, JSON.stringify(data));
    } catch {
      await removeParts(key, data).catch(() => undefined);
      throw new Error('Session storage write failed');
    }
    // A completed write remains valid even if obsolete encrypted chunk cleanup fails.
    if (previous) await removeParts(key, previous).catch(() => undefined);
  }),
  removeItem: (key: string): Promise<void> => serialized(async () => {
    await available();
    let data: Manifest | null;
    try { data = await manifest(key); }
    catch {
      // An unreadable pointer must not prevent local logout. Unreferenced chunks
      // remain encrypted; they cannot be restored without a valid manifest.
      await SecureStore.deleteItemAsync(key);
      return;
    }
    if (data) await removeParts(key, data);
    await SecureStore.deleteItemAsync(key);
  }),
};
