// Browser sessions are per tab and survive reload, never stored in the HTML or
// a server-global variable. Native builds continue to use encrypted SecureStore.
export class SessionStorageError extends Error {}
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function createBrowserSessionStorage(provider: () => BrowserStorage | null) {
  return {
    async getItem(key: string): Promise<string | null> {
      try { return provider()?.getItem(key) ?? null; }
      catch { throw new SessionStorageError('브라우저 로그인 정보를 읽지 못했습니다.'); }
    },
    async setItem(key: string, value: string): Promise<void> {
      try { const storage = provider(); if (!storage) throw Error(); storage.setItem(key, value); }
      catch { throw new SessionStorageError('브라우저 로그인 정보를 저장하지 못했습니다.'); }
    },
    async removeItem(key: string): Promise<void> {
      try { provider()?.removeItem(key); }
      catch { throw new SessionStorageError('브라우저 로그인 정보를 삭제하지 못했습니다.'); }
    },
  };
}
export const secureSessionStorage = createBrowserSessionStorage(() => typeof window === 'undefined' ? null : window.sessionStorage);
