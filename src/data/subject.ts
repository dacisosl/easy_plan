/**
 * 2. 과목 레이어 시드 — 화면 확인용.
 *
 * 영역 · 성취기준 · 성취수준은 `고등학교_성취기준_2022.xlsx`에서 그대로 구웠다.
 *   npm run seed:subject            → src/data/subject.seed.json
 *
 * 단원 매핑 · 과목 목표 · 교수학습 운영계획은 원본 파일에 없는 값이라
 * 여기 예시로 넣어 두었다. 교사가 실제 소단원명을 붙여넣으면 교체된다.
 */

import type { Area, ScaleType, SemesterPlan, Standard, Subject, Unit } from '@/types'
import { distributeStandards } from '@/lib/derive'
import { WEEKS_2026_1 } from './school'
import seed from './subject.seed.json'

const IMPORTED = seed as {
  name: string
  code_prefix: string
  scale_type: ScaleType
  areas: Area[]
  standards: Standard[]
}

const U = (order: number, name: string, area_no: string, codes: string[]): Unit => ({
  id: `u${String(order).padStart(2, '0')}`,
  order,
  name,
  area_no,
  standard_codes: codes,
})

/**
 * 18개 단원. 디자인 시안과 같은 상태로 둔다 —
 * 03 영역 두 단원은 매칭 실패, 성취기준 [12현윤03-02] · [12현윤03-03]이 미배정이다.
 * 검토 화면에서 규칙 10이 걸리는 걸 바로 볼 수 있다.
 */
const UNITS: Unit[] = [
  U(1, '01. 현대인의 삶과 실천윤리', '01', ['[12현윤01-01]']),
  U(2, '02. 현대 윤리 문제에 대한 접근', '01', ['[12현윤01-02]']),
  U(3, '01. 삶과 죽음의 윤리', '02', ['[12현윤02-01]']),
  U(4, '02. 생명과학과 윤리', '02', ['[12현윤02-02]']),
  U(5, '03. 자연과 인간의 관계', '02', ['[12현윤02-03]']), // 1회 정기시험 앵커
  U(6, '01. 과학기술과 윤리', '03', []), // 매칭 실패
  U(7, '02. 정보사회와 윤리', '03', []), // 매칭 실패
  U(8, '03. 디지털 학습 환경과 윤리', '03', ['[12현윤03-01]']),
  U(9, '01. 직업 생활과 윤리', '04', ['[12현윤04-01]']),
  U(10, '02. 사회 정의와 윤리', '04', ['[12현윤04-02]']),
  U(11, '03. 국가와 시민의 윤리', '04', ['[12현윤04-03]']),
  U(12, '01. 예술과 대중문화 윤리', '05', ['[12현윤05-01]']),
  U(13, '02. 의식주와 소비의 윤리', '05', ['[12현윤05-02]']),
  U(14, '03. 다문화 사회의 윤리', '05', ['[12현윤05-03]']),
  U(15, '01. 갈등 해결과 소통의 윤리', '06', ['[12현윤06-01]']), // 2회 정기시험 앵커
  U(16, '02. 통일 문제와 윤리', '06', ['[12현윤06-02]']),
  U(17, '03. 지구촌 평화의 윤리', '06', ['[12현윤06-03]']),
  U(18, '04. 학기 마무리와 종합 탐구', '06', []),
]

export const SUBJECT_SEED: Subject = {
  id: 'subj-hyeonyun',
  name: IMPORTED.name,
  code_prefix: IMPORTED.code_prefix,
  type: 'elective',
  is_common: false,
  objectives: [
    '현대 사회의 다양한 윤리 문제를 성취기준에 근거하여 탐구하고, 자신의 관점을 근거와 함께 표현하는 능력을 평가한다.',
    '학생이 성취기준에 도달한 정도를 확인하고, 학습 개선을 위한 구체적인 피드백을 제공한다.',
    '교육 내용과 학습 활동의 적절성을 확인하여 교수·학습 방법을 개선한다.',
  ].join('\n'),
  scale_type: IMPORTED.scale_type,
  teaching_plan: [
    '매 단원을 쟁점 중심으로 구성하여 자료 탐구 · 토의 · 글쓰기 순으로 진행한다.',
    '지도교사 2인이 동일한 진도와 평가 기준을 적용하며, 격주 교과 협의로 진도를 맞춘다.',
  ].join('\n'),
  areas: IMPORTED.areas,
  standards: IMPORTED.standards,
  units: UNITS,
  semester_levels: {
    A: '현대 사회의 윤리 문제를 여러 관점에서 분석하고 근거를 들어 자신의 견해를 제시할 수 있다.',
    B: '현대 사회의 윤리 문제를 분석하고 자신의 견해를 제시할 수 있다.',
    C: '현대 사회의 윤리 문제를 이해하고 관련 개념을 설명할 수 있다.',
    D: '현대 사회의 윤리 문제와 관련된 개념을 부분적으로 설명할 수 있다.',
    E: '현대 사회의 윤리 문제와 관련된 개념을 안내에 따라 확인할 수 있다.',
  },
  min_level: null,
}

/* ══════════════════════════════════════════════════════════
   3. 학기 레이어 시드
   ══════════════════════════════════════════════════════════ */

export const PLAN_SEED: SemesterPlan = {
  id: 'plan-hyeonyun-2026-1',
  subject_id: SUBJECT_SEED.id,
  grade: 2,
  credit: 3,
  semester: 1,
  teachers: ['김서연', '박준호'],
  split_score_type: '추정',
  exam_count: 2,
  exam_ratio: 60,
  perf_ratio: 40,
  exams: [
    {
      no: 1,
      week: 8,
      anchor_code: '[12현윤02-03]', // 03. 자연과 인간의 관계 마지막 기준
      parts: [
        { kind: '선택형', count: 20, points: 70 },
        { kind: '서술형', count: 5, points: 30 },
      ],
    },
    {
      no: 2,
      week: 18,
      anchor_code: '[12현윤06-01]', // 01. 갈등 해결과 소통의 윤리
      parts: [
        { kind: '선택형', count: 20, points: 70 },
        { kind: '서술형', count: 5, points: 30 },
      ],
    },
  ],
  performances: [
    {
      id: 'perf-1',
      name: '사회 불평등 실태 조사와 대안 제시',
      method: '논술형',
      ratio: 20,
      max_score: 20,
      base_score: 5,
      week: 12,
      standard_codes: ['[12현윤04-02]', '[12현윤05-02]'],
      method_checks: ['서술·논술', '프로젝트'],
      activity:
        '통계 자료에서 불평등 실태를 읽어 내고, 원인을 분석한 뒤 정책 대안을 근거와 함께 서술한다.',
      rubric: [
        {
          id: 'r1',
          area: '탐구',
          element: '자료 해석하기',
          levels: [
            { score: 6, text: '자료의 핵심 내용을 정확히 해석하고 근거를 들어 설명함' },
            { score: 4, text: '자료의 내용을 해석하였으나 근거 제시가 부분적임' },
            { score: 2, text: '자료의 내용을 단순히 옮겨 적는 수준에 머무름' },
          ],
        },
        {
          id: 'r2',
          area: '적용',
          element: '대안 제시하기',
          levels: [
            { score: 6, text: '분석한 원인에 맞는 대안을 구체적으로 제시함' },
            { score: 4, text: '대안을 제시하였으나 원인과의 연결이 느슨함' },
            { score: 2, text: '대안이 일반적인 서술에 머무름' },
          ],
        },
        {
          id: 'r3',
          area: '표현',
          element: '근거 들어 쓰기',
          levels: [
            { score: 4, text: '주장마다 자료에서 찾은 근거를 붙여 씀' },
            { score: 3, text: '일부 주장에만 근거를 붙여 씀' },
            { score: 2, text: '근거 없이 주장만 나열함' },
          ],
        },
        {
          id: 'r4',
          area: '표현',
          element: '문장의 명확성',
          levels: [
            { score: 4, text: '문단 구분과 문장 연결이 분명하여 읽는 사람이 이해하기 쉬움' },
            { score: 3, text: '문장은 이해되나 문단 구분이 흐림' },
            { score: 2, text: '문장 연결이 끊겨 내용 파악이 어려움' },
          ],
        },
      ],
    },
    {
      id: 'perf-2',
      name: '생명윤리 쟁점 토론',
      method: '구술·발표',
      ratio: 10,
      max_score: 10,
      base_score: 12, // 만점 초과 — 검토 화면에서 규칙 4가 걸린다
      week: 16,
      standard_codes: ['[12현윤02-01]', '[12현윤02-02]'],
      method_checks: ['구술·발표', '토의·토론'],
      activity:
        '안락사와 유전자 편집 쟁점에서 서로 다른 입장을 듣고, 자기 주장을 근거와 함께 말한다.',
      rubric: [], // 루브릭 없음 — 규칙 7이 걸린다
    },
  ],
  // 진도 배분은 파생값이지만 교사가 손댄 결과를 남겨야 하므로 학기 레이어에 저장한다.
  // 시드는 앵커 기준으로 미리 배분해 둔다 — 비어 있으면 규칙 10·13이 전부 걸린다.
  distribution: distributeStandards({ units: UNITS }, WEEKS_2026_1, [
    { week: 8, anchor_code: '[12현윤02-03]' },
    { week: 18, anchor_code: '[12현윤06-01]' },
  ]),
  updated_at: '2026-07-25T09:00:00.000Z',
}
