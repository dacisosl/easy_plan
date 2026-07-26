'use client'

/**
 * 홈 = 간단 입력 첫 화면. 이 한 화면에서 계획서를 만든다.
 *
 * 과목(콤보박스) · 학년 · 지도교사 · 정기시험 앵커 · 수행평가(명칭/시기/의도).
 * 루브릭·비율·배점은 코드와 AI가 채우고, 교사는 한글에서 빨간 글씨를 검토한다.
 */

import { useState } from 'react'
import { Field, ColorKey } from '@/components/ui'
import { SubjectPicker } from '@/components/SubjectPicker'
import { STEPS, usePlanStore } from '@/store/usePlanStore'
import { monthWeekLabel } from '@/lib/derive'
import type { SimpleInput } from '@/lib/autofill'
import type { Unit } from '@/types'

interface PerfDraft {
  name: string
  week: number | ''
  intent: string
}

export function Home() {
  const {
    school,
    plans,
    subjects,
    openPlan,
    newPlan,
    patchPlan,
    upsertSubject,
    upsertManualSubject,
    go,
    deletePlan,
  } = usePlanStore()

  const [subjectName, setSubjectName] = useState('')
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [grade, setGrade] = useState(1)
  const [teachers, setTeachers] = useState('')
  const [anchor1, setAnchor1] = useState('')
  const [anchor2, setAnchor2] = useState('')
  const [perfs, setPerfs] = useState<PerfDraft[]>([
    { name: '', week: '', intent: '' },
    { name: '', week: '', intent: '' },
  ])

  const subject = subjects.find((s) => s.id === subjectId)
  const units: Unit[] = subject ? [...subject.units].sort((a, b) => a.order - b.order) : []
  const teachWeeks = school.calendar.weeks.filter((w) => !w.is_exam)

  const pickSubject = async (name: string, listed: boolean) => {
    setSubjectName(name)
    setError(null)
    if (!listed) {
      setManual(true)
      setSubjectId(upsertManualSubject(name))
      return
    }
    setManual(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/subjects/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? '실패')
      const imported = await res.json()
      setSubjectId(upsertSubject(imported))
    } catch (e) {
      setError(e instanceof Error ? e.message : '과목을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  const patchDraft = (i: number, patch: Partial<PerfDraft>) =>
    setPerfs((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const filled = perfs.filter((p) => p.name.trim() && p.intent.trim())
  const ready = !!subjectId && filled.length > 0 && !manual

  const start = () => {
    if (!subjectId) return
    newPlan('간단', subjectId)
    const inputs: SimpleInput[] = filled.map((p) => ({
      date: '',
      week: p.week === '' ? null : p.week,
      name: p.name.trim(),
      intent: p.intent.trim(),
    }))
    patchPlan({
      grade,
      teachers: teachers.split(',').map((t) => t.trim()).filter(Boolean),
      exams: [
        { no: 1, week: 8, anchor_unit: anchor1 || null, parts: PART_DEFAULT() },
        { no: 2, week: 18, anchor_unit: anchor2 || null, parts: PART_DEFAULT() },
      ],
    })
    sessionStorage.setItem('easy-plan:simple-inputs', JSON.stringify(inputs))
    go('generating')
  }

  const nameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? '과목 미정'
  const statusOf = (step: number) =>
    step > STEPS.length
      ? '완료'
      : `${STEPS[Math.min(step - 1, STEPS.length - 1)].label} 단계`
  const ago = (iso: string) => {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
    return diff <= 0 ? '오늘' : diff === 1 ? '어제' : `${d.getMonth() + 1}월 ${d.getDate()}일`
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-12">
      {/* ── 간단 입력 ─────────────────────────── */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2 pt-4">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em]">
            {school.calendar.year}학년도 {school.calendar.semester}학기 평가계획
          </h1>
          <p className="text-[15px] leading-relaxed text-ink-2">
            여기 있는 것만 채우면 됩니다. 나머지는 계산하고, 문장은 AI가 초안을 쓰고, 교사는
            한글에서 빨간 글씨를 검토합니다.
          </p>
          <ColorKey />
        </div>

        <div className="grid grid-cols-[1fr_140px_200px] gap-5">
          <Field label="과목" hint={loading ? '성취기준을 불러오는 중…' : error ?? undefined}>
            <SubjectPicker value={subjectName} onPick={pickSubject} autoFocus />
          </Field>
          <Field label="학년">
            <select
              className="control"
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value))}
            >
              {[1, 2, 3].map((g) => (
                <option key={g} value={g}>
                  {g}학년
                </option>
              ))}
            </select>
          </Field>
          <Field label="지도교사" hint="쉼표로 구분">
            <input
              className="control"
              value={teachers}
              placeholder="김서연, 박준호"
              onChange={(e) => setTeachers(e.target.value)}
            />
          </Field>
        </div>

        {manual && (
          <div className="notice-warn text-sm text-amber-ink">
            &lsquo;{subjectName}&rsquo;은 성취기준 파일에 없는 과목입니다 — 간단 작성은 성취기준이
            있어야 돌아갑니다.{' '}
            <a onClick={() => newPlan('심화', subjectId ?? undefined)}>심화로 시작</a>해 직접
            채우세요.
          </div>
        )}

        {subject && units.length > 0 && (
          <div className="grid grid-cols-2 gap-5">
            {(
              [
                ['1회 정기시험 마지막 단원', anchor1, setAnchor1],
                ['2회 정기시험 마지막 단원', anchor2, setAnchor2],
              ] as const
            ).map(([label, value, setter]) => (
              <Field key={label} label={label}>
                <select
                  className="control"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                >
                  <option value="">— 고르세요 —</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="sec-title">수행평가</div>
          {perfs.map((p, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-box border border-line px-6 py-5"
            >
              <div className="grid grid-cols-[1fr_180px] gap-4">
                <Field label="명칭" hint={`${school.rules.perf_name_maxlen}자 이내`}>
                  <input
                    className="control"
                    value={p.name}
                    onChange={(e) => patchDraft(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="실시 시기">
                  <select
                    className="control"
                    value={p.week}
                    onChange={(e) =>
                      patchDraft(i, { week: e.target.value === '' ? '' : Number(e.target.value) })
                    }
                  >
                    <option value="">자동 배치</option>
                    {teachWeeks.map((w) => (
                      <option key={w.no} value={w.no}>
                        {monthWeekLabel(school, w.no)} ({w.no}주)
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold">
                  실시 의도{' '}
                  <span className="text-[13px] font-normal text-ink-2">
                    — 평가 방법·성취기준·루브릭 초안이 여기서 나옵니다. 길게 쓸수록 정확합니다
                  </span>
                </span>
                <textarea
                  className="control min-h-[110px] border-navy-line-hover text-base"
                  placeholder="학생들이 자료를 찾아 불평등 실태를 조사하고 정책 대안을 발표하게 하고 싶다"
                  value={p.intent}
                  onChange={(e) => patchDraft(i, { intent: e.target.value })}
                />
              </label>
              {perfs.length > 1 && (
                <a
                  className="self-end text-[13px] text-ink-3"
                  onClick={() => setPerfs((prev) => prev.filter((_, j) => j !== i))}
                >
                  삭제
                </a>
              )}
            </div>
          ))}
          <a
            className="text-sm font-medium"
            onClick={() => setPerfs((prev) => [...prev, { name: '', week: '', intent: '' }])}
          >
            + 수행평가 추가
          </a>
        </div>

        <div className="flex items-center gap-5">
          <button className="btn btn-lg" disabled={!ready} onClick={start}>
            계획서 만들기
          </button>
          <span className="text-[13px] text-ink-3">
            {ready
              ? `수행평가 ${filled.length}개 · 비율은 ${school.rules.perf_ratio}%를 균등 분배합니다`
              : '과목을 고르고 수행평가를 하나 이상 채우세요'}
          </span>
        </div>
      </div>

      {/* ── 작성 중인 계획서 ───────────────────── */}
      {plans.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-line-soft pt-8 pb-16">
          <div className="sec-title">작성 중인 계획서</div>
          <div className="flex flex-col">
            {plans.map((p) => (
              <div
                key={p.id}
                className="group flex cursor-pointer items-center justify-between border-b border-line-soft py-3.5 last:border-b-0 hover:bg-surface-sub"
                onClick={() => openPlan(p.id, p.mode === '심화' ? undefined : 'download')}
              >
                <span className="text-[15px] font-medium">
                  {nameOf(p.subject_id)} · {p.grade}학년
                  <span className="ml-2 text-[13px] font-normal text-ink-3">{p.mode}</span>
                </span>
                <span className="flex items-center gap-4 text-[13px] text-ink-3">
                  <span>{statusOf(p.step)}</span>
                  <span>{ago(p.updated_at)}</span>
                  <a
                    className="invisible text-ink-4 group-hover:visible hover:text-red"
                    onClick={(e) => {
                      e.stopPropagation()
                      deletePlan(p.id)
                    }}
                  >
                    삭제
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const PART_DEFAULT = () => [
  { kind: '선택형' as const, count: 20, points: 70 },
  { kind: '서술형' as const, count: 5, points: 30 },
]
