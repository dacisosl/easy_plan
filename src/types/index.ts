/**
 * 필드 정의서(2026-07-26) 그대로 옮긴 타입.
 *
 * 저장 원칙
 *  1. 값만 저장한다. 완성된 문장을 저장하지 않는다.
 *  2. 같은 값은 한 곳에만. 나머지는 전부 참조.
 *  3. 문단에 번호를 넣지 않는다. 가·나·다는 출력 시점에 부여.
 *  4. 파생값은 저장하지 않는다. 필요할 때 계산.  → lib/derive.ts
 */

/** ISO 날짜 문자열 `YYYY-MM-DD`. Date 객체를 저장하지 않는다(직렬화 안정성). */
export type ISODate = string

/* ══════════════════════════════════════════════════════════
   1. 학교 레이어 — 담당자가 연 1회 세팅. 전 교사 공유.
   ══════════════════════════════════════════════════════════ */

/** 1-1. 학사일정 — 주차 하나. label·month_week는 파생값이라 없다. */
export interface Week {
  /** 학기 주차 번호 (1부터) */
  no: number
  start: ISODate
  end: ISODate
  /** 진도표 '행사' 열 */
  events: string[]
  /** 실제 수업 가능 일수 */
  class_days: number
  /** 정기시험 주 여부 */
  is_exam: boolean
}

/** 1-1. 학사일정 */
export interface AcademicCalendar {
  year: number
  semester: 1 | 2
  /** 1학기 기준 21주 */
  weeks: Week[]
}

/** 1-2. 학교 규칙 */
export interface SchoolRules {
  /** Ⅲ-2-라, Ⅳ 헤더 */
  exam_ratio: number
  perf_ratio: number
  /** 수행평가 한 영역 상한 (%) */
  perf_area_max: number
  /** 정기시험을 2회 실시하는 과목의 완화된 영역 상한 (%) — 학교 점검표 "지필 2회 과목은 40% 가능" */
  perf_area_max_relaxed: number
  /** 서술·논술 하한 (%) */
  essay_min: number
  /** 기본점수 범위 (영역 만점 대비 %) */
  base_score_min: number
  base_score_max: number
  /** 나이스 입력 한도 */
  standards_per_perf_max: number
  /** 수행평가명 길이 */
  perf_name_maxlen: number
  /** 안내 주 역산 */
  notice_lead_weeks: number
  /** 시행 지침 명칭·연월 */
  guideline_name: string
  /** 학년별 반 수 */
  classes_by_grade: Record<number, number>
  /**
   * 월 기준 주차 표기 방식.
   *  'thursday'     : 목요일이 속한 달로 귀속 (학교 점검표 확정 규칙 — 기본값)
   *  'start'        : 시작일이 속한 달에서 몇 번째로 시작하는 주인지
   *  'form_example' : 그 달 1일이 낀 주를 1주로 두고 세기 (배포된 양식 예시)
   * 방식에 따라 같은 주라도 라벨이 한 주씩 밀린다. (6/29~7/3 → 목요일 기준 7월 1주, 시작일 기준 6월 5주)
   */
  month_week_rule: 'start' | 'form_example' | 'thursday'
}

/** 1-3. 성취도 기준표 (5종) */
export type AchievementTableId = 'common' | 'sci_lab' | 'elective' | 'arts_pe' | 'pass_fail'

export interface AchievementTable {
  id: AchievementTableId
  /** 적용 대상 */
  target: string
  /** 등급 표기 */
  grades: string[]
  /** 부기 문구 유무 */
  has_note: boolean
  /** 부기 문구 본문 (has_note === false 이면 없음) */
  note?: string
}

/** 1-4. 문장 은행 — Ⅲ · Ⅶ · Ⅷ · Ⅸ · Ⅹ 전체 */
export type SentenceSection = 'Ⅲ-1' | 'Ⅲ-2' | 'Ⅶ' | 'Ⅷ' | 'Ⅸ' | 'Ⅹ'

/** 조건식. 양식에 명시된 것 전부. `always`면 조건 없이 항상 출력. */
export type SentenceCondition =
  | 'always'
  /** exam_count == 0 → Ⅲ-2-다 대체 */
  | 'exam_count == 0'
  /** exam_count > 0 → Ⅷ 결시표에서 '수행평가 100%' 분기 제거 */
  | 'exam_count > 0'
  /** credit == 1 또는 perf_ratio >= 80 → Ⅲ-2-마 제거 */
  | 'credit > 1 && perf_ratio < 80'
  /** 등급 미산출 과목 → Ⅲ-2-사(동점자) 제거 */
  | 'has_rank'
  /** subject.type == pass_fail → Ⅲ-1-나 제거, P/F 문구 추가 */
  | 'type != pass_fail'
  | 'type == pass_fail'
  /** 분할점수 방식에 따라 Ⅲ-2-나 문장이 갈린다 */
  | 'split_score_type == 추정'
  | 'split_score_type == 고정'
  /** subject.is_common == false → Ⅺ 최소성취수준 셀 제거 */
  | 'is_common'

export interface Sentence {
  id: string
  section: SentenceSection
  /** 정렬 순서 — 번호가 아니다. 가·나·다는 출력 시점에 부여. */
  order: number
  /** 본문. `{과목명}` `{학년}` `{수행평가명1}` 슬롯 포함 */
  text: string
  /** 표시 조건식 */
  condition: SentenceCondition
}

/**
 * 홈의 입력 구획 — 검증 오류가 '고치기'로 데려갈 자리.
 * 화면이 한 장이라 화면 이름이 아니라 구획 이름이다.
 */
export type FocusTarget = 'basic' | 'exam' | 'anchor' | 'perf' | 'essay'

/** 1. 학교 레이어 전체 */
export interface SchoolLayer {
  /** 학기별 학사일정 — [1학기, 2학기]. 관리자 모드에서 편집한다. */
  calendars: AcademicCalendar[]
  rules: SchoolRules
  achievement_tables: AchievementTable[]
  sentences: Sentence[]
  /**
   * 주당 이수시간(학점)별 예정시간 배포표 — credit → 주차별 예정시간.
   * 학교가 배포한 표를 관리자 모드에서 넣는다. 없으면 수업일수로 계산한다.
   */
  hourly_tables?: Record<number, number[]>
}

/* ══════════════════════════════════════════════════════════
   2. 과목 레이어 — 과목당 최초 1회. 이후 재사용 · 교사 간 공유.
   ══════════════════════════════════════════════════════════ */

export type SubjectType = AchievementTableId
/** Ⅴ 표 자동 판정 근거 */
export type ScaleType = 'LVL_5' | 'LVL_3'

/** 2-1. 영역 — 출처: 고등학교_성취기준_2022.xlsx → 전체_성취기준 → 영역(단원) 열 */
export interface Area {
  /** '01' 같은 두 자리 문자열 */
  no: string
  name: string
}

/** 2-2. 성취기준 */
export interface Standard {
  /** [12현윤01-01] */
  code: string
  /** 성취기준 문장 */
  text: string
  scale_type: ScaleType
  /** 소속 영역 */
  area_no: string
  /**
   * 성취수준. 5단계는 A~E 5칸, 3단계는 상·중·하 3칸만.
   * 3단계 과목은 Ⅺ 표에서 D·E 행을 비운다.
   */
  levels: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E', string>>
}

/** 2-3. 단원 매핑 — 교사가 소단원명 붙여넣기 → AI 매칭 → 교사 확인 → 저장 */
export interface Unit {
  id: string
  /** 진도 순서 */
  order: number
  /** '01. 현대인의 삶과 실천윤리' */
  name: string
  /** 영역 (매칭 결과). 진도표 단원명 윗줄이 여기서 파생된다. */
  area_no: string | null
  /** 배정된 성취기준 */
  standard_codes: string[]
}

/** 2. 과목 레이어 */
export interface Subject {
  id: string
  name: string
  /** 성취기준 코드 접두 (예: 12현윤) */
  code_prefix: string
  type: SubjectType
  is_common: boolean
  /** Ⅱ 평가의 목적 — 원본 파일에 없다. 최초 1회 붙여넣기. */
  objectives: string
  /** Ⅴ 표 자동 판정 */
  scale_type: ScaleType
  /** Ⅰ 교수학습 운영계획 */
  teaching_plan: string
  areas: Area[]
  standards: Standard[]
  units: Unit[]
  /** 2-4. 학기단위 성취수준 A~E 5개 */
  semester_levels: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E', string>>
  /** 최소 성취수준 (공통과목만) */
  min_level: string | null
  /** 샘플 시드 데이터 여부 — xlsx 임포트로 교체되면 false */
  seed?: boolean
}

/* ══════════════════════════════════════════════════════════
   3. 학기 레이어 — 교사가 매 학기 입력. 여기만 만지면 되도록.
   ══════════════════════════════════════════════════════════ */

export type SplitScoreType = '추정' | '고정'

/**
 * 3-2. 정기시험 문항 구분별 배점.
 *
 * Ⅳ 표에서 회차 하나가 차지하는 열 수가 곧 이 배열의 길이다.
 * (실물: 국어는 선택형 하나, 과학은 선택형·단답형, 수학은 셋)
 */
export interface ExamPart {
  kind: '선택형' | '단답형' | '서술형'
  /** 문항 수 */
  count: number
  /** 배점 합 */
  points: number
}

export interface Exam {
  /** 회차 */
  no: number
  /** 실시 주차 */
  week: number
  /** 이 시험까지 나가는 마지막 성취기준 코드 = 진도 배분 기준점 */
  anchor_code: string | null
  /**
   * 이 회차의 반영 비율(%). 정하지 않으면 plan.exam_ratio를 회차 수로 나눈다.
   * 전체 정기시험 비율(plan.exam_ratio)은 이 값들의 합이다.
   */
  ratio?: number
  parts: ExamPart[]
}

/** 3-3. 루브릭 한 수준 */
export interface RubricLevel {
  /** 배점 */
  score: number
  /** 기준 서술 */
  text: string
}

/** 3-3. 루브릭 한 행 */
export interface RubricRow {
  id: string
  /** 평가 영역 */
  area: string
  /** 평가 요소 */
  element: string
  /** 3단계 */
  levels: RubricLevel[]
}

export type PerfMethodCheck =
  '서술·논술' | '구술·발표' | '토의·토론' | '프로젝트' | '실험·실습' | '포트폴리오' | '기타'

/** 3-3. 수행평가 */
export interface Performance {
  id: string
  /** 수행평가명 — 9곳 전파 */
  name: string
  /** 논술형 / 구술형 등 */
  method: string
  /** 반영 비율 (%) */
  ratio: number
  /** 영역 만점 */
  max_score: number
  /** 기본점수 */
  base_score: number
  /** 실시 주차 */
  week: number
  /** 성취기준 (6개 이하) */
  standard_codes: string[]
  /**
   * 교사가 성취기준을 직접 고른 경우. 참이면 진도에서 자동으로 다시 뽑지 않는다.
   * (고르지 않으면 그 주까지의 진도에서 자동으로 채운다)
   */
  standards_manual?: boolean
  /**
   * 이 수행평가에서 서술·논술형이 차지하는 비율(%).
   * 정하지 않으면 평가 방법에 '서술·논술'이 있을 때 반영 비율 전부로 본다.
   */
  essay_ratio?: number
  method_checks: PerfMethodCheck[]
  /** 수행 활동 과정 */
  activity: string
  rubric: RubricRow[]
  /** 간단 작성 모드의 '실시 의도' — 방법·성취기준·루브릭이 여기서 나온다 */
  intent?: string
}

/**
 * AI 초안 — export 시 hwpx에 빨간 글씨로 들어가는 문장들.
 *
 * AI는 문장만 쓴다. 숫자(배점·비율·요차)는 전부 코드가 정한다.
 * 재현이 불가능한 산출물이므로 파생값 금지 원칙의 예외로 저장한다.
 */
export interface AiDraft {
  /** 생성에 쓴 모델 (fallback이면 'fallback') */
  model: string
  created_at: string
  /** 키가 없거나 실패해 결정적 대체 문구를 쓴 경우 */
  fallback: boolean
  /**
   * 대체 문구를 쓴 이유 — 화면이 사람 말로 옮겨 보여 준다.
   * 'not-allowed'(승인 없음) · 'no-key' · 'http-401' 같은 코드.
   */
  fallback_reason?: string
  /** 입력 지문 — 일치하면 재호출을 건너뛴다 */
  input_hash: string
  /**
   * 양식이 빨간 글씨로 표시한 '교사가 채울 곳'만 채운다.
   * Ⅶ·Ⅸ는 양식의 검은 글씨(학교 공통 문구)라 AI가 손대지 않는다.
   */
  sections: {
    /** Ⅱ 평가의 목적 가·나·다 — 과목별 목표 3문장 (라·마는 양식 유지) */
    II: string[]
    /** Ⅲ-1 가·다·라 — 과목명이 들어가는 3문장 (나는 분할점수 계산값, 마~차는 양식 유지) */
    III1: string[]
    /** 학기단위 성취수준 A~E */
    semesterLevels: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E', string>>
    /** 최소 성취수준 — 공통과목만 */
    minLevel: string
  }
  /**
   * 주차 → 수업 방법 및 수업·평가 연계의 주안점 (진도표 5열).
   * 한 줄이 한 문단이다. 형식:
   *   [강의식, 모둠협력수업]
   *   -활동 하나
   *   -활동 둘
   *   [관찰평가] 그 차시의 평가 내용
   */
  weekly: Record<number, string[]>
  /** 수행평가 id → 활동 과정 + 루브릭(구조는 코드, text만 AI) */
  perfs: Record<string, { activity: string; rubric: RubricRow[] }>
  /** 생성 과정의 자체 점검 결과 (표시만, 차단하지 않음) */
  warnings: string[]
}

/** 3. 학기 레이어 */
export interface SemesterPlan {
  id: string
  subject_id: string
  /** 3-1. 기본 */
  grade: number
  /** 학점 = 주당 시수 */
  credit: number
  /** 1학기 / 2학기 — school.calendars에서 학사일정을 고르는 열쇠 */
  semester: 1 | 2
  /** 지도교사명 — 인원수가 Ⅰ 표 분할 수 결정 */
  teachers: string[]
  split_score_type: SplitScoreType
  /** 3-2. 정기시험 */
  exam_count: 0 | 1 | 2
  exams: Exam[]
  /**
   * 반영 비율 — 계획서마다 다르므로 학기 레이어에 둔다.
   * school.rules의 값은 새 계획서를 만들 때의 기본값 역할만 한다.
   */
  exam_ratio: number
  perf_ratio: number
  /** 3-3. 수행평가 */
  performances: Performance[]
  /**
   * 진도 배분 결과 — 주차 번호 → 성취기준 코드 목록.
   * 파생값이지만 교사가 손댈 수 있어 저장한다.
   * 같은 코드가 연속 주에 있으면 '이어짐'이며 그것도 파생이다 (isContinued).
   */
  distribution: Record<number, string[]>
  /**
   * 직접 확인 체크 결과 — hwpx 빨간 글씨 검토 방식으로 대체되어 더는 쓰지 않는다.
   * 구버전 저장분과의 호환을 위해 남겨 둔다.
   */
  human_checks?: Record<string, boolean>
  /** AI 초안 — export 시 생성·저장 */
  ai?: AiDraft
  /**
   * "수행평가 성취기준과 교과진도계획 확인하셨나요?"에 확인을 누른 시점의
   * 상태 지문(perfProgressFingerprint). 성취기준·실시 시기·진도가 바뀌면 지문이
   * 달라져 확인이 자동으로 풀린다 — 한 번 누른 확인이 영원히 유효하면 무의미하다.
   */
  perf_progress_ack?: string
  updated_at: string
}
