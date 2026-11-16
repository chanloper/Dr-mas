import { Image, type ImageProps } from 'react-native';

// Let the browser send its real UA/Referer and honor HTTP cache headers.
export function MapTile({ url, onError, ...props }: Omit<ImageProps, 'source' | 'onError'> & { url: string; onError: () => void }) {
  return <Image {...props} source={{ uri: url }} onError={onError} />;
}
