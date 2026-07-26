'use client'

import { useState } from 'react'
import { PlanHeaderTitle, Screen, StepBar } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { buildDocument, documentToHtml } from '@/lib/document'
import { HUMAN_CHECKS, validate } from '@/lib/validate'

/** 화면 08 · 내려받기 */
export function Download() {
  const { school } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  if (!plan || !subject) return null

  const doc = buildDocument(plan, subject, school)
  const result = validate(plan, subject, school)
  const doneChecks = HUMAN_CHECKS.filter((c) => plan.human_checks[c.id]).length
  const assigned = new Set(subject.units.flatMap((u) => u.standard_codes))
  const rubricRows = plan.performances.reduce((s, p) => s + p.rubric.length, 0)
  const perfSum = plan.performances.reduce((s, p) => s + p.ratio, 0)
  const fileName = `${subject.name}_${school.calendar.semester}학기_계획서.hwpx`

  const download = async () => {
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, subject, school }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `내려받기 실패 (${res.status})`)
      }
      const raw = res.headers.get('X-Render-Warnings')
      if (raw) setWarnings(JSON.parse(decodeURIComponent(raw)) as string[])

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '내려받지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  const rows: [string, string][] = [
    [
      '단원',
      `${subject.units.length}개 · 성취기준 ${subject.standards.length}개 중 ${assigned.size}개 배정`,
    ],
    [
      '진도',
      `${school.calendar.weeks.length}주 배분 · 정기시험 ${
        plan.exams.map((e) => `${e.week}주`).join(' / ') || '없음'
      }`,
    ],
    ['수행평가', `${plan.performances.length}개 · ${perfSum}% · 루브릭 ${rubricRows}행`],
    [
      '검토',
      `로직 ${result.passed.length}개 통과${
        result.errors.length ? ` · 오류 ${result.errors.length}개` : ''
      } · 직접 확인 ${doneChecks} / ${HUMAN_CHECKS.length}`,
    ],
    ['표', `${doc.tableCount}개 · 항목 ${doc.sections.length}개`],
  ]

  return (
    <Screen
      eyebrow="화면 08 · 내려받기"
      title={<PlanHeaderTitle />}
      right={<StepBar current="download" />}
      bodyClass={`gap-8 ${preview ? 'max-w-[1200px]' : 'max-w-[820px]'}`}
    >
      <div className="flex flex-col gap-3.5">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={`flex justify-between pb-3.5 text-[15px] ${
              i < rows.length - 1 ? 'border-b border-line-soft' : ''
            }`}
          >
            <span className="text-ink-2">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-4">
          <button className="btn btn-xl" disabled={busy} onClick={download}>
            {busy ? '만드는 중…' : `${fileName} 내려받기`}
          </button>
          <a className="text-sm text-ink-2" onClick={() => setPreview((v) => !v)}>
            {preview ? '미리보기 닫기' : '미리보기'}
          </a>
        </div>
        <span className="hint">
          한글 2020 이상에서 열립니다 · 내려받은 뒤에도 이 화면에서 다시 고칠 수 있습니다
        </span>
        {error && <span className="text-sm text-red">{error}</span>}
        {warnings.length > 0 && (
          <div className="notice-warn flex flex-col gap-1.5 text-sm text-amber-ink">
            <span className="font-semibold text-amber">채우지 못한 곳 {warnings.length}군데</span>
            {warnings.map((w, i) => (
              <span key={i}>· {w}</span>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <iframe
          title="계획서 미리보기"
          srcDoc={documentToHtml(doc)}
          className="h-[720px] w-full rounded-box border border-line bg-white"
        />
      )}
    </Screen>
  )
}
