import type { DocumentInput } from './model.js';
// Public text excerpts, not KDCA API data. Page-level KOGL type 1 verified
// 2026-11-14. Images/statistics/drug instructions are not imported. Publication
// age and limited coverage are disclosed; clinical review is NOT completed.
const reviewedAt='2026-11-14T00:00:00.000Z';
const materials=[{
 id:'hira-public-9061',topic:'복통',date:'2015-12-15',
 title:'기온이 낮아지면 늘어나는 ‘장염’, 겨울철에도 개인위생 점검해야',
 url:'https://www.hira.or.kr/bbsDummy.do?brdBltNo=9061&brdScnBltNo=4&pgmid=HIRAA020041000100',
 content:'관련 질환: ‘장 감염’ 은 세균성 장 감염과 바이러스성 장 감염으로 크게 구분할 수 있으며, 복통, 설사, 발열, 구토 등의 증상이 나타나게 된다.\n생활 관리: ‘장 감염’의 예방법은 손 씻기 등의 기본적인 개인위생관리를 통해 감염을 막는 것이 가장 중요하다.',
},{
 id:'hira-public-8946',topic:'기침',date:'2015-04-29',
 title:'천식 진료인원 187만명(2014년), 5년 전에 비해 19.8% 줄어',
 url:'https://www.hira.or.kr/bbsDummy.do?brdBltNo=8946&brdScnBltNo=4&pgmid=HIRAA020041000100',
 content:'관련 질환: ‘천식’은 기관지의 염증 반응으로 인해 생기는 질환으로 기관지가 좁아져서 호흡곤란, 천명음(쌕쌕거리는 숨소리), 심한 기침 증세가 발생한다.\n설명: 악화인자로는 기후변화, 대기오염, 담배연기, 감기 등이 있다.',
}];
export function publicHealthMaterials():DocumentInput[]{
 return materials.map(item=>({id:item.id,title:`${item.topic} 관련 공개자료 발췌 · ${item.title}`,publisher:'건강보험심사평가원',sourceUrl:item.url,
  publishedAt:item.date,updatedAt:null,collectedAt:reviewedAt,category:'disease',content:item.content,
  attribution:{datasetName:item.title,datasetUrl:item.url,itemCode:item.id,termsLabel:'공공누리 제1유형(출처표시). 텍스트 일부 발췌·분류 제목 추가. 임상 검토 미완료. 발행일 '+item.date,termsUrl:item.url},
  rights:{permission:'pending',terms:'원문 페이지의 공공누리 제1유형에 따라 텍스트 저장·검색·인용. 분류 제목만 추가. https://www.kogl.or.kr/info/licenseType1.do ; 외부 AI 전송 불허; 임상 검토 미완료',checkedAt:reviewedAt},
 }));
}
