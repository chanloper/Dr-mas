import { Linking, Text, View } from 'react-native';
import { emergencyGuidance } from '../services/emergencyGuidance';
import { isSymptomInput, symptomLabel } from '../services/consultationFlow';
import type { Chat } from '../features/app/types';
import { Action, C, s } from './ui';

// Only expose sections explicitly present in a quoted original. Never infer a
// diagnosis, home treatment or referral from an unrelated paragraph.
export function healthEvidenceSections(quote: string) {
  const headings = [...quote.matchAll(/(?:^|\n)(원인|관련 질환|일반적인 대처|생활 관리|의료기관 방문|진료가 필요한 경우|위험 신호|응급 증상)\s*[:：]/gu)];
  return headings.map((heading, index) => ({
    title: heading[1]!,
    quote: quote.slice(heading.index + (quote[heading.index] === '\n' ? 1 : 0), headings[index + 1]?.index ?? quote.length),
  }));
}

// Select a contiguous original section, never summarize or reconstruct sentences.
export function questionQuote(quote: string, question?: string): string {
  if (!question) return quote;
  const topics: [RegExp, string][] = [
    [/보관/u, '보관방법'], [/복용법|복용방법|사용법/u, '사용법'],
    [/주의/u, '주의사항'], [/효능/u, '효능'],
  ];
  const requested = topics.filter(([pattern]) => pattern.test(question)).map(([, name]) => name);
  if (!requested.length) return quote;
  const sections = [...quote.matchAll(/(?:^|\n)(효능|사용법|주의사항|보관방법):/gu)];
  const matching = sections.map((section, index) => ({ section, index })).filter(({ section }) => requested.includes(section[1]!));
  if (requested.some(name => !matching.some(({ section }) => section[1] === name))) return quote;
  const first = matching[0]!, last = matching.at(-1)!;
  const start = first.section.index + (quote[first.section.index] === '\n' ? 1 : 0);
  const end = sections[last.index + 1]?.index ?? quote.length;
  return quote.slice(start, end);
}

export function ChatMessage({ message, onEvidence, question }: { message: Chat; onEvidence: () => void; question?: string }) {
  const mine = message.sender === 'user';
  const emergency = !mine && message.status === 'emergency' ? message.emergency ?? (question ? emergencyGuidance(question) : null) : null;
  const insufficient = !mine && message.outcome === 'response' && message.status === 'insufficient_evidence';
  const hasEvidence = !mine && message.outcome !== 'error' && message.outcome !== 'cancelled'
    && (message.status === 'local_evidence' || message.status === 'grounded_answer') && !!message.sources?.length;
  const synthetic = hasEvidence && message.sources!.every(source => source.publisher === 'Dr.MAS 합성 테스트' && source.documentId.startsWith('synthetic_'));
  const publicHealthEvidence = hasEvidence && message.sources!.some(source => /^hira-public-/.test(source.documentId));
  const contextualLimit = question?.includes('\n추가 질문:') && isSymptomInput(question)
    ? `앞서 말씀하신 ${symptomLabel(question.split('\n추가 질문:')[0])}도 함께 검색했지만, 이번 질문에 답할 근거는 충분하지 않아요. ` : '';
  return <View style={[s.bubble, mine ? s.bubbleUser : s.bubbleAssistant]}>
    <Text style={[s.caption, { color: mine ? '#E5F4FF' : C.muted, marginBottom: 6 }]}>{mine ? '내 질문' : '건강정보 도우미'}</Text>
    {message.outcome === 'error' && <Text style={[s.bodyStrong, { color: C.danger, marginBottom: 6 }]}>건강정보를 불러오지 못했어요</Text>}
    {message.outcome === 'cancelled' && <Text style={[s.bodyStrong, { marginBottom: 6 }]}>요청을 취소했어요</Text>}
    {message.status === 'insufficient_evidence' && <Text style={[s.bodyStrong, { marginBottom: 6 }]}>관련 자료를 충분히 찾지 못했어요.</Text>}
    {hasEvidence ? <>
      <View style={{backgroundColor:C.pale,padding:14,borderRadius:12,marginBottom:8}}><Text style={[s.bodyStrong,{color:C.blue}]}>{synthetic ? '연결 검사용 가상 자료예요.' : '관련 자료를 찾았어요.'}</Text></View>
      <Text style={[s.caption, { marginTop: 6 }]}>{synthetic ? '실제 의료정보가 아니에요. 검색과 출처 표시만 확인하는 테스트예요.' : message.status === 'grounded_answer' ? 'Gemini가 선택한 원문 인용이에요. 새로운 의료 조언을 만든 답변은 아니에요.' : '공식 자료의 원문 일부예요. 요약하거나 새로운 의료 조언을 만든 답변은 아니에요.'}</Text>
      {message.sources!.map((source, index) => {
        const preview = source.publisher === '식품의약품안전처' && /^mfds-easy-\d+$/.test(source.documentId) ? questionQuote(source.quote, question) : source.quote;
        const publicHealth = /^hira-public-/.test(source.documentId);
        const sections = (!source.attribution || publicHealth) && /두통|복통|기침/u.test(source.title) ? healthEvidenceSections(source.quote) : [];
        return <View key={`${source.chunkId}:${index}`} style={s.sourceCard}>
        {sections.length > 0 && <>
          <Text style={s.bodyStrong}>공식 자료에서 확인된 내용</Text>
          {sections.map((section, i) => <View key={i}>
            {publicHealth && /예방/u.test(section.quote) && <Text style={s.caption}>예방 정보 · 증상 발생 후 대처법과 구분해 읽어 주세요.</Text>}
            <Text selectable style={s.paragraph}>{section.quote}</Text>
          </View>)}
        </>}
        {!sections.length && <View style={s.quotePreview}><Text style={s.caption}>{preview === source.quote ? '원문 인용 · 일부 미리보기' : '질문 관련 원문 · 일부 미리보기'}</Text><Text selectable numberOfLines={3} style={s.paragraph}>{preview}</Text></View>}
        <Text style={s.caption}>출처 · {source.title}</Text>
        <Text style={s.caption}>{source.publisher || '제공기관 정보 없음'}</Text>
      </View>;})}
      <Text style={s.caption}>자료에 없는 관련 질환·대처법·방문 기준은 추측해 보충하지 않습니다.</Text>
      {publicHealthEvidence && <Text style={s.caption}>분류 제목을 붙인 공개자료 발췌이며, 개인의 원인 질환이나 가능성 순위를 판단한 내용은 아니에요. 개인별 대처법과 진료과는 이 자료만으로 정할 수 없어요. 증상이 지속되거나 심해지면 의료진과 상담하세요. 의료 전문가의 임상 검토는 아직 완료되지 않았어요. 자료별 이용 조건과 전체 원문은 아래에서 확인할 수 있어요.</Text>}
      <Action label="원문 전체와 출처 보기" outline small onPress={onEvidence} />
      <Text style={[s.caption, { marginTop: 10 }]}>참고용 정보예요. 진단·처방이나 의료진의 판단을 대신하지 않아요.</Text>
    </> : <Text selectable style={{ color: mine ? C.white : C.ink, fontSize: 17, lineHeight: 28 }}>{insufficient
      ? contextualLimit + '현재 등록된 공식 자료에서는 질문에 답할 근거를 확인하지 못했어요. 원인이나 치료법을 추측하지 않을게요. 증상을 더 적거나 의료진과 상담해 주세요.'
      : emergency?.message ?? message.text}</Text>}
    {emergency && <>
      {emergency.sources.map(source => <View key={source.url}>
        <Text selectable accessibilityRole="link" style={[s.caption, { minHeight: 48, marginTop: 12 }]}
          onPress={() => void Linking.openURL(source.url).catch(() => {})}>
          공식 출처 · {source.publisher} · {source.title}{'\n'}{source.url}
        </Text>
        <Text style={s.caption}>{source.author} · {source.publishedAt} · {source.license}</Text>
      </View>)}
      <Text style={s.caption}>공개 지침 기반 안내이며 의료 전문가 검토는 아직 완료되지 않았습니다.</Text>
    </>}
  </View>;
}
