import AsyncStorage from '@react-native-async-storage/async-storage';

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
export class LocalMedicationError extends Error {
  constructor(public code: 'READ' | 'PARSE' | 'WRITE') {
    super(code === 'READ' ? '복약 기록을 읽지 못했습니다. 기존 기록은 보존됩니다.'
      : code === 'PARSE' ? '복약 기록 형식을 확인할 수 없습니다. 기존 기록은 보존됩니다.'
        : '복약 기록을 저장하지 못했습니다. 저장된 상태를 다시 확인해 주세요.');
  }
}
export function medicationKey(userId: string, day: string): string {
  if (!userId.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid medication scope');
  return `drmas.medication.v2.${encodeURIComponent(userId)}.${day}`;
}

// Shared across controller mounts. A read waits for a previous write on the
// same key; operations for different users never share their target key.
export function createLocalMedicationStore(storage: Storage) {
  const pending = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    pending.set(key, result);
    void result.finally(() => { if (pending.get(key) === result) pending.delete(key); }).catch(() => undefined);
    return result;
  }
  return {
    read(userId: string, day: string): Promise<string[]> {
      const key = medicationKey(userId, day);
      return serial(key, async () => {
        let raw: string | null;
        try { raw = await storage.getItem(key); } catch { throw new LocalMedicationError('READ'); }
        if (raw === null) return [];
        try {
          const ids: unknown = JSON.parse(raw);
          if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) throw new Error();
          return [...new Set(ids)] as string[];
        } catch { throw new LocalMedicationError('PARSE'); }
      });
    },
    write(userId: string, day: string, ids: string[], isCurrent: () => boolean): Promise<boolean> {
      const key = medicationKey(userId, day);
      const payload = JSON.stringify(ids);
      return serial(key, async () => {
        if (!isCurrent()) return false;
        try { await storage.setItem(key, payload); } catch { throw new LocalMedicationError('WRITE'); }
        return true;
      });
    },
  };
}

// Never read, delete, or automatically import unowned drmas.medication.v1 keys.
export const localMedications = createLocalMedicationStore(AsyncStorage);
