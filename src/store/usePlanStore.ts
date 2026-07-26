import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiDraft, Performance, SchoolLayer, SemesterPlan, Subject, Unit } from '@/types'
import { SCHOOL_SEED } from '@/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '@/data/subject'
import { distributeUnits } from '@/lib/derive'
import { buildPerformance } from '@/lib/autofill'
import type { ImportedSubject } from '@/lib/importStandards'
import { unitsFromAreas } from '@/lib/importStandards'

export type ScreenId =
  | 'home' // 간단 입력 (기본 경로)
  | 'setup' // 심화 1 · 과목 설정
  | 'units' // 심화 2 · 단원 매핑
  | 'schedule' // 심화 3 · 진도 설계
  | 'performances' // 심화 4 · 수행평가
  | 'review' // 로직 오류 (단계 밖 — 오류 시만 경유)
  | 'download' // 심화 5 · 내려받기
  | 'generating' // AI 문안 생성 파이프라인

/** 심화 5단계 — 검토는 단계에서 뺀다 (오류 있을 때만 경유) */
export const STEPS: { id: ScreenId; label: string }[] = [
  { id: 'setup', label: '과목 설정' },
  { id: 'units', label: '단원 매핑' },
  { id: 'schedule', label: '진도 설계' },
  { id: 'performances', label: '수행평가' },
  { id: 'download', label: '내려받기' },
]

interface State {
  school: SchoolLayer
  subjects: Subject[]
  plans: SemesterPlan[]
  currentPlanId: string | null
  screen: ScreenId
}

interface Actions {
  go: (screen: ScreenId) => void
  openPlan: (id: string, screen?: ScreenId) => void
  newPlan: (mode: '간단' | '심화', subjectId?: string) => string
  deletePlan: (id: string) => void

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

  redistribute: () => void
  setWeekUnits: (week: number, unitIds: string[]) => void

  /** 수행평가 추가/갱신 — 숫자·성취기준·루브릭 뼈대는 결정적 재계산 */
  upsertPerf: (input: {
    id?: string
    name: string
    intent: string
    week: number
    ratio?: number
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

      go: (screen) => set({ screen }),

      openPlan: (id, screen) =>
        set((s) => ({
          currentPlanId: id,
          screen: screen ?? (s.plans.find((p) => p.id === id)?.mode === '심화' ? 'setup' : 'home'),
        })),

      newPlan: (mode, subjectId) => {
        const id = `plan-${uid()}`
        const subject =
          get().subjects.find((x) => x.id === subjectId) ?? get().subjects[0]
        const plan: SemesterPlan = {
          ...PLAN_SEED,
          id,
          subject_id: subject.id,
          mode,
          step: 1,
          teachers: [],
          performances: [],
          distribution: distributeUnits(subject.units, get().school.calendar.weeks, PLAN_SEED.exams),
          ai: undefined,
          updated_at: new Date().toISOString(),
        }
        set((s) => ({
          plans: [plan, ...s.plans],
          currentPlanId: id,
          screen: mode === '심화' ? 'setup' : 'home',
        }))
        return id
      },

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
        const dist = distributeUnits(subject.units, get().school.calendar.weeks, plan.exams)
        get().patchPlan({ distribution: dist })
      },

      setWeekUnits: (week, unitIds) => {
        const plan = get().current()
        if (!plan) return
        get().patchPlan({ distribution: { ...plan.distribution, [week]: unitIds } })
      },

      upsertPerf: (input) => {
        const plan = get().current()
        const subject = get().currentSubject()
        const school = get().school
        if (!plan || !subject) return

        const others = plan.performances.filter((p) => p.id !== input.id)
        // 비율을 정하지 않으면 남은 몫을 준다 (심화에서 직접 정하면 그 값)
        const usedRatio = others.reduce((s, p) => s + p.ratio, 0)
        const ratio = input.ratio ?? Math.max(0, school.rules.perf_ratio - usedRatio)

        const built = buildPerformance({
          id: input.id ?? `perf-${uid()}`,
          name: input.name,
          intent: input.intent,
          ratio,
          week: input.week,
          school,
          distribution: plan.distribution,
          units: subject.units,
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
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<State> & { screen?: string }
        if (version < 2) {
          // v1의 화면 값(simple/result/focus/performance)을 새 흐름으로 접는다
          const map: Record<string, ScreenId> = {
            simple: 'home',
            result: 'download',
            focus: 'review',
            performance: 'performances',
          }
          if (state.screen && map[state.screen]) state.screen = map[state.screen]
        }
        return state as State & Actions
      },
      partialize: (s) => ({
        school: s.school,
        subjects: s.subjects,
        plans: s.plans,
      }),
    },
  ),
)
