import { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { cachedNativeTile } from '../services/nativeMapTiles';

export function MapTile({ url, onError, ...props }: Omit<ImageProps, 'source' | 'onError'> & { url: string; onError: () => void }) {
  const [cached, setCached] = useState<{ url: string; uri: string } | null>(null);
  useEffect(() => {
    let active = true;
    void cachedNativeTile(url).then(uri => { if (active) setCached({ url, uri }); }, () => { if (active) onError(); });
    return () => { active = false; };
  }, [url, onError]);
  return cached?.url === url ? <Image {...props} source={{ uri: cached.uri }} onError={onError} /> : null;
}
