import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Action, C, Chip, Panel, StatusMessage, SummaryTile, TitleRow, s } from './ui';
import { SosDelaySlider } from './SosDelaySlider';
import { createLiveSimulator, scenarios, type Scenario, type SimulationFrame } from '../features/wearable/liveSimulator';
import { SimulationSosBridge } from './SimulationSosBridge';
import type { SosActor } from '../services/sos';

const labels: Record<Scenario, string> = {
  daily: '일상', exercise: '운동', high: '높은 심박수', low: '낮은 심박수', fall: '낙상 이벤트',
  disconnect: '기기 연결 해제', interrupted: '데이터 수신 중단', reconnect: '기기 재연결',
};
export function WearableSimulatorPanel({ actor }: { actor: SosActor }) {
  const [engine] = useState(() => createLiveSimulator(`simulation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`));
  const [delay, setDelay] = useState(10);
  const delayRef = useRef(delay);
  useEffect(() => { delayRef.current = delay; }, [delay]);
  const [frame, setFrame] = useState<SimulationFrame>(() => engine.tick(Date.now(), delay));
  useEffect(() => {
    const timer = setInterval(() => setFrame(engine.tick(Date.now(), delayRef.current)), 1000);
    return () => { clearInterval(timer); engine.stop(); };
  }, [engine]);
  function update(action: () => void) { action(); setFrame(engine.tick(Date.now(), delay)); }
  return <Panel>
    <TitleRow title="가상 웨어러블 시뮬레이터" accessory="합성 데이터 전용" />
    <StatusMessage>아래 수치는 실제 갤럭시 워치 측정값이 아닙니다. 2초 간격 합성 데이터이며 의료적 판단에 사용할 수 없습니다. Dev 지정 계정에서만 테스트 SOS 수신함 저장을 준비할 수 있습니다. 전화·문자·외부 푸시·응급기관 신고는 없습니다.</StatusMessage>
    <Chip text={!frame.running ? '생성 중지' : frame.connection === 'disconnected' ? '가상 기기 연결 해제' : frame.stale ? '가상 기기 연결 · 수신 지연' : '가상 기기 연결'} kind="neutral" />
    <View style={{ gap: 10, marginVertical: 12 }}>
      <Action label={frame.running ? frame.sosResult === 'completed' ? '합성 데이터 생성 중지' : '합성 데이터 생성 중지 · 테스트 SOS 취소' : '가상 기기 연결 · 합성 데이터 생성 시작'} onPress={() => update(() => frame.running ? engine.stop() : engine.start())} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {scenarios.map(value => <Action key={value} small outline={frame.scenario !== value} label={`${frame.scenario === value ? '선택: ' : ''}${labels[value]}`} onPress={() => update(() => engine.select(value))} />)}
      </View>
    </View>
    {frame.sosLeft !== null && <View accessibilityLiveRegion="polite" style={{ gap: 10, marginTop: 16 }}>
      <Text style={[s.bodyStrong, { color: C.danger }]}>가상 낙상 수신 · 테스트 SOS {frame.sosLeft}초</Text>
      <Text style={s.paragraph}>시간이 끝나면 테스트 SOS를 표시합니다. Dev 보호자 전달을 준비한 경우에만 수신함에 저장합니다. 실제 신고는 없습니다.</Text>
      <Action label="테스트 SOS 취소" danger onPress={() => update(() => engine.cancel())} />
    </View>}
    <SimulationSosBridge actor={actor} event={frame.sosEvent} completed={frame.sosResult === 'completed'} />
    {frame.sosResult === 'cancelled' && <StatusMessage>테스트 SOS가 취소되었습니다.</StatusMessage>}
    <Text style={s.caption}>현재 시나리오: {labels[frame.scenario]} · 출처: Dr.MAS 합성 센서 공급자</Text>
    <View style={s.tileGrid}>
      <SummaryTile title="합성 심박수" value={frame.bpm === null ? '—' : `${frame.bpm} BPM`} footer="의료적 위험 기준 아님" />
      <SummaryTile title="합성 걸음 수" value={frame.steps === null ? '—' : `${frame.steps}걸음`} footer="시연 누적값" />
      <SummaryTile title="합성 수면 시간" value={frame.sleep === null ? '—' : `${frame.sleep.toFixed(1)}시간`} footer="시나리오 생성값" />
    </View>
    <Text style={s.caption}>최근 합성 측정: {frame.measuredAt ? new Date(frame.measuredAt).toLocaleString() : '없음'}{frame.stale ? ' · 오래된 기록 (현재 값 아님)' : ''}</Text>
    <Text style={s.bodyStrong}>합성 심박수 변화 · 최근 30개</Text>
    <View accessible accessibilityLabel={`합성 심박수 그래프, ${frame.history.length}개 기록. 최근 ${frame.bpm ?? '없음'} BPM`} style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingVertical: 10 }}>
      {frame.history.length === 0 ? <Text style={s.caption}>생성을 시작하면 그래프가 표시됩니다.</Text> : frame.history.map((bpm, index) => <View key={index} style={{ flex: 1, maxWidth: 20, height: Math.max(2, bpm / 180 * 100), backgroundColor: C.blue, borderRadius: 3 }} />)}
    </View>
    <Text style={s.caption}>표시 범위 0~180 BPM · 높고 낮은 값 모두 합성 시나리오이며 자동 위험 판정을 하지 않습니다. 수신 중단 시 6초 후 지연 상태로 표시합니다.</Text>
    <TitleRow title="시뮬레이션 SOS 대기시간" accessory="10~60초" />
    <SosDelaySlider value={delay} onChange={setDelay} />
    <Text style={s.caption}>기존 SOS 시간 선택 컴포넌트를 재사용합니다. 이 화면의 테스트 설정은 실제 수동 SOS 설정과 분리되며, 이미 시작한 카운트다운에는 변경값을 소급 적용하지 않습니다.</Text>

  </Panel>;
}
