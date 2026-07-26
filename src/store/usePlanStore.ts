import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Performance, SchoolLayer, SemesterPlan, Subject } from '@/types'
import { SCHOOL_SEED } from '@/data/school'
import { PLAN_SEED, SUBJECT_SEED } from '@/data/subject'
import { distributeUnits } from '@/lib/derive'

export type ScreenId =
  | 'home' // 09 시작 화면
  | 'setup' // 01 과목 설정
  | 'units' // 02 단원 매핑
  | 'schedule' // 03 진도 설계
  | 'performances' // 04 수행평가 목록
  | 'performance' // 05 수행평가 편집
  | 'review' // 06 검토
  | 'focus' // 07 직접 확인 포커스 모드
  | 'download' // 08 내려받기
  | 'simple' // 10 간단 입력
  | 'generating' // 11 생성 중
  | 'result' // 12 생성 결과

/** 심화 6단계 — 화면 헤더의 진행 표시 */
export const STEPS: { id: ScreenId; label: string }[] = [
  { id: 'setup', label: '과목 설정' },
  { id: 'units', label: '단원 매핑' },
  { id: 'schedule', label: '진도 설계' },
  { id: 'performances', label: '수행평가' },
  { id: 'review', label: '검토' },
  { id: 'download', label: '내려받기' },
]

interface State {
  school: SchoolLayer
  subjects: Subject[]
  plans: SemesterPlan[]
  currentPlanId: string | null
  screen: ScreenId
  /** 05 수행평가 편집이 열고 있는 대상 */
  editingPerfId: string | null
  /** 07 직접 확인이 보고 있는 항목 번호 */
  focusIndex: number
  /** 12 생성 결과의 자동 채움 표시 */
  showAutoMarks: boolean
}

interface Actions {
  go: (screen: ScreenId) => void
  openPlan: (id: string, screen?: ScreenId) => void
  newPlan: (mode: '간단' | '심화') => string
  deletePlan: (id: string) => void

  current: () => SemesterPlan | null
  currentSubject: () => Subject | null

  patchPlan: (patch: Partial<SemesterPlan>) => void
  patchSubject: (patch: Partial<Subject>) => void
  patchSchool: (patch: Partial<SchoolLayer>) => void

  setUnitStandards: (unitId: string, codes: string[]) => void
  redistribute: () => void
  setWeekUnits: (week: number, unitIds: string[]) => void

  editPerf: (id: string | null) => void
  addPerf: () => void
  patchPerf: (id: string, patch: Partial<Performance>) => void
  removePerf: (id: string) => void

  setHumanCheck: (id: string, value: boolean) => void
  setFocusIndex: (i: number) => void
  setShowAutoMarks: (v: boolean) => void
}

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyPerf = (n: number): Performance => ({
  id: `perf-${uid()}`,
  name: '',
  method: '논술형',
  ratio: 0,
  max_score: 0,
  base_score: 0,
  week: n,
  standard_codes: [],
  method_checks: [],
  activity: '',
  rubric: [],
})

export const usePlanStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      school: SCHOOL_SEED,
      subjects: [SUBJECT_SEED],
      plans: [PLAN_SEED],
      currentPlanId: null,
      screen: 'home',
      editingPerfId: null,
      focusIndex: 0,
      showAutoMarks: true,

      go: (screen) => set({ screen }),

      openPlan: (id, screen) =>
        set((s) => ({
          currentPlanId: id,
          screen: screen ?? (s.plans.find((p) => p.id === id)?.mode === '간단' ? 'simple' : 'setup'),
        })),

      newPlan: (mode) => {
        const id = `plan-${uid()}`
        const subject = get().subjects[0]
        const plan: SemesterPlan = {
          ...PLAN_SEED,
          id,
          subject_id: subject.id,
          mode,
          step: 1,
          performances: [],
          distribution: {},
          human_checks: {},
          updated_at: new Date().toISOString(),
        }
        set((s) => ({
          plans: [plan, ...s.plans],
          currentPlanId: id,
          screen: mode === '간단' ? 'simple' : 'setup',
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

      setUnitStandards: (unitId, codes) =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === s.currentPlanId)
          if (!plan) return s
          return {
            subjects: s.subjects.map((sub) =>
              sub.id !== plan.subject_id
                ? sub
                : {
                    ...sub,
                    units: sub.units.map((u) =>
                      u.id === unitId ? { ...u, standard_codes: codes } : u,
                    ),
                  },
            ),
          }
        }),

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

      editPerf: (id) => set({ editingPerfId: id, screen: id ? 'performance' : 'performances' }),

      addPerf: () => {
        const plan = get().current()
        if (!plan) return
        const p = emptyPerf(Math.max(1, (plan.exams[0]?.week ?? 8) + 2))
        get().patchPlan({ performances: [...plan.performances, p] })
        set({ editingPerfId: p.id, screen: 'performance' })
      },

      patchPerf: (id, patch) => {
        const plan = get().current()
        if (!plan) return
        get().patchPlan({
          performances: plan.performances.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })
      },

      removePerf: (id) => {
        const plan = get().current()
        if (!plan) return
        get().patchPlan({ performances: plan.performances.filter((p) => p.id !== id) })
        set({ editingPerfId: null, screen: 'performances' })
      },

      setHumanCheck: (id, value) => {
        const plan = get().current()
        if (!plan) return
        get().patchPlan({ human_checks: { ...plan.human_checks, [id]: value } })
      },

      setFocusIndex: (i) => set({ focusIndex: i }),
      setShowAutoMarks: (v) => set({ showAutoMarks: v }),
    }),
    {
      name: 'easy-plan',
      version: 1,
      partialize: (s) => ({
        school: s.school,
        subjects: s.subjects,
        plans: s.plans,
      }),
    },
  ),
)
