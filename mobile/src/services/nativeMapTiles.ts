import * as FileSystem from 'expo-file-system/legacy';

export const tileUserAgent = 'DrMAS/1.0 (+https://drmasrealfinal.vercel.app)';
export const tileCacheSeconds = 7 * 24 * 60 * 60;
const pending = new Map<string, Promise<string>>();
let blocked = false;

// Only user-visible tiles are requested. Never prefetch, rotate identities or retry a block.
export function cachedNativeTile(url: string): Promise<string> {
  const match = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
  if (!match || !FileSystem.documentDirectory) return Promise.reject(new Error('MAP_TILE_UNAVAILABLE'));
  const existing = pending.get(url);
  if (existing) return existing;
  const task = (async () => {
    const directory = `${FileSystem.documentDirectory}drmas-map-tiles/`;
    const path = `${directory}${match.slice(1).join('-')}.png`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && info.size > 0 && Date.now() / 1000 - info.modificationTime < tileCacheSeconds) return path;
    if (blocked) throw new Error('MAP_TILE_BLOCKED');
    const temporary = `${path}.download`;
    try {
      const response = await FileSystem.downloadAsync(url, temporary, { headers: { 'User-Agent': tileUserAgent } });
      if (response.status === 403 || response.status === 429) blocked = true;
      if (response.status !== 200) throw new Error('MAP_TILE_UNAVAILABLE');
      const contentType = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
      if (!contentType?.toLowerCase().startsWith('image/png')) throw new Error('MAP_TILE_INVALID');
      await FileSystem.moveAsync({ from: temporary, to: path });
      return path;
    } finally {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
    }
  })();
  pending.set(url, task);
  void task.finally(() => pending.delete(url)).catch(() => {});
  return task;
}
