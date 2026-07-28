/**
 * 1. 학교 레이어 시드 — 담당자가 연 1회 세팅하는 값의 초기값.
 *
 * 학사일정은 2026학년도 1·2학기 표준 시드다.
 * 실제 학교 일정과는 다르므로 관리자 모드에서 교체하는 것을 전제로 한다.
 */

import type { AchievementTable, SchoolLayer, Sentence, Week } from '@/types'

const W = (
  no: number,
  start: string,
  end: string,
  class_days: number,
  opts: { events?: string[]; is_exam?: boolean } = {},
): Week => ({
  no,
  start,
  end,
  class_days,
  events: opts.events ?? [],
  is_exam: opts.is_exam ?? false,
})

/** 1-1. 학사일정 — 2026학년도 1학기 21주 */
export const WEEKS_2026_1: Week[] = [
  W(1, '2026-03-03', '2026-03-06', 4, { events: ['입학식·시업식', '삼일절 대체공휴일(3.2.)'] }),
  W(2, '2026-03-09', '2026-03-13', 5),
  W(3, '2026-03-16', '2026-03-20', 5),
  W(4, '2026-03-23', '2026-03-27', 5, { events: ['학부모 총회'] }),
  W(5, '2026-03-30', '2026-04-03', 5),
  W(6, '2026-04-06', '2026-04-10', 5),
  W(7, '2026-04-13', '2026-04-17', 5),
  W(8, '2026-04-20', '2026-04-24', 5, { events: ['1회 정기시험'], is_exam: true }),
  W(9, '2026-04-27', '2026-04-30', 4, { events: ['재량휴업일(5.1.)'] }),
  W(10, '2026-05-04', '2026-05-08', 4, { events: ['어린이날(5.5.)'] }),
  W(11, '2026-05-11', '2026-05-15', 5, { events: ['스승의날'] }),
  W(12, '2026-05-18', '2026-05-22', 5),
  W(13, '2026-05-25', '2026-05-29', 4, { events: ['부처님오신날 대체공휴일(5.25.)'] }),
  W(14, '2026-06-01', '2026-06-05', 4, { events: ['전국동시지방선거(6.3.)'] }),
  W(15, '2026-06-08', '2026-06-12', 5),
  W(16, '2026-06-15', '2026-06-19', 5),
  W(17, '2026-06-22', '2026-06-26', 5),
  W(18, '2026-06-29', '2026-07-03', 5, { events: ['2회 정기시험'], is_exam: true }),
  W(19, '2026-07-06', '2026-07-10', 5),
  W(20, '2026-07-13', '2026-07-17', 5),
  W(21, '2026-07-20', '2026-07-21', 2, { events: ['여름방학식'] }),
]

/**
 * 1-1. 학사일정 — 2026학년도 2학기 20주 (표준 시드)
 *
 * 8월 중순 개학, 10월 초 1회·12월 중순 2회 정기시험, 12월 말 겨울방학식.
 * 실제 학교 일정과 다르니 관리자 모드에서 바꿔 쓴다.
 */
export const WEEKS_2026_2: Week[] = [
  W(1, '2026-08-17', '2026-08-21', 5, { events: ['개학식'] }),
  W(2, '2026-08-24', '2026-08-28', 5),
  W(3, '2026-08-31', '2026-09-04', 5),
  W(4, '2026-09-07', '2026-09-11', 5),
  W(5, '2026-09-14', '2026-09-18', 5),
  W(6, '2026-09-21', '2026-09-25', 4, { events: ['추석 연휴'] }),
  W(7, '2026-09-28', '2026-10-02', 5),
  W(8, '2026-10-05', '2026-10-08', 4, { events: ['개천절 대체공휴일(10.5.)'] }),
  W(9, '2026-10-12', '2026-10-16', 5, { events: ['1회 정기시험'], is_exam: true }),
  W(10, '2026-10-19', '2026-10-23', 5),
  W(11, '2026-10-26', '2026-10-30', 5),
  W(12, '2026-11-02', '2026-11-06', 5),
  W(13, '2026-11-09', '2026-11-13', 5),
  W(14, '2026-11-16', '2026-11-20', 5, { events: ['수능(11.19.)'] }),
  W(15, '2026-11-23', '2026-11-27', 5),
  W(16, '2026-11-30', '2026-12-04', 5),
  W(17, '2026-12-07', '2026-12-11', 5),
  W(18, '2026-12-14', '2026-12-18', 5, { events: ['2회 정기시험'], is_exam: true }),
  W(19, '2026-12-21', '2026-12-24', 4, { events: ['성탄절(12.25.)'] }),
  W(20, '2026-12-28', '2026-12-31', 4, { events: ['겨울방학식'] }),
]

/** 1-3. 성취도 기준표 (5종) */
export const ACHIEVEMENT_TABLES: AchievementTable[] = [
  {
    id: 'common',
    target: '공통과목',
    grades: ['A', 'B', 'C', 'D', 'E'],
    has_note: true,
    note: '성취율 40% 미만은 E를 부여한다.',
  },
  {
    id: 'sci_lab',
    target: '과학탐구실험',
    grades: ['A', 'B', 'C'],
    has_note: true,
    note: '성취율 40% 미만은 C를 부여한다.',
  },
  { id: 'elective', target: '선택과목', grades: ['A', 'B', 'C', 'D', 'E'], has_note: false },
  { id: 'arts_pe', target: '음악·미술·체육', grades: ['A', 'B', 'C'], has_note: false },
  {
    id: 'pass_fail',
    target: '진로와 직업',
    grades: ['P', 'F'],
    has_note: true,
    note: '이수 기준에 도달하면 P, 도달하지 못하면 F를 부여한다.',
  },
]

/**
 * 1-4. 문장 은행 — Ⅲ · Ⅶ · Ⅷ · Ⅸ · Ⅹ 전체.
 *
 * order는 정렬 순서일 뿐 번호가 아니다. 가·나·다는 출력 시점에 붙는다.
 * 학교마다 지침 문구가 다르므로 담당자가 교체하는 것을 전제로 한다.
 */
export const SENTENCES: Sentence[] = [
  /* ── Ⅲ-1. 평가의 방향 ─────────────────────── */
  {
    id: '3-1-a',
    section: 'Ⅲ-1',
    order: 10,
    condition: 'always',
    text: '{과목명} 평가는 {지침명}에 따라 성취기준을 근거로 실시한다.',
  },
  {
    id: '3-1-b',
    section: 'Ⅲ-1',
    order: 20,
    condition: 'type != pass_fail',
    text: '학기말 성취도는 {성적산출}로 산출하며, 성취도 분할점수는 {분할점수방식}분할 방식으로 정한다.',
  },
  {
    id: '3-1-b-pf',
    section: 'Ⅲ-1',
    order: 25,
    condition: 'type == pass_fail',
    text: '이 과목은 이수 여부만 판정하며, 이수 기준에 도달하면 P, 도달하지 못하면 F로 처리한다.',
  },
  {
    id: '3-1-c',
    section: 'Ⅲ-1',
    order: 30,
    condition: 'always',
    text: '평가 결과는 학생의 성장을 돕는 자료로 활용하며, 필요한 경우 보충 지도를 실시한다.',
  },

  /* ── Ⅲ-2. 평가 결과 처리 ─────────────────── */
  {
    id: '3-2-a',
    section: 'Ⅲ-2',
    order: 10,
    condition: 'always',
    text: '평가 결과는 나이스에 입력하고 학업성적관리위원회의 심의를 거쳐 확정한다.',
  },
  {
    id: '3-2-b',
    section: 'Ⅲ-2',
    order: 20,
    condition: 'split_score_type == 추정',
    text: '성취도 분할점수는 과거 성적 분포를 반영한 추정 방식으로 산출하며, 학업성적관리위원회의 심의로 확정한다.',
  },
  {
    id: '3-2-b-fixed',
    section: 'Ⅲ-2',
    order: 20,
    condition: 'split_score_type == 고정',
    text: '성취도 분할점수는 90점·80점·70점·60점의 고정 분할 방식으로 산출한다.',
  },
  {
    id: '3-2-c',
    section: 'Ⅲ-2',
    order: 30,
    condition: 'exam_count > 0',
    text: '정기시험은 학기 중 정해진 주에 실시하며, 문항 수와 배점은 교과 협의를 거쳐 확정한다.',
  },
  {
    id: '3-2-c-alt',
    section: 'Ⅲ-2',
    order: 35,
    condition: 'exam_count == 0',
    text: '이 과목은 정기시험을 실시하지 않으며, 수행평가만으로 성취도를 산출한다.',
  },
  {
    id: '3-2-d',
    section: 'Ⅲ-2',
    order: 40,
    condition: 'always',
    text: '수행평가는 수업 중에 실시하며, 실시 2주 전에 평가 내용과 기준을 학생에게 안내한다.',
  },
  {
    id: '3-2-e',
    section: 'Ⅲ-2',
    order: 50,
    condition: 'credit > 1 && perf_ratio < 80',
    text: '지필평가와 수행평가의 반영 비율은 학기 중에 변경하지 않는다.',
  },
  {
    id: '3-2-f',
    section: 'Ⅲ-2',
    order: 60,
    condition: 'is_common',
    text: '최소 성취수준에 도달하지 못한 학생에게는 별도의 보충 과정을 운영한다.',
  },
  {
    id: '3-2-g',
    section: 'Ⅲ-2',
    order: 70,
    condition: 'has_rank',
    text: '동점자는 {동점자순서} 순으로 처리한다.',
  },

  /* ── Ⅶ. 성적 산출 ─────────────────────────── */
  {
    id: '7-a',
    section: 'Ⅶ',
    order: 10,
    condition: 'always',
    text: '학기말 원점수는 소수 첫째 자리에서 반올림하여 정수로 기록한다.',
  },
  {
    id: '7-b',
    section: 'Ⅶ',
    order: 20,
    condition: 'type != pass_fail',
    text: '과목 평균과 표준편차는 원점수를 기준으로 산출한다.',
  },

  /* ── Ⅷ. 결시자 처리 ───────────────────────── */
  {
    id: '8-a',
    section: 'Ⅷ',
    order: 10,
    condition: 'exam_count > 0',
    text: '정기시험 결시자는 학업성적관리규정이 정한 인정점을 부여한다.',
  },
  {
    id: '8-b',
    section: 'Ⅷ',
    order: 20,
    condition: 'always',
    text: '수행평가 미응시자는 사유를 확인한 뒤 인정점 또는 기본점수를 부여한다.',
  },
  {
    id: '8-c',
    section: 'Ⅷ',
    order: 30,
    condition: 'always',
    text: '장기 결석 등으로 평가에 참여하지 못한 학생은 별도로 협의하여 처리한다.',
  },

  /* ── Ⅸ. 이의신청 ──────────────────────────── */
  {
    id: '9-a',
    section: 'Ⅸ',
    order: 10,
    condition: 'always',
    text: '평가 결과 공개 후 3일 이내에 이의신청을 접수한다.',
  },
  {
    id: '9-b',
    section: 'Ⅸ',
    order: 20,
    condition: 'always',
    text: '이의신청은 교과 담당 교사가 확인하고, 필요한 경우 학업성적관리위원회에 회부한다.',
  },

  /* ── Ⅹ. 기타 ──────────────────────────────── */
  {
    id: '10-a',
    section: 'Ⅹ',
    order: 10,
    condition: 'always',
    text: '이 계획에 없는 사항은 {지침명}과 본교 학업성적관리규정을 따른다.',
  },
  {
    id: '10-b',
    section: 'Ⅹ',
    order: 20,
    condition: 'always',
    text: '부득이한 사유로 계획을 변경할 때에는 학업성적관리위원회의 심의를 거쳐 학생에게 안내한다.',
  },
]

export const SCHOOL_SEED: SchoolLayer = {
  calendars: [
    { year: 2026, semester: 1, weeks: WEEKS_2026_1 },
    { year: 2026, semester: 2, weeks: WEEKS_2026_2 },
  ],
  rules: {
    exam_ratio: 60,
    perf_ratio: 40,
    perf_area_max: 35,
    essay_min: 30,
    base_score_min: 20,
    base_score_max: 40,
    standards_per_perf_max: 6,
    perf_name_maxlen: 20,
    notice_lead_weeks: 2,
    guideline_name: '2026학년도 학업성적관리 시행 지침',
    classes_by_grade: { 1: 8, 2: 8, 3: 7 },
    month_week_rule: 'start',
  },
  achievement_tables: ACHIEVEMENT_TABLES,
  sentences: SENTENCES,
}
