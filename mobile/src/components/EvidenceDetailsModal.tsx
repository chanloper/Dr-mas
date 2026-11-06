import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { FeatureModal } from './FeatureModal';
import { Action, StatusMessage, s } from './ui';
import { safeRagSourceUrl, type RagSource } from '../services/ragClient';

export function EvidenceDetailsModal({ message, sources = [], onClose }: { message: string | null; sources?: readonly RagSource[]; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  async function open(url: string) {
    const epoch = revision.current;
    try { await Linking.openURL(safeRagSourceUrl(url)); }
    catch { if (epoch === revision.current) setFailed(true); }
  }
  // Only independently validated response sources are evidence. Source-looking
  // strings in a question or answer body never become citations or link actions.
  return <FeatureModal visible={message !== null} title="답변의 근거·출처" onClose={() => { setFailed(false); onClose(); }}>
    {!sources.length ? <StatusMessage kind="empty">이 답변에는 표시할 근거 정보가 없습니다. 출처가 없다는 사실을 확인 완료나 의학적 안전 판정으로 해석하지 마세요.</StatusMessage> : <>
      <StatusMessage>서버 검색 응답의 출처와 원문 인용입니다. 제공기관·갱신일·이용 조건을 함께 확인하세요.</StatusMessage>
      {sources.map((source, i) => <View key={`${source.documentId}:${source.chunkId}:${i}`} style={s.listItem}>
        <Text style={s.sectionTitle}>{source.title}</Text>
        <Text selectable style={s.paragraph}>{source.quote}</Text>
        <Text selectable style={s.caption}>문서: {source.documentId}{'\n'}근거 ID: {source.chunkId}{'\n'}제공기관: {source.publisher || '미확인'}{'\n'}원본 갱신일: {source.updatedAt || '미확인'}</Text>
        {source.attribution && <Text selectable style={s.paragraph}>데이터셋명: {source.attribution.datasetName}{'\n'}품목기준코드: {source.attribution.itemCode}{'\n'}이용 조건: {source.attribution.termsLabel}</Text>}
        <Text selectable style={s.caption}>{source.sourceUrl}</Text>
        <Action label={source.attribution ? '공식 데이터셋 링크 열기 ↗' : '자료 출처 열기 ↗'} outline small onPress={() => { void open(source.sourceUrl); }} />
        {source.attribution && <Action label="이용 조건 근거 열기 ↗" outline small onPress={() => { void open(source.attribution!.termsUrl); }} />}
        {source.attribution?.verifiedDetailUrl && source.attribution.detailVerifiedAt && <><Text style={s.caption}>상세 링크 확인일: {source.attribution.detailVerifiedAt}</Text><Action label="검증된 상세페이지 열기 ↗" outline small onPress={() => { void open(source.attribution!.verifiedDetailUrl!); }} /></>}
      </View>)}
    </>}
    {failed && <StatusMessage kind="error">출처 페이지를 열지 못했습니다. 네트워크 연결을 확인해 주세요.</StatusMessage>}
  </FeatureModal>;
}
