import type { Coordinates, Place } from './placeContract';
export const tileSize = 256;
export function project(c: Coordinates, zoom: number) {
  const size = tileSize * 2 ** zoom, lat = Math.max(-85, Math.min(85, c.latitude)) * Math.PI / 180;
  return { x: (c.longitude + 180) / 360 * size, y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * size };
}
export function unproject(x: number, y: number, zoom: number): Coordinates {
  const size = tileSize * 2 ** zoom;
  return { longitude: ((x / size * 360) % 360 + 360) % 360 - 180, latitude: Math.max(-85,Math.min(85,Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI)) };
}
export type MapView = Coordinates & { zoom: number };
export function panCenter(center: MapView, deltaX: number, deltaY: number): MapView {
  const origin = project(center, center.zoom);
  return { ...unproject(origin.x - deltaX, origin.y - deltaY, center.zoom), zoom: center.zoom };
}
export function zoomAt(center: MapView, targetZoom: number, point: { x: number; y: number }, width: number, height: number): MapView {
  const zoom = Math.max(5, Math.min(18, Math.round(targetZoom)));
  if (zoom === center.zoom) return center;
  const offsetX = point.x - width / 2, offsetY = point.y - height / 2;
  const origin = project(center, center.zoom);
  const anchor = unproject(origin.x + offsetX, origin.y + offsetY, center.zoom);
  const nextAnchor = project(anchor, zoom);
  return { ...unproject(nextAnchor.x - offsetX, nextAnchor.y - offsetY, zoom), zoom };
}
export function mappedPlaces(places: Place[]) { return places.filter((p): p is Place & { coordinates: Coordinates } => !!p.coordinates && Number.isFinite(p.coordinates.latitude) && Number.isFinite(p.coordinates.longitude) && Math.abs(p.coordinates.latitude)<=85 && Math.abs(p.coordinates.longitude)<=180); }
export function fitPlaces(places: Place[], width: number, height: number) {
  const points = mappedPlaces(places);
  if (!points.length) return null;
  const lat = points.map(p=>p.coordinates.latitude), lon = points.map(p=>p.coordinates.longitude);
  const center = { latitude: (Math.min(...lat)+Math.max(...lat))/2, longitude: (Math.min(...lon)+Math.max(...lon))/2 };
  let zoom = 16;
  for (;zoom>5;zoom--) { const p=points.map(p=>project(p.coordinates,zoom));if(Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x))<width-64 && Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y))<height-64)break; }
  return { ...center, zoom };
}
export function visibleTiles(center: Coordinates, zoom: number, width: number, height: number) {
  const p=project(center,zoom),left=p.x-width/2,top=p.y-height/2,tiles=[];
  for(let x=Math.floor(left/256);x<=Math.floor((left+width)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+height)/256);y++){
    if(y<0||y>=2**zoom)continue;
    const tx=((x%2**zoom)+2**zoom)%2**zoom;
    tiles.push({key:`${zoom}/${tx}/${y}`,url:`https://tile.openstreetmap.org/${zoom}/${tx}/${y}.png`,left:x*256-left,top:y*256-top});
  }
  return tiles;
}
