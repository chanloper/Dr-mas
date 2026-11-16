import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { FeatureModal } from './FeatureModal';
import { Action, StatusMessage, s } from './ui';
import { safeRagSourceUrl, type RagSource } from '../services/ragClient';
import { evidenceLinkInfo } from '../services/evidenceLinks';

export function EvidenceDetailsModal({ message, sources = [], onClose }: { message: string | null; sources?: readonly RagSource[]; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const [details, setDetails] = useState(false), [fullReply, setFullReply] = useState(false);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  async function open(url: string) {
    setFailed(false);
    const epoch = revision.current;
    try { await Linking.openURL(safeRagSourceUrl(url)); }
    catch { if (epoch === revision.current) setFailed(true); }
  }
  // Only independently validated response sources are evidence. Source-looking
  // strings in a question or answer body never become citations or link actions.
  return <FeatureModal visible={message !== null} fullHeight title="찾아본 자료와 원문" onClose={() => { setFailed(false); setDetails(false); setFullReply(false); onClose(); }}>
    {!sources.length ? <StatusMessage kind="empty">이 답변에는 표시할 근거 정보가 없습니다. 출처가 없다는 사실을 확인 완료나 의학적 안전 판정으로 해석하지 마세요.</StatusMessage> : <>
      <Text style={s.paragraph}>아래는 검색한 자료의 원문이에요. 제공기관과 이용 조건도 함께 확인해 주세요.</Text>
      {sources.map((source, i) => <View key={`${source.documentId}:${source.chunkId}:${i}`} style={s.sourceCard}>
        <Text style={s.sectionTitle}>{source.title}</Text>
        <Text selectable style={s.paragraph}>{source.quote}</Text>
        <Text style={s.caption}>제공기관: {source.publisher || '정보 없음'}{'\n'}자료 갱신일: {source.updatedAt || '정보 없음'}</Text>
        {source.attribution && <Text selectable style={s.paragraph}>자료명: {source.attribution.datasetName}{'\n'}자료 식별자: {source.attribution.itemCode}{'\n'}이용 조건: {source.attribution.termsLabel}</Text>}
        {details && <Text selectable style={s.caption}>문서: {source.documentId}{'\n'}근거 ID: {source.chunkId}{'\n'}원본 주소: {source.sourceUrl}{source.attribution ? `\n이용 조건 기록: ${source.attribution.termsUrl}` : ''}</Text>}
        <Action label={source.attribution ? '공식 데이터셋 링크 열기 ↗' : '자료 출처 열기 ↗'} outline small onPress={() => { void open(source.sourceUrl); }} />
        {source.attribution && <>
          {evidenceLinkInfo(source.attribution.termsUrl).structuredRecord && <Text style={s.caption}>이용 조건 원본은 프로그램이 읽는 JSON 기록이라 코드처럼 보일 수 있어요. 쉬운 설명은 공식 이용정책에서 확인해 주세요.</Text>}
          {evidenceLinkInfo(source.attribution.termsUrl).guideUrl && <Action label="공식 이용정책 안내 읽기 ↗" outline small onPress={() => { void open(evidenceLinkInfo(source.attribution!.termsUrl).guideUrl!); }} />}
          <Action label={evidenceLinkInfo(source.attribution.termsUrl).structuredRecord ? '이용 조건 원본 기록 열기 (JSON) ↗' : '이용 조건 근거 열기 ↗'} outline small onPress={() => { void open(source.attribution!.termsUrl); }} />
          <Text style={s.caption}>이용 조건 안내와 외부 AI 전송 허용 여부는 별개예요. 이 화면에서 문서의 전송 권한이 바뀌지는 않아요.</Text>
        </>}
        {source.attribution?.verifiedDetailUrl && source.attribution.detailVerifiedAt && <><Text style={s.caption}>상세 링크 확인일: {source.attribution.detailVerifiedAt}</Text><Action label="검증된 상세페이지 열기 ↗" outline small onPress={() => { void open(source.attribution!.verifiedDetailUrl!); }} /></>}
      </View>)}
      <Action label={details ? '자료 식별정보 접기' : '자료 식별정보 자세히'} outline small onPress={() => setDetails(value => !value)} />
      <Action label={fullReply ? '받은 응답 전체 접기' : '받은 응답 전체 펼치기'} outline small onPress={() => setFullReply(value => !value)} />
      {fullReply && <Text selectable style={s.paragraph}>{message}</Text>}
    </>}
    {failed && <StatusMessage kind="error">출처 페이지를 열지 못했습니다. 네트워크 연결을 확인해 주세요.</StatusMessage>}
  </FeatureModal>;
}
