import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AcademicCalendar,
  AiDraft,
  FocusTarget,
  Performance,
  SchoolLayer,
  SemesterPlan,
  Subject,
  Unit,
} from '@/types'
import { SCHOOL_SEED } from '@/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '@/data/subject'
import { distributeStandards, orderedStandardCodes, weeksOf } from '@/lib/derive'
import { buildPerformance } from '@/lib/autofill'
import type { ImportedSubject } from '@/lib/importStandards'
import { unitsFromAreas } from '@/lib/importStandards'

export type ScreenId =
  | 'home' // 작성 — 한 화면에 전부
  | 'generating' // AI 문안 생성 파이프라인
  | 'download' // 내려받기 (오류도 여기서 보여준다)
  | 'admin' // 관리자 — 학사일정 · 배포표 · 학교 규칙

export type { FocusTarget }

interface State {
  school: SchoolLayer
  subjects: Subject[]
  plans: SemesterPlan[]
  currentPlanId: string | null
  screen: ScreenId
  /** 홈으로 돌아가 스크롤·포커스할 구획. 저장하지 않는다. */
  focusTarget: FocusTarget | null
}

interface Actions {
  go: (screen: ScreenId) => void
  openPlan: (id: string, screen?: ScreenId) => void
  newPlan: (subjectId?: string) => string
  /** 처음부터 다시 — 과목 고르기 화면으로 돌아간다 (쓰던 계획서는 남는다) */
  startNew: () => void
  deletePlan: (id: string) => void
  /** 오류의 '고치기' — 홈으로 보내고 해당 구획에 포커스를 준다 */
  focusOn: (target: FocusTarget) => void
  clearFocus: () => void

  current: () => SemesterPlan | null
  currentSubject: () => Subject | null

  patchPlan: (patch: Partial<SemesterPlan>) => void
  patchSubject: (patch: Partial<Subject>) => void
  patchSchool: (patch: Partial<SchoolLayer>) => void

  /** /api/subjects/[name] 결과를 과목 레이어로 넣는다 (이름 일치 시 갱신). 반환 = subject id */
  upsertSubject: (imported: ImportedSubject & { units?: Unit[] }) => string
  /** 성취기준 없이 시작하는 수동 과목 */
  upsertManualSubject: (name: string) => string

  setUnitStandards: (unitId: string, codes: string[]) => void
  addUnit: (afterUnitId?: string) => void
  patchUnit: (unitId: string, patch: Partial<Unit>) => void
  removeUnit: (unitId: string) => void

  /** 앵커·학사일정이 바뀌면 진도를 다시 배분한다 */
  redistribute: () => void
  /** 그 주의 성취기준을 손으로 고친다 */
  setWeekStandards: (week: number, codes: string[]) => void

  /** 수행평가 추가/갱신 — 숫자·성취기준·루브릭 뼈대는 결정적 재계산 */
  upsertPerf: (input: {
    id?: string
    name: string
    intent: string
    week: number
    ratio?: number
    /** 교사가 직접 고른 성취기준 (없으면 기존 선택 유지, 그것도 없으면 자동) */
    standardCodes?: string[] | null
    /** 교사가 직접 정한 서술·논술 비율 */
    essayRatio?: number | null
  }) => void
  patchPerf: (id: string, patch: Partial<Performance>) => void
  removePerf: (id: string) => void

  setAiDraft: (ai: AiDraft) => void
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const usePlanStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      school: SCHOOL_SEED,
      subjects: [SUBJECT_SEED],
      plans: [PLAN_SEED],
      currentPlanId: null,
      screen: 'home',
      focusTarget: null,

      go: (screen) => set({ screen }),

      focusOn: (target) => set({ screen: 'home', focusTarget: target }),
      clearFocus: () => set({ focusTarget: null }),

      openPlan: (id, screen) => set({ currentPlanId: id, screen: screen ?? 'home' }),

      newPlan: (subjectId) => {
        const id = `plan-${uid()}`
        const school = get().school
        const subject = get().subjects.find((x) => x.id === subjectId) ?? get().subjects[0]
        const semester = school.calendars[0]?.semester ?? 1
        // 정기시험 주는 학사일정의 is_exam에서 파생한다 — 화면에 박아 두지 않는다
        const examWeeks = weeksOf(school, semester)
          .filter((w) => w.is_exam)
          .map((w) => w.no)
        const exams = examWeeks.slice(0, 2).map((week, i) => ({
          no: i + 1,
          week,
          anchor_code: null,
          parts: [
            { kind: '선택형' as const, count: 20, points: 70 },
            { kind: '서술형' as const, count: 5, points: 30 },
          ],
        }))
        const plan: SemesterPlan = {
          ...PLAN_SEED,
          id,
          subject_id: subject.id,
          semester,
          teachers: [],
          performances: [],
          exam_count: exams.length as 0 | 1 | 2,
          exams,
          exam_ratio: school.rules.exam_ratio,
          perf_ratio: school.rules.perf_ratio,
          distribution: distributeStandards(subject, weeksOf(school, semester), exams),
          ai: undefined,
          updated_at: new Date().toISOString(),
        }
        set((s) => ({ plans: [plan, ...s.plans], currentPlanId: id, screen: 'home' }))
        return id
      },

      startNew: () => set({ currentPlanId: null, screen: 'home', focusTarget: null }),

      deletePlan: (id) =>
        set((s) => ({
          plans: s.plans.filter((p) => p.id !== id),
          currentPlanId: s.currentPlanId === id ? null : s.currentPlanId,
        })),

      current: () => {
        const s = get()
        return s.plans.find((p) => p.id === s.currentPlanId) ?? null
      },

      currentSubject: () => {
        const s = get()
        const plan = s.plans.find((p) => p.id === s.currentPlanId)
        if (!plan) return null
        return s.subjects.find((x) => x.id === plan.subject_id) ?? null
      },

      patchPlan: (patch) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === s.currentPlanId ? { ...p, ...patch, updated_at: new Date().toISOString() } : p,
          ),
        })),

      patchSubject: (patch) =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === s.currentPlanId)
          if (!plan) return s
          return {
            subjects: s.subjects.map((x) => (x.id === plan.subject_id ? { ...x, ...patch } : x)),
          }
        }),

      patchSchool: (patch) => set((s) => ({ school: { ...s.school, ...patch } })),

      upsertSubject: (imported) => {
        const existing = get().subjects.find((x) => x.name === imported.name)
        const units = imported.units ?? unitsFromAreas(imported)
        if (existing) {
          const known = new Set(imported.standards.map((x) => x.code))
          const keptUnits =
            existing.units.length > 0 &&
            existing.units.some((u) => u.standard_codes.some((c) => known.has(c)))
              ? existing.units.map((u) => ({
                  ...u,
                  standard_codes: u.standard_codes.filter((c) => known.has(c)),
                }))
              : units
          set((s) => ({
            subjects: s.subjects.map((x) =>
              x.id === existing.id
                ? {
                    ...x,
                    code_prefix: imported.code_prefix,
                    scale_type: imported.scale_type,
                    areas: imported.areas,
                    standards: imported.standards,
                    units: keptUnits,
                  }
                : x,
            ),
          }))
          return existing.id
        }
        const id = `subj-${uid()}`
        const subject: Subject = {
          id,
          name: imported.name,
          code_prefix: imported.code_prefix,
          type: 'elective',
          is_common: imported.name.startsWith('공통') || /^통합|^한국사/.test(imported.name),
          objectives: '',
          scale_type: imported.scale_type,
          teaching_plan: '',
          areas: imported.areas,
          standards: imported.standards,
          units,
          semester_levels: {},
          min_level: null,
        }
        set((s) => ({ subjects: [...s.subjects, subject] }))
        return id
      },

      upsertManualSubject: (name) => {
        const existing = get().subjects.find((x) => x.name === name)
        if (existing) return existing.id
        const id = `subj-${uid()}`
        const subject: Subject = {
          id,
          name,
          code_prefix: '',
          type: 'elective',
          is_common: false,
          objectives: '',
          scale_type: 'LVL_5',
          teaching_plan: '',
          areas: [],
          standards: [],
          units: [],
          semester_levels: {},
          min_level: null,
        }
        set((s) => ({ subjects: [...s.subjects, subject] }))
        return id
      },

      setUnitStandards: (unitId, codes) => {
        get().patchSubject({
          units: (get().currentSubject()?.units ?? []).map((u) =>
            u.id === unitId ? { ...u, standard_codes: codes } : u,
          ),
        })
      },

      addUnit: (afterUnitId) => {
        const subject = get().currentSubject()
        if (!subject) return
        const ordered = [...subject.units].sort((a, b) => a.order - b.order)
        const at = afterUnitId ? ordered.findIndex((u) => u.id === afterUnitId) : ordered.length - 1
        const anchor = ordered[at]
        const nu: Unit = {
          id: `u-${uid()}`,
          order: 0,
          name: '',
          area_no: anchor?.area_no ?? subject.areas[0]?.no ?? null,
          standard_codes: [],
        }
        const next = [...ordered.slice(0, at + 1), nu, ...ordered.slice(at + 1)].map((u, i) => ({
          ...u,
          order: i + 1,
        }))
        get().patchSubject({ units: next })
      },

      patchUnit: (unitId, patch) => {
        get().patchSubject({
          units: (get().currentSubject()?.units ?? []).map((u) =>
            u.id === unitId ? { ...u, ...patch } : u,
          ),
        })
      },

      removeUnit: (unitId) => {
        const units = (get().currentSubject()?.units ?? [])
          .filter((u) => u.id !== unitId)
          .sort((a, b) => a.order - b.order)
          .map((u, i) => ({ ...u, order: i + 1 }))
        get().patchSubject({ units })
      },

      redistribute: () => {
        const plan = get().current()
        const subject = get().currentSubject()
        if (!plan || !subject) return
        const weeks = weeksOf(get().school, plan.semester)
        get().patchPlan({ distribution: distributeStandards(subject, weeks, plan.exams) })
      },

      setWeekStandards: (week, codes) => {
        const plan = get().current()
        if (!plan) return
        get().patchPlan({ distribution: { ...plan.distribution, [week]: codes } })
      },

      upsertPerf: (input) => {
        const plan = get().current()
        const subject = get().currentSubject()
        const school = get().school
        if (!plan || !subject) return

        const prev = plan.performances.find((p) => p.id === input.id)
        const others = plan.performances.filter((p) => p.id !== input.id)
        // 비율을 정하지 않으면 남은 몫을 준다. 한 영역 상한(규칙 2)은 넘기지 않는다.
        const usedRatio = others.reduce((s, p) => s + p.ratio, 0)
        const cap = school.rules.perf_area_max
        const ratio = Math.min(cap, input.ratio ?? Math.max(0, plan.perf_ratio - usedRatio))

        // 교사가 직접 고른 값은 다시 계산하지 않고 이어 간다
        const standardCodes =
          input.standardCodes !== undefined
            ? input.standardCodes
            : prev?.standards_manual
              ? prev.standard_codes
              : null
        const essayRatio =
          input.essayRatio !== undefined ? input.essayRatio : (prev?.essay_ratio ?? null)

        const built = buildPerformance({
          id: input.id ?? `perf-${uid()}`,
          name: input.name,
          intent: input.intent,
          ratio,
          week: input.week,
          school,
          distribution: plan.distribution,
          standardCodes,
          essayRatio,
        })

        const exists = plan.performances.some((p) => p.id === built.id)
        get().patchPlan({
          performances: exists
            ? plan.performances.map((p) => (p.id === built.id ? built : p))
            : [...plan.performances, built],
          ai: undefined, // 입력이 바뀌면 초안은 무효
        })
      },

      patchPerf: (id, patch) => {
        const plan = get().current()
        if (!plan) return
        get().patchPlan({
          performances: plan.performances.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          ai: undefined,
        })
      },

      removePerf: (id) => {
        const plan = get().current()
        if (!plan) return
        get().patchPlan({
          performances: plan.performances.filter((p) => p.id !== id),
          ai: undefined,
        })
      },

      setAiDraft: (ai) => get().patchPlan({ ai }),
    }),
    {
      name: 'easy-plan',
      version: 4,
      /**
       * v3 — 진도 배분이 단원 id에서 성취기준 코드로 바뀌었고,
       * 학사일정이 학기별 배열이 되었으며, 비율이 학기 레이어로 내려왔다.
       *
       * 옛 저장분을 못 읽어 앱이 안 뜨는 게 최악이라, 되살릴 수 없는 값은
       * 조용히 기본값으로 떨어뜨린다.
       */
      migrate: (persisted, version) => {
        const state = persisted as Partial<State> & Record<string, unknown>
        if (version >= 4) return state as unknown as State & Actions

        /*
         * v4 — 단원에 안 들어간 성취기준이 배분에서 통째로 빠져 있었다.
         * 이미 굳은 배분은 스스로 고쳐지지 않으므로, 빠진 게 있는 계획서만 다시 배분한다.
         * (주차별 손질 화면이 아직 없어 덮어써도 잃을 것이 없다.)
         */
        if (version === 3) {
          const school3 = (state.school ?? SCHOOL_SEED) as SchoolLayer
          const subjects3 = (state.subjects ?? []) as Subject[]
          state.plans = ((state.plans ?? []) as SemesterPlan[]).map((p) => {
            const subject = subjects3.find((x) => x.id === p.subject_id)
            if (!subject) return p
            const want = orderedStandardCodes(subject)
            const have = new Set(Object.values(p.distribution ?? {}).flat())
            if (want.every((c) => have.has(c))) return p
            const weeks = weeksOf(school3, p.semester ?? 1)
            return {
              ...p,
              distribution: distributeStandards(subject, weeks, p.exams),
              ai: undefined,
            }
          })
          return state as unknown as State & Actions
        }

        // 학사일정: calendar(단수) → calendars(배열). 2학기 시드를 보충한다.
        const school = state.school as (SchoolLayer & { calendar?: AcademicCalendar }) | undefined
        if (school && !school.calendars) {
          const old = school.calendar
          school.calendars = old
            ? [old, ...SCHOOL_SEED.calendars.filter((c) => c.semester !== old.semester)]
            : SCHOOL_SEED.calendars
          delete school.calendar
        }
        const weeks = school?.calendars?.[0]?.weeks ?? SCHOOL_SEED.calendars[0].weeks
        const rules = school?.rules ?? SCHOOL_SEED.rules

        const subjects = (state.subjects ?? []) as Subject[]
        state.plans = ((state.plans ?? []) as (SemesterPlan & Record<string, unknown>)[]).map(
          (p) => {
            const subject = subjects.find((x) => x.id === p.subject_id)
            const codeOfUnit = (unitId: unknown) =>
              subject?.units.find((u) => u.id === unitId)?.standard_codes.slice(-1)[0] ?? null

            // 앵커: 단원 id → 그 단원의 마지막 성취기준 코드
            const exams = (p.exams ?? []).map((e) => {
              const legacy = e as typeof e & { anchor_unit?: string | null }
              return {
                ...e,
                anchor_code: e.anchor_code ?? codeOfUnit(legacy.anchor_unit),
              }
            })
            delete (p as Record<string, unknown>).mode
            delete (p as Record<string, unknown>).step

            return {
              ...p,
              semester: p.semester ?? 1,
              exam_ratio: p.exam_ratio ?? rules.exam_ratio,
              perf_ratio: p.perf_ratio ?? rules.perf_ratio,
              exams,
              // 단원 기준 배분은 되살릴 수 없다 — 성취기준 기준으로 다시 배분한다
              distribution: subject ? distributeStandards(subject, weeks, exams) : {},
              ai: undefined, // 배분이 바뀌었으니 초안도 무효
            } as SemesterPlan
          },
        )

        state.screen = 'home'
        return state as unknown as State & Actions
      },
      partialize: (s) => ({
        school: s.school,
        subjects: s.subjects,
        plans: s.plans,
      }),
    },
  ),
)
