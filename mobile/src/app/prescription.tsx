import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { pickPrescriptionImage } from '../services/prescriptionImage';
import { PrescriptionImageError, type PrescriptionImage, type PrescriptionImageSource } from '../services/prescriptionImagePolicy';
import { checkPrescriptionDur, durConfigured } from '../services/prescriptionAnalysis';
import { DUR_SOURCE_URL, parseDurDraft, type DurCandidate, type DurDrug, type DurResult } from '../services/durContract';
import { DurMedicineSearch } from '../components/DurMedicineSearch';
import { PublicMedicineInfo } from '../components/PublicMedicineInfo';
import { FeaturePage } from '../components/FeaturePage';
import { FeatureModal } from '../components/FeatureModal';
import { FeatureTabs } from '../components/FeatureTabs';
import { Action, C, Chip, Field, Panel, StatusMessage, TitleRow, s } from '../components/ui';

function PrescriptionContent() {
  const [step, setStep] = useState(0), [source, setSource] = useState<'camera' | 'album' | null>(null);
  const [choice, setChoice] = useState(false), [privacy, setPrivacy] = useState(false), [durDetails, setDurDetails] = useState(false);
  const [drug, setDrug] = useState(''), [dose, setDose] = useState('');
  const [image, setImage] = useState<PrescriptionImage | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [ocrInfo, setOcrInfo] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [durResult, setDurResult] = useState<DurResult | null>(null), [checking, setChecking] = useState(false);
  const durRequest = useRef<AbortController | null>(null);
  function resetAnalysis() {
    durRequest.current?.abort(); durRequest.current = null;
    setChecking(false); setConfirmed(false); setDurResult(null);
  }
  function editDrug(text: string) { resetAnalysis(); setDrug(text); }
  let selectedDrugs: DurDrug[] = [];
  try { if (drug.trim()) selectedDrugs = parseDurDraft(drug); } catch { /* Editable draft is validated before sending. */ }
  function selectMedicine(candidate: DurCandidate) {
    let selected: DurDrug[] = [];
    try { if (drug.trim()) selected = parseDurDraft(drug); } catch { setError('먼저 입력한 약품명과 품목코드를 확인해 주세요.'); return; }
    if (selected.some(d => d.itemSeq === candidate.itemSeq)) return;
    if (selected.length >= 6) { setError('한 번에 최대 6개 품목을 선택할 수 있습니다.'); return; }
    editDrug([...selected, candidate].map(d => `${d.name}${d.itemSeq ? ` | ${d.itemSeq}` : ''}`).join('\n')); setError('');
  }
  function cancelDur() { resetAnalysis(); }
  async function runDur() {
    if (durRequest.current || !confirmed) return;
    let drugs;
    try { drugs = parseDurDraft(drug); } catch { setError('약품명은 한 줄에 하나씩, 최대 6개를 입력하세요. 품목코드는 선택 입력이며 9자리 숫자입니다.'); return; }
    const request = new AbortController(); durRequest.current = request;
    setChecking(true); setError(''); setDurResult(null);
    try {
      const result = await checkPrescriptionDur(drugs, request.signal);
      if (mounted.current && durRequest.current === request && !request.signal.aborted) { setDurResult(result); setStep(2); }
    } catch (cause) {
      if (mounted.current && durRequest.current === request) setError(cause instanceof Error ? cause.message : '병용금기 조회에 실패했습니다.');
    } finally {
      if (mounted.current && durRequest.current === request) { durRequest.current = null; setChecking(false); }
    }
  }
  const current = useRef<PrescriptionImage | null>(null);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; pending.current?.abort(); durRequest.current?.abort(); void current.current?.release();
  }; }, []);
  function release(value: PrescriptionImage | null) {
    if (value) void value.release().then(ok => {
      if (!ok && mounted.current) setError('임시 이미지 정리를 완료하지 못했습니다. 기기의 앱 캐시를 확인해 주세요.');
    });
  }
  function clearImage() {
    resetAnalysis();
    pending.current?.abort(); pending.current = null; setBusy(false);
    const old = current.current; current.current = null; setImage(null);
    setDrug(''); setDose(''); release(old);
  }
  async function choose(nextSource: PrescriptionImageSource) {
    if (pending.current) return;
    clearImage(); setError(''); setChoice(false); setSource(nextSource);
    const request = new AbortController(); pending.current = request; setBusy(true);
    try {
      const selected = await pickPrescriptionImage(nextSource, request.signal);
      if (!mounted.current || pending.current !== request || request.signal.aborted) { release(selected); return; }
      current.current = selected; setImage(selected);
    } catch (cause) {
      if (mounted.current && pending.current === request) setError(cause instanceof PrescriptionImageError ? cause.message : '이미지를 선택하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (mounted.current && pending.current === request) { pending.current = null; setBusy(false); }
    }
  }
  return <>
    <StatusMessage>이미지는 이 기기에서만 미리 봅니다. 마스킹·OCR은 미연결이며 업로드하지 않습니다. 병용금기는 확인한 약품 정보만 별도로 조회합니다.</StatusMessage>
    {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
    <FeatureTabs labels={['1. 처방전 촬영', '2. 약품명 확인', '3. DUR 결과']} selected={step} onSelect={setStep} />
    {step === 0 ? <Panel>
      <TitleRow title="처방전 이미지" accessory={image ? '선택됨' : busy ? '선택 중' : '미선택'} />
      <Text style={[s.sectionTitle,{marginBottom:12,color:C.blue}]}>처방전이나 약봉투를{ '\n' }한눈에 보이게 선택해 주세요</Text>
      <View style={{ minHeight: 220, borderWidth: 2, borderStyle: 'dashed', borderColor: C.blue,backgroundColor:C.pale, borderRadius: 16, justifyContent: 'center', alignItems: 'center', padding: 22, gap: 12 }}>
        {image ? <Image source={{ uri: image.uri }} style={{ width: '100%', height: 280 }} contentFit="contain" cachePolicy="none" onError={() => { if (current.current === image) { clearImage(); setError('이미지를 표시하지 못했습니다. 다른 이미지로 선택해 주세요.'); } }} /> : <><Text style={{ fontSize: 36 }}>▤</Text><Text style={s.bodyStrong}>처방전 미리보기</Text><Text style={[s.caption, { textAlign: 'center' }]}>직접 선택한 이미지 한 장만 표시합니다. 자동으로 개인정보를 가리지 않습니다.</Text></>}
      </View>
      <View style={{ marginTop: 16, gap: 10 }}><Action label={image ? '다른 이미지 선택' : '처방전 이미지 선택'} disabled={busy} onPress={() => setChoice(true)} />
        {(image || busy) && <Action label={busy ? '선택 취소' : '선택 이미지 제거'} outline onPress={clearImage} />}
        {image && <Chip text={`${source === 'camera' ? '촬영' : '파일 선택'} · ${image.mimeType.replace('image/', '').toUpperCase()} · ${(image.size / 1024 / 1024).toFixed(2)}MiB`} kind="neutral" />}
        <Action label="OCR 분석 안내" disabled={!image} outline onPress={() => setOcrInfo(true)} />
        <Action label="약품명 직접 확인·입력" outline onPress={() => setStep(1)} />
        <Action label="개인정보 처리 안내" outline onPress={() => setPrivacy(true)} />
      </View>
      <View style={s.listItem}><Text style={s.caption}>JPEG·PNG·WebP 한 장 · 최대 10MiB · 카메라는 촬영 시 권한 요청 · 업로드 없음</Text></View>
    </Panel> : step === 1 ? <Panel>
      <TitleRow title="추출한 약품 확인" accessory="추출 결과 없음" />
      <DurMedicineSearch selected={selectedDrugs} onSelect={selectMedicine} disabled={checking} />
      <StatusMessage kind="empty">OCR 결과는 없습니다. 처방전을 보고 직접 확인한 약품명을 한 줄에 하나씩 입력하세요. 같은 이름이라도 함량·제조사·성분이 다를 수 있으므로 품목 확인이 필요합니다.</StatusMessage>
      <Field label="약품명 확인 · 최대 6개" placeholder={'약품명 | 품목기준코드(선택)\n한 줄에 한 약품씩 입력'} value={drug} onChangeText={editDrug} maxLength={720} multiline editable={!checking} />
      {selectedDrugs.map((d, i) => <View key={`${d.itemSeq ?? d.name}-${i}`} style={s.listItem}><Text style={s.bodyStrong}>{d.name}</Text><Text style={s.caption}>{d.itemSeq ? `품목코드 ${d.itemSeq}` : '품목코드 미확인'}</Text><Action small outline label={`${d.name} 선택 제거`} disabled={checking} onPress={() => editDrug(selectedDrugs.filter((_, index) => index !== i).map(x => `${x.name}${x.itemSeq ? ` | ${x.itemSeq}` : ''}`).join('\n'))} /></View>)}
      <Field label="처방 용법·용량 확인" placeholder="처방전 내용을 그대로 확인하세요" value={dose} onChangeText={setDose} maxLength={500} multiline />
      <Text style={s.caption}>입력은 저장하지 않습니다. 조회 시 약품명·품목코드만 서버와 식약처 API로 전달합니다. 이미지·용법·개인정보는 보내지 않습니다.</Text>
      {!durConfigured() && <StatusMessage>병용금기 조회 서버는 아직 미연결입니다. 서버 설정·배포 후 사용할 수 있습니다.</StatusMessage>}
      <View style={{ marginTop: 14, gap: 10 }}>
        <Action label={confirmed ? '✓ 약품명을 확인했고 조회 정보 전송에 동의함' : '약품명 확인 및 조회 정보 전송 동의'} outline disabled={checking || !drug.trim()} onPress={() => setConfirmed(v => !v)} />
        <Action label={checking ? '병용금기 조회 중' : '확인한 약품의 병용금기 조회'} disabled={!durConfigured() || !confirmed || checking} onPress={() => { void runDur(); }} />
        {checking && <Action label="조회 취소" outline onPress={cancelDur} />}
        <Action label="촬영 단계로" outline onPress={() => setStep(0)} />
      </View>
    </Panel> : <Panel>
      <TitleRow title="의약품 안전성 확인" accessory={durResult ? '참고 정보' : '미검사'} />
      <StatusMessage kind="empty">{durResult ? '병용금기 품목정보만 조회한 참고 결과입니다. 조회 없음·일치 없음은 안전하다는 의미가 아닙니다. 성분·함량·전체 복용약 확인은 약사·의료진에게 요청하세요.' : 'DUR 검사 결과가 없습니다. 결과 없음은 안전하다는 의미가 아닙니다.'}</StatusMessage>
      {durResult?.drugs.map((d, i) => <View key={i} style={s.listItem}>
        <Text style={s.bodyStrong}>{d.name}</Text><Chip text={d.identityConfirmed ? '입력 품목코드 일치' : '품목·성분 식별 미확인'} kind="neutral" />
        {d.truncated && <Text style={s.caption}>응답 일부만 조회되어 전체 비교가 불가능합니다.</Text>}
        {!d.candidates.length && <Text style={s.caption}>일치하는 품목정보가 없습니다. 안전 판정 불가.</Text>}
        {!d.identityConfirmed && d.candidates.map(c => <Action key={c.itemSeq} small outline label={`${c.name} · 품목 ${c.itemSeq} 확인하여 입력란에 반영`} onPress={() => {
          const drugs = parseDurDraft(drug); drugs[i] = { name: c.name, itemSeq: c.itemSeq };
          editDrug(drugs.map(x => `${x.name}${x.itemSeq ? ` | ${x.itemSeq}` : ''}`).join('\n')); setStep(1);
        }} />)}
      </View>)}
      {!!durResult?.warnings.length && <Text style={s.sectionTitle}>선택 품목 간 병용금기 일치 정보</Text>}
      {durResult?.warnings.map((w, i) => <StatusMessage key={i} kind="error">{w.first} / {w.second}: {w.content}</StatusMessage>)}
      {!!durResult?.notices?.length && <><Text style={s.sectionTitle}>품목별 금기 참고·주의 안내</Text><Text style={s.caption}>아래 등록 정보는 현재 선택한 약품 조합과의 일치 판정이 아닙니다. 상대 약물과 실제 성분·함량을 약사·의료진에게 확인하세요.</Text>{durResult.notices.map((n, i) => <View key={i} style={s.listItem}><Text style={s.bodyStrong}>{n.name}</Text><Text style={s.caption}>금기 상대 품목: {n.counterpart ?? '제공 정보 없음'}</Text><Text style={s.paragraph}>{n.content}</Text></View>)}</>}
      {durResult && !durResult.warnings.length && <StatusMessage>확인된 품목 조합의 병용금기 일치를 찾지 못했습니다. 미식별 품목·성분 기준 비교·잘린 응답은 포함하지 않으므로 안전 여부는 미확인입니다.</StatusMessage>}
      {['병용금기', '연령금기', '임부금기', '중복 처방·주의사항'].map(label => <View key={label} style={s.listItem}><Text style={s.bodyStrong}>{label}</Text><Chip text={label === '병용금기' && durResult ? '제한적 품목 조회' : '미확인'} kind="neutral" /></View>)}
      <Text style={[s.caption, { marginTop: 12 }]}>{durResult ? '근거: 식약처 DUR 병용금기 품목정보의 현재 조회 응답. 전체 DUR 검사는 아닙니다.' : '근거 데이터·검사 시각: 없음.'} 약 변경이나 중단은 의료진과 상의하세요.</Text>
      {durResult?.checkedAt && <Text style={s.caption}>조회 시각: {new Date(durResult.checkedAt).toLocaleString()} · 원자료 갱신일은 별도 확인 필요</Text>}
      <Action label="식약처 DUR 공식 출처 보기 ↗" outline onPress={() => { void Linking.openURL(DUR_SOURCE_URL).catch(() => setError('공식 출처 페이지를 열지 못했습니다.')); }} />
      {durResult && <Action label="같은 약품으로 다시 조회" outline disabled={checking || !confirmed} onPress={() => { void runDur(); }} />}
      <View style={{ marginTop: 14 }}><Action label="검사 근거·상세 항목 보기" outline onPress={() => setDurDetails(true)} /></View>
      <View style={{ marginTop: 14 }}><Action label="약품명 확인 단계로" outline onPress={() => setStep(1)} /></View>
    </Panel>}
    <FeatureModal visible={choice} title="촬영·선택 방법" onClose={() => setChoice(false)}>
      <StatusMessage>직접 선택한 이미지 한 장만 읽습니다. JPEG·PNG·WebP, 최대 10MiB를 지원합니다.</StatusMessage>
      {Platform.OS !== 'web' && <Action label="카메라로 촬영" outline onPress={() => { void choose('camera'); }} />}
      <Action label={Platform.OS === 'web' ? '이미지 파일 선택' : '앨범에서 선택'} outline onPress={() => { void choose('album'); }} />
    </FeatureModal>
    <FeatureModal visible={privacy} title="처방전 개인정보 보호" onClose={() => setPrivacy(false)}>
      <Text style={s.paragraph}>선택한 원본이 가려지지 않은 상태로 표시됩니다. 서버로 전송하거나 영구 보관하지 않습니다. 제거·재선택·화면 종료 시 미리보기와 임시 파일 정리를 시도합니다. 기기 캐시의 완전 삭제를 보장하지 않으며 촬영 시 운영체제의 임시 파일이 생길 수 있습니다. 원래 앨범 파일은 삭제하지 않습니다. 약품 입력도 저장하지 않습니다.</Text>
    </FeatureModal>
    <FeatureModal visible={ocrInfo} title="OCR 요청 전 확인" onClose={() => setOcrInfo(false)}>
      <StatusMessage>OCR 제공자와 개인정보 마스킹이 아직 연결되지 않아 요청할 수 없습니다. 동의 여부와 관계없이 현재 이미지는 전송되지 않습니다.</StatusMessage>
      <Text style={s.paragraph}>연결 시 기기에서 약품 영역만 자르고 이름·주민등록번호·연락처를 가린 복사본을 미리 확인한 후, 처리기관·보관기간을 안내하고 건별 동의를 받아야 합니다. 원본은 전송하지 않는 경로로 준비합니다. 인식한 약품명은 직접 확인·수정한 뒤 별도로 DUR 조회에 동의합니다.</Text>
      <Action label="OCR 요청 · 서버 및 마스킹 미연결" disabled onPress={() => {}} />
    </FeatureModal>
    <FeatureModal visible={durDetails} title="DUR 검사 상세" onClose={() => setDurDetails(false)}>
      <StatusMessage kind="empty">{durResult ? `입력 약품 ${durResult.drugs.length}개 · 품목코드까지 일치한 병용금기 응답 ${durResult.warnings.length}건. 식약처 DUR품목정보 중 병용금기만 조회했습니다.` : '검사 결과와 근거 자료가 아직 없습니다.'}</StatusMessage>
      <Text style={s.paragraph}>품목명이 같은 제품도 성분·함량·제조사가 다를 수 있습니다. 코드 미확인, 성분 단위 비교, 조회 범위 밖 복용약은 미검증입니다. 연령·임신·용량·중복 처방·개인별 질환을 반영한 검사는 수행하지 않습니다.</Text>
      <Text style={s.caption}>데이터 갱신일: 별도 확인 필요. 조회 정보만으로 안전 여부를 판정하지 않습니다.</Text>
    </FeatureModal>
  </>;
}
export default function PrescriptionScreen() {
  return <FeaturePage title="처방전·의약품 정보" subtitle="공개 의약품 정보는 환자와 보호자 모두 확인할 수 있습니다.">{user => user.role === 'patient'
    ? <><PublicMedicineInfo key={`public:${user.id}`} /><View style={{ marginTop: 18 }}><PrescriptionContent key={user.id} /></View></>
    : <PublicMedicineInfo key={user.id} />}</FeaturePage>;
}
