# 한국어 인코딩 진단과 검색 품질 평가

## 이번에 확인한 인코딩 원인

실제 data/semantic-live/state.json의 제목·본문·본문 SHA256과 result.json의 질문을 소스의 합성 원문과 비교했습니다. 모두 일치했습니다. 소스는 정상 UTF-8 BOM, 저장 JSON은 정상 UTF-8 BOM 없음이며 U+FFFD 대체문자도 없었습니다. 기존 데이터/벡터/실제 결과 파일은 읽기만 했고 수정하거나 재인덱싱하지 않았습니다.

이 PC는 Windows PowerShell 5.1, 기본 ANSI 인코딩 CP949, 기본 외부 파이프 입력 $OutputEncoding은 ASCII입니다. 다음 경로에서 손상을 재현했습니다.

1. Node는 UTF-8 JSON을 출력합니다.
2. 기존 ProcessStartInfo는 StandardOutputEncoding/StandardErrorEncoding을 지정하지 않았습니다.
3. PowerShell 콘솔이 CP949인 경우 그 바이트를 CP949로 디코딩하면서 질문·제목·본문이 깨집니다. 부모 프로세스가 ConvertFrom-Json을 한 뒤에는 이미 손상된 문자열입니다.
4. 반대로 한국어를 PowerShell의 기본 ASCII 파이프로 외부 프로그램에 보내면 '?'로 손실됩니다. 이 입력 경로도 별도로 재현했습니다. 기존 고정 합성 문서/질문은 Node 소스에서 직접 만들어져 이 파이프를 통과하지 않았습니다.

따라서 현재 증거상 실제 검색 자료의 UTF-8 저장 손상이 아니라 PowerShell 입출력 경계가 주원인입니다. 과거 실제 HTTP 요청 바이트를 기록한 것은 아니므로 그 기록까지 확인했다고 주장하지 않습니다. 현재 SDK 직렬화는 네트워크를 가로챈 자동 테스트에서 원문과 정확히 일치함을 확인했습니다.

수정: 공통 utf8-console.ps1에서 콘솔 Input/OutputEncoding과 $OutputEncoding을 UTF-8로 설정하고 두 secure 실행 도우미의 자식 stdout/stderr 디코딩도 명시했습니다. PowerShell 5.1의 비ASCII .ps1은 UTF-8 BOM으로 저장합니다. PowerShell 7은 기본 UTF-8이지만 동일하게 명시해 콘솔 설정에 의존하지 않게 했습니다. **이 PC에는 PowerShell 7이 없어 7 실환경 테스트는 건너뛰었습니다.**

## 원문 보호

- JSON 입력과 저장소는 fatal UTF-8 디코더를 사용합니다. UTF-8 BOM은 허용하며 CP949/UTF-16 등은 자동 추측 변환하지 않고 거부합니다.
- 등록·저장소 재읽기·인덱싱·SDK 임베딩 입력에서 대체문자, 잘못된 UTF-16 surrogate, 부적절한 제어문자와 알려진 mojibake 서명을 검사합니다.
- 이상은 TEXT_ENCODING_REVIEW_REQUIRED 또는 INVALID_UTF8_INPUT으로 거부합니다. 깨진 의료문장을 추측 복원하거나 정상 문서처럼 인덱싱하지 않습니다.
- 한글 제목·본문·질문·안내 문구, 원문 해시, SDK 요청 JSON과 surrogate 청킹 경계를 테스트합니다.
- 유효한 유니코드로만 구성된 모든 종류의 깨짐을 자동 탐지할 수는 없습니다. 원문 대조와 사람의 검수가 필요하며 오탐도 수동 검토해야 합니다.

## API 없이 확인하는 명령

```powershell
cd C:\MAS\Dr-mas\mobile\rag-server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-utf8.ps1 -Task diagnose
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-utf8.ps1 -Task quality
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-utf8.ps1 -Task check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-utf8.ps1 -Task test
```

어느 명령도 API 키나 Gemini 통신을 사용하지 않습니다. 실행 정책 옵션은 해당 프로세스만 대상으로 하며 학교 정책에 반해 사용하지 마세요. 이미 UTF-8로 설정된 터미널에서는 npm-local.cmd run quality:mock, run encoding:diagnose도 가능합니다.

JSON 파일을 확인할 때는 `Get-Content -Encoding UTF8`을 명시하세요. PowerShell 5.1의 기본 Get-Content는 BOM 없는 파일을 ANSI로 오독할 수 있고 기본 > / Out-File / Tee-Object는 UTF-16 파일을 만들 수 있습니다. 보고서는 Node의 `--write-report`로 UTF-8 저장할 수 있습니다. `$OutputEncoding`만 바꾸면 파일 저장 인코딩이나 .NET 자식 프로세스 디코딩까지 자동 해결되는 것은 아닙니다.

## 검색 평가 설계

12개 합성 문서와 8개 질문으로 구성했습니다. 수면·보행·약품 관련 문서, 주제는 비슷하지만 필요한 근거가 없는 통계/역사 문서, 무관한 천문/음악/관광 문서 및 근거가 전혀 없는 질문을 포함합니다. 정답 문서와 near-miss, 무관 문서의 구분은 examples/retrieval-quality.json에 있습니다.

보정용 4개 질문으로만 설정을 선택하고 별도 heldout 4개 질문에서 평가합니다. 두 집합 모두 답할 수 있는 질문 2개와 없는 질문 2개를 포함합니다. **벡터 점수는 직접 지정한 모의 스트레스 데이터**입니다. 실제 Gemini 벡터, 임상 데이터, 독립적 의료 검증이 아닙니다. 재순위기는 정답 ID를 참조하지 않고 질문별로 미리 작성한 개념/동의어 그룹의 본문 충족도를 계산합니다. 이것도 수동 규칙이므로 자유로운 실제 질문에 일반화된다고 주장할 수 없습니다.

비교 기준은 코사인 0.5 이상을 그대로 반환하는 방식입니다. 개선 시험은 코사인/키워드/개념 충족도 재순위, 최소 개념 충족도, 제외 후보와의 점수 차이, 출처 무결성을 함께 검사합니다. 모의 보정에서 선택된 값은 minVector=0.65, minFacetCoverage=1, minSeparation=0.04입니다. 이는 **실제 서비스에 배포한 보정값이 아닙니다.** 기존 검색 기본 임계값이나 실제 semantic 시험 임계값은 자동 변경하지 않았습니다.

| heldout 모의 지표 | 단순 임계값 | 개념 재순위·보류 |
|---|---:|---:|
| Precision@1 | 0 | 0.50 |
| Precision@3 | 0.25 | 0.25 |
| Recall@3 | 1.00 | 1.00 |
| MRR@3 | 0.2083 | 0.50 |
| 반환된 근거의 정밀도@3 | 0.3333 | 1.00 |
| 근거 없는 질문의 보류 재현율 | 0 | 1.00 |
| 근거 없는 질문의 오응답 후보 비율 | 1.00 | 0 |
| near-miss 반환 수 (K 제한 전) | 6 | 0 |

P@K는 전체 질문 평균이며 빈 슬롯도 비관련으로 계산합니다. 따라서 불필요한 문서를 제거해도 P@3은 그대로일 수 있습니다. Recall@K는 정답이 있는 질문에 대해서만 평균합니다. MRR@K는 근거 없는 질문을 0으로 포함한 전체 평균이며 answerableMrrAtK도 별도 제공합니다. 반환된 근거의 정밀도는 실제 반환된 항목 수를 분모로 사용합니다. K=1/3/5를 모두 기록합니다.

출처 일치율 1.00은 문서·Chunk 연결, 버전, 제목, 기관, 갱신일, 원문 URL, 본문/오프셋의 구조적 일치입니다. 의료적 주장에 대한 의미적 뒷받침을 보증하는 수치가 아닙니다. 다른 문서의 URL/Chunk를 섞으면 보류하는 테스트도 포함합니다.

## 답변 보류와 추가 검증

아직 실제 의료 근거로 보정되지 않은 벡터 전용 검색 결과는 후보로 볼 수 있지만 answer 경로에서 Gemini 생성 전에 insufficient_evidence로 보류합니다. 이때 reason은 uncalibrated_vector_only_evidence입니다. 키워드가 맞는 결과까지 의료적으로 검증됐다는 뜻은 아니며, 관련 문서의 주장·질문 범위를 실제로 뒷받침하는지 추가 검토해야 합니다.

실제 Gemini 점수 0.691/0.596과 목표 문서 1위라는 한 사례만으로 임계값·정확도를 결정할 수 없습니다. 다음 단계에는 합법적으로 확보한 실제 의료 문단, 다양한 동의어/질환/약품 질문, 답변 불가능·near-miss 사례와 전문가 relevance 라벨이 필요합니다. 보정/검증 집합과 문서/질문 중복 누출을 관리하고 실제 점수 분포, 보류율, 민감도·정밀도, 충돌/최신성, 문서 수 증가 성능을 평가해야 합니다. 이번 단계에서 추가 Gemini 호출은 하지 않았습니다.

결과: 테스트 45개 중 44개 통과, 1개 건너뜀(미설치 PowerShell 7), 실패 0. TypeScript PASS.

공식 근거: [Microsoft 문자 인코딩 문서](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-7.5).
