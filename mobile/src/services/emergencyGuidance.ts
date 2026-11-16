// Public text only. Reviewed for source/KOGL permission on 2026-11-14.
// Clinical expert review is still required and has NOT been completed.
// No API, TOKEN, patient record, external AI, probability or diagnosis is used.
const licenseUrl = 'https://www.kogl.or.kr/info/licenseType1.do';
export const emergencySources = {
  signs: {
    publisher: '건강보험심사평가원', author: '평가실 평가4부', publishedAt: '2020-06-24',
    title: '골든타임이 가장 중요한 ‘급성기뇌졸중’ 우리 지역 우수 병원은?',
    url: 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=10083&brdScnBltNo=4&pageIndex=1&pgmid=HIRAA020041000100',
    excerpt: '뇌졸중 의심증상: 갑작스런 얼굴 마비, 팔 마비, 언어장애, 시각장애, 심한 두통, 어지럼증 등',
    license: '공공누리 제1유형 · 출처표시', licenseUrl,
  },
  urgency: {
    publisher: '건강보험심사평가원', author: '평가운영실 심뇌질환평가부', publishedAt: '2026-07-30',
    title: '심평원, 출혈성 뇌졸중 치료 평가범위 확대 및 평가 결과 첫 공개',
    url: 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=11867&brdScnBltNo=4&pgmid=HIRAA020041000100',
    excerpt: '치료가 지연될 경우 사망이나 심각한 장애를 초래할 수 있어',
    license: '공공누리 제1유형 · 출처표시', licenseUrl,
  },
  call: {
    publisher: '대한민국 정책브리핑', author: '정책기자단 원규희', publishedAt: '2018-05-13',
    title: '잘 신고하고 길 터주면, 우리도 119 대원',
    url: 'https://www.korea.kr/briefing/policyBriefingView.do?newsId=148849782',
    excerpt: '언제 응급 상황이 발생했는지 시간을 꼭 알려주세요.',
    license: '텍스트에 한하여 공공누리 제1유형 · 사진 등 제외', licenseUrl,
  },
} as const;

export function neurologicalWarning(text: string): boolean {
  return /말(?:이)?\s*(?:어눌|안\s*나)|언어\s*장애|(?:팔다리|한쪽|팔|다리).{0,12}(?:힘이?\s*(?:없|빠)|마비)|시야\s*이상|시각\s*장애|앞이\s*안\s*보/u.test(text);
}

export function emergencyGuidance(reported: string, context = '') {
  const stroke = neurologicalWarning(reported)
    || /머리|두통/u.test(context || reported) && /갑자기.{0,20}(?:심|극심)/u.test(reported);
  const kind = stroke ? 'neurological' : /가슴/u.test(reported) ? 'chest'
    : /숨|호흡|의식/u.test(reported) ? 'breathing-consciousness' : 'unspecified';
  const explanation = stroke
    ? '새롭게 발생한 이런 증상은 뇌졸중 등 응급질환의 신호일 수 있어요. 뇌졸중으로 확정한 것은 아니에요. 치료가 늦어지면 사망이나 심각한 장애로 이어질 수 있어 신속한 평가와 이송이 중요해요.'
    : kind === 'chest'
      ? '가슴의 통증이나 불편함을 위험 신호로 확인했어요. 이 문진만으로 원인 질환을 특정할 수 없어요. 119에 현재 증상을 설명하고 즉시 도움을 요청하세요.'
      : kind === 'breathing-consciousness'
        ? '호흡이나 의식과 관련된 위험 신호를 확인했어요. 이 문진만으로 원인 질환을 특정할 수 없어요. 119에 숨을 쉬는지와 의식이 있는지를 우선 알려주세요.'
        : '위험 신호가 있거나 판단하기 어렵다고 답하셨어요. 어떤 응급질환인지는 이 문진으로 정할 수 없어요. 119에 지금 상태를 설명하고 도움을 받으세요.';
  const sources = stroke ? [emergencySources.signs, emergencySources.urgency, emergencySources.call] : [emergencySources.call];
  return {
    kind, clinicalReview: 'required_not_completed' as const, sources,
    message: [
      '지금 119에 신고하세요. 안내를 다 읽거나 추가 문진·검색을 기다리느라 신고를 미루지 마세요.',
      `말씀하거나 선택한 위험 신호: ${reported}`,
      '여러 증상이 묶인 항목을 골랐다면 그중 어떤 증상인지는 아직 확인하지 않았어요. 모두 발생했다고 판단하지 않아요.',
      explanation,
      '지금 할 일\n1. 119에 현재 위치를 알려주세요. 주소를 모르면 주변 건물이나 표지 정보를 말해 주세요.\n2. 증상이 시작된 시각, 실제 나타난 증상, 호흡과 의식 상태를 알려주세요.\n3. 전화를 바로 끊지 말고 상황요원의 안내를 따르세요.'
        + (stroke ? '\n4. 직접 이동할 병원을 검색하며 시간을 보내지 말고 119 구급차 이송을 요청하세요.' : ''),
      '공식 공개자료를 바탕으로 구성한 안내예요. 진단이나 처방을 대신하지 않아요.',
    ].join('\n\n'),
  };
}
// Fixed, source-bound followups; never clear emergency mode based on a reply.
export function emergencyFollowup(question: string, reported: string, context: string) {
  const guide = emergencyGuidance(reported, context);
  const reminder = '이 채팅을 기다리느라 119 신고나 진료를 미루지 마세요. 응급상황이 해소됐다고 판단할 수 없어요.';
  const answer = /왜|위험|이유/u.test(question) ? guide.message
    : /사라|괜찮|나아|멎|없어/u.test(question)
      ? '증상이 사라졌다는 말만으로 안전하거나 응급상황이 해소됐다고 판단할 수 없어요. 119에 앞서 나타난 증상, 시작 시각과 현재 상태를 함께 설명하고 안내를 받으세요.'
      : /혼자|사람이 없|주변에/u.test(question)
        ? '119에 현재 위치와 증상을 먼저 알려주세요. 혼자 있다는 상황도 설명하고, 전화를 끊지 말고 상황요원의 안내를 따르세요. 이 채팅은 구급대 출동을 요청하거나 위치를 자동 전달하지 않아요.'
        : /전달|말|신고|기다|도착|구급차/u.test(question)
          ? '119에 현재 위치(주소 또는 주변 표지), 증상이 시작된 시각, 실제 증상, 호흡과 의식 상태를 알려주세요. 구급차를 기다리는 중에도 상황요원의 안내를 따르세요. 새로운 변화가 있으면 알려주세요. 이 채팅으로 개별 응급처치나 안전한 대기 여부를 판단할 수 없어요.'
          : '현재는 응급 안내를 이어가는 상태예요. 일반 질환 검색이나 문진은 재개하지 않아요. 확인된 자료를 넘어 원인·처치법을 추측하지 않고, 119에 현재 상태를 설명하고 안내를 받도록 도와드릴게요.';
  return { ...guide, message: `${reminder}\n\n${answer}` };
}
