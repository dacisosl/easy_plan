# easy_plan — 교수학습 및 평가 운영계획서 생성기

고등학교 교사가 **교수학습 및 평가 운영계획서**를 만들고 완성된 한글 문서(.hwpx)를
내려받는 웹앱. 값을 한 번만 입력받아 문서 전체를 렌더링한다.

**간단 작성이 기본 경로다.** 홈에서 과목·학년·지도교사·정기시험 앵커·수행평가(명칭/시기/의도)만
채우면 나머지는 계산하고, 문장은 AI가 초안을 쓴다. "심화로 작성"을 누르면 상단에 5단계
(과목 설정 → 단원 매핑 → 진도 설계 → 수행평가 → 내려받기)가 열린다.

## 검토 방식 — 색이 곧 상태

앱 안의 체크리스트 대신 **문서 자체가 검토 장치**다.

| 색 | 뜻 | 교사가 할 일 |
|---|---|---|
| **검정** | 코드가 계산한 값 (비율·배점·성취기준·진도) | 로직 15규칙으로 이미 검증됨 |
| **빨강** | AI 초안 (Ⅰ·Ⅱ·Ⅸ·Ⅹ·주차별 주안점·수행 활동·루브릭 서술) | 한글에서 읽고 검정으로 바꾸며 검토 |
| **배경색** | 직접 채우는 칸 (예정시간·실시누계) | 한글에서 입력 |

## 설계 원칙

1. **값만 저장한다.** 완성된 문장을 저장하지 않는다 (AI 초안은 재현 불가라 예외로 저장)
2. **같은 값은 한 곳에만.** 나머지는 전부 참조
3. **문단에 번호를 넣지 않는다.** 가·나·다는 출력 시점에 부여
4. **파생값은 저장하지 않는다.** 필요할 때 계산 → [`src/lib/derive.ts`](src/lib/derive.ts)
5. **AI는 문장만 쓴다. 숫자는 코드가 정한다** → [`src/lib/autofill.ts`](src/lib/autofill.ts) `buildPerformance`

## 시작하기

```bash
npm install
```

```bash
cp .env.example .env && npx prisma generate
```

```bash
npm run dev
```

`.env`의 `OPENROUTER_API_KEY`를 채우면 AI 문안이 실제 모델로 생성된다.
**키가 없어도 동작한다** — 결정적 대체 문구(fallback)로 완결되고, 문서에 표시된다.

> `next dev`가 돌고 있는 동안 `npm run build`를 실행하지 말 것. 같은 `.next`를 써서
> 청크가 섞인다. 이미 났으면 dev를 멈추고 `.next`를 지운 뒤 다시 띄우면 된다.

## 데이터 모델 — 세 레이어

| 레이어 | 주기 | 내용 |
|---|---|---|
| 학교 | 담당자 연 1회 | 학사일정 21주 · 규칙 · 성취도 기준표 5종 · 문장 은행 → [`src/data/school.ts`](src/data/school.ts) |
| 과목 | 최초 1회, 공유 | 영역 · 성취기준 · 성취수준 · 단원 매핑 |
| 학기 | 교사가 매 학기 | 지도교사 · 앵커 · 수행평가 · 진도 배분 · **AI 초안** |

타입 정의가 진짜 스펙 → [`src/types/index.ts`](src/types/index.ts).

## 과목 — 239개 전체

`/api/subjects`가 `data/고등학교_성취기준_2022.xlsx`(3,261행)에서 목록을,
`/api/subjects/[name]`이 과목 하나를 준다. **소단원 목록이 없는 과목은 영역(대단원)을
단원처럼 자동 생성**(`unitsFromAreas`)해 앵커·진도 배분·수행평가가 그대로 돈다.
심화의 단원 매핑에서 소단원으로 세분할 수 있다.

파일에서 확인한 파싱 전제: 열 이름은 `수준1(A/상)`처럼 괄호가 붙는다(접두 매칭) ·
`LVL_4`는 5칸이 다 차 있어 A~E로 취급 · `3단계(상~하)` 과목은 Ⅺ 표에서 D·E 행을 비운다 ·
여는 대괄호가 빠진 5행을 파서가 받아 준다.

## AI 파이프라인

`/api/generate`가 스테이지 셋을 처리한다 — `sections`(Ⅰ·Ⅱ·Ⅸ·Ⅹ) · `weekly`(주차별 주안점) ·
`perfs`(수행 활동 + 루브릭 서술 + 자체 점검). 키는 서버에만 있다.

- 루브릭은 **코드가 정한 요소·배점 뼈대**에 AI가 문장만 채운다. 행 단위로 실패를 메운다
- 결과(`AiDraft`)는 plan에 저장되고 `input_hash`가 같으면 재호출하지 않는다. "다시 생성"은 강제
- 자체 점검(`aiReview`)이 warnings로 나온다 — 표시만, 차단하지 않음

## hwpx 생성

```bash
npm run template      # templates/reference.hwpx → templates/plan_blank.hwpx
npm run render:test   # 가짜 AI 초안 포함 렌더 → out/test-render.hwpx (--no-ai로 제외)
npm run verify:hwpx out/test-render.hwpx
```

[`src/lib/hwpx/doc.ts`](src/lib/hwpx/doc.ts)는 파이썬 참조 구현의 여섯 가지 규칙
(mimetype 무압축 선행 · 문단 단위 치환 · 빈 셀 `<hp:t>` 생성 · 문단 깊은 복사 ·
rowAddr/rowCnt 갱신 · linesegarray 제거)에 더해:

- **header.xml도 파싱한다** — 빨간 charPr(기존 것 복제 + textColor, 크기별 캐시)과
  배경 borderFill(복제 + fillBrush, 테두리×색 캐시)을 추가하고 itemCnt를 갱신한다
- **서식 상속** — 빈 셀에 run을 만들 때 `'0'` 대신 이웃 run의 charPr을 상속한다 (글씨체 통일)
- Ⅴ 부기 문단(E·C·P 부여, 진로와직업 안내, 분할점수)은 과목 유형에 맞는 것만 남긴다.
  원본 따옴표가 둥근따옴표(’E’)라 종류를 가리지 않고 매칭한다

> **한글에서 직접 열어 확인할 것.** 표 테두리·셀 높이·빨강·배경색이 진짜 기준이다.

## 검증

- **로직 15규칙** → [`src/lib/validate.ts`](src/lib/validate.ts). 걸리면 내려받기를 막는다.
  간단 작성 결과는 처음부터 통과한다 (`scripts/test-simple-flow.ts`가 회귀)
- **AI 자체 점검** — 생성 파이프라인 안에서 돌고 결과만 표시
- **인간 검토** — 문서의 빨간 글씨·배경색으로 대체 (위 표)

```bash
npm run typecheck && npm test
npx tsx scripts/test-simple-flow.ts      # 단원 매핑 없는 과목의 간단 경로
npx tsx scripts/test-export-api.ts       # dev 서버 필요 · generate→export 왕복
```

## 확인이 필요한 값

| 항목 | 지금 구현 | 메모 |
|---|---|---|
| 월 기준 주차 | 시작일이 속한 달 기준 (기본) / 1일 낀 주=1주 (선택) | 같은 주라도 라벨이 한 주 밀린다 · 담당자 확인 |
| 기본점수 | 만점의 30% (규칙 4의 20~40% 안) | |
| 루브릭 배점 합 | 영역 만점과 일치 (규칙 7 문구 그대로) | 기본점수 차감 여부 확인 필요 |
| 2학기 | 미구현 | 주차 수·양식 차이 미확정 |

## 폴더

```
src/
  app/            page(단일 라우트) · /api/generate · /api/export · /api/subjects
  screens/        Home(간단 입력) · Setup · Units · Schedule · Performances
                  · Review(로직 오류만) · Generating(파이프라인) · Download
  components/     AppHeader · SubjectPicker(콤보박스) · ui
  lib/
    derive.ts     파생값 · validate.ts 로직 15규칙+자체 점검
    autofill.ts   buildPerformance — 숫자는 전부 여기서
    aiDraft.ts    프롬프트 · fallback · 입력 지문 (서버 전용)
    generateClient.ts  스테이지 순차 호출 → AiDraft 조립
    hwpx/         doc.ts(조작+서식) · render.ts(값→문서)
    importStandards.ts · subjectsSource.ts(xlsx 서버 캐시)
scripts/          template · verify · render:test · seed:subject · test-simple-flow · test-export-api
templates/        reference.hwpx(완성 예시) · plan_blank.hwpx(생성물)
```

## 디자인

흰 바탕 · 청남 `#17547A` · 옅은 테두리 · 카드 상자 최소화(여백과 가는 구분선로 구획) ·
그림자 없음. 토큰은 [`src/app/globals.css`](src/app/globals.css)의 `@theme`.
진행 표시는 막대 대신 단계 이름(완료 체크·현재 밑줄).
