export class PlaceLocationError extends Error {
  constructor(public code: 'DENIED' | 'UNAVAILABLE' | 'INSECURE') {
    super(code === 'DENIED' ? '위치 권한이 없어 주변 검색을 사용할 수 없습니다. 지역명이나 기관명으로 검색하거나 기기·브라우저의 위치 권한을 확인해 주세요.'
      : code === 'INSECURE' ? '현재 위치 검색은 HTTPS 또는 localhost에서 이용할 수 있습니다. 지역명이나 기관명으로 검색해 주세요.'
        : '현재 위치를 확인하지 못했습니다. 위치 서비스를 확인하거나 키워드로 검색해 주세요.');
  }
}
