'use client'

/**
 * 내려받기 — 요약 + AI 초안 상태 + hwpx 다운로드.
 *
 * AI 초안이 없거나 입력이 바뀌었으면 generating을 먼저 거친다.
 */

import { useState } from 'react'
import { ColorKey, PlanSubtitle, Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { validate } from '@/lib/validate'
import { generateDraft } from '@/lib/generateClient'

export function Download() {
  const { school, go, setAiDraft } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [busy, setBusy] = useState(false)
  const [regen, setRegen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  if (!plan || !subject) return null

  const result = validate(plan, subject, school)
  const assigned = new Set(subject.units.flatMap((u) => u.standard_codes))
  const perfSum = plan.performances.reduce((s, p) => s + p.ratio, 0)
  const fileName = `${subject.name}_${school.calendar.semester}학기_계획서.hwpx`
  const ai = plan.ai

  const download = async () => {
    if (!ai) return go('generating')
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, subject, school, ai }),
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

  const regenerate = async () => {
    setRegen(true)
    setError(null)
    try {
      const fresh = await generateDraft(plan, subject, school, { force: true })
      setAiDraft(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 문안 재생성에 실패했습니다')
    } finally {
      setRegen(false)
    }
  }

  const rows: [string, string][] = [
    ['단원', `${subject.units.length}개 · 성취기준 ${subject.standards.length}개 중 ${assigned.size}개 배정`],
    [
      '진도',
      `${school.calendar.weeks.length}주 배분 · 정기시험 ${
        plan.exams.map((e) => `${e.week}주`).join(' / ') || '없음'
      }`,
    ],
    ['수행평가', `${plan.performances.length}개 · ${perfSum}%`],
    ['로직 검증', result.errors.length === 0 ? '15개 규칙 통과' : `오류 ${result.errors.length}개`],
  ]

  return (
    <Screen title="내려받기" subtitle={<PlanSubtitle />}>
      <div className="flex flex-col gap-3">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between border-b border-line-soft pb-3 text-[15px] last:border-b-0"
          >
            <span className="text-ink-2">{k}</span>
            <span className={k === '로직 검증' && result.errors.length > 0 ? 'text-red' : ''}>
              {v}
            </span>
          </div>
        ))}
      </div>

      {result.errors.length > 0 && (
        <div className="notice-err flex items-center justify-between gap-5">
          <span className="text-sm text-red-ink">
            로직 오류 {result.errors.length}개를 고쳐야 내려받을 수 있습니다
          </span>
          <button className="btn btn-sm btn-danger shrink-0" onClick={() => go('review')}>
            오류 보기
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-box border border-line px-6 py-5">
        <div className="flex items-baseline justify-between">
          <span className="sec-title">AI 문안</span>
          {ai && (
            <a className="text-[13px]" onClick={() => void regenerate()}>
              {regen ? '다시 만드는 중…' : '다시 생성'}
            </a>
          )}
        </div>
        {!ai ? (
          <span className="text-sm text-ink-2">
            아직 없습니다 — 내려받기를 누르면 먼저 생성합니다
          </span>
        ) : (
          <>
            <span className="text-sm text-ink-2">
              {ai.fallback
                ? '대체 문구 사용 (OPENROUTER_API_KEY 없음 또는 호출 실패) — 문서의 빨간 글씨는 상투 문안입니다'
                : `${ai.model} · ${new Date(ai.created_at).toLocaleString('ko-KR')}`}
            </span>
            {ai.warnings.length > 0 && (
              <div className="flex flex-col gap-1 text-[13px] text-amber-ink">
                <span className="font-semibold text-amber">자체 점검 {ai.warnings.length}건</span>
                {ai.warnings.map((w, i) => (
                  <span key={i}>· {w}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <button
            className="btn btn-xl"
            disabled={busy || result.errors.length > 0}
            onClick={() => void download()}
          >
            {busy ? '만드는 중…' : `${fileName} 내려받기`}
          </button>
        </div>
        <ColorKey />
        <span className="hint">
          한글 2020 이상에서 열립니다 · 빨간 글씨(AI 초안)를 읽고 검정으로 바꾸며 검토하세요 ·
          배경색 칸(예정시간·실시누계)은 직접 채웁니다
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
    </Screen>
  )
}
