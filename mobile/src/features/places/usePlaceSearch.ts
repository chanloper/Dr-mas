import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../../services/places';
import { currentPlaceLocation, PlaceLocationError } from '../../services/placeLocation';
import type { Category, Place, PlaceQuery } from '../../services/placesClient';
import { PlacesError } from '../../services/placesClient';

export function usePlaceSearch() {
  const [category, setCategory] = useState<Category>('hospital');
  const [keyword, setKeyword] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [isEnd, setIsEnd] = useState(true);
  const request = useRef<PlaceQuery | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => () => { generation.current++; active.current?.abort(); }, []);
  function invalidate() {
    generation.current++; active.current?.abort(); active.current = null; busy.current = false;
    request.current = null; setPlaces([]); setError(null); setSearched(false); setLoading(false); setIsEnd(true);
  }
  function chooseCategory(next: Category) { invalidate(); setCategory(next); }
  function changeKeyword(next: string) { invalidate(); setKeyword(next); }
  async function run(mode: 'keyword' | 'nearby' | 'more') {
    if (busy.current) return;
    const old = request.current;
    if (mode === 'more' && (!old || isEnd)) return;
    const epoch = ++generation.current;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const current = () => generation.current === epoch;
    busy.current = true; setLoading(true); setError(null);
    if (mode !== 'more') { request.current = null; setPlaces([]); setSearched(false); setIsEnd(true); }
    try {
      // Location is requested only by explicit nearby action; keyword mode never
      // requests permission or silently reuses a previously denied location.
      const query: PlaceQuery = mode === 'more' ? { ...old!, page: old!.page + 1 }
        : mode === 'nearby' ? { category, mode, query: '', coordinates: await currentPlaceLocation(), page: 1 }
          : { category, mode, query: keyword, page: 1 };
      if (!current()) return;
      const result = await searchPlaces(query, controller.signal);
      if (!current()) return;
      request.current = query;
      setPlaces(previous => mode === 'more' ? [...previous, ...result.places.filter(p => !previous.some(oldPlace => oldPlace.id === p.id))] : result.places);
      setSearched(true); setIsEnd(result.isEnd);
    } catch (e) {
      if (current()) setError(e instanceof PlacesError || e instanceof PlaceLocationError ? e.message : '검색을 완료하지 못했습니다. 다시 시도해 주세요.');
    } finally { if (current()) { busy.current = false; setLoading(false); active.current = null; } }
  }
  return { category, chooseCategory, keyword, changeKeyword, places, loading, error, searched, isEnd, run };
}
