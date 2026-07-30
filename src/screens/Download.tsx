'use client'

/**
 * 내려받기 — 요약 + AI 초안 상태 + hwpx 다운로드.
 *
 * AI 초안이 없거나 입력이 바뀌었으면 generating을 먼저 거친다.
 */

import { useState } from 'react'
import { ColorKey, PlanSubtitle, Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { RULE_COUNT, validate } from '@/lib/validate'
import { weeksOf } from '@/lib/derive'
import { generateDraft } from '@/lib/generateClient'

/**
 * 대체 문구를 쓴 이유를 사람 말로.
 * 이유가 안 잡힌 경우(예: 예전에 저장된 초안)는 재생성을 권한다 — 원인 코드는
 * 새 초안부터 실리기 때문이다.
 */
function fallbackReasonLabel(reason?: string): string {
  switch (reason) {
    case 'not-allowed':
      return '이 계정은 아직 AI 문안 사용 승인이 없습니다 (관리자 → 사용자 승인)'
    case 'no-key':
      return '서버에 OpenRouter API 키가 없습니다'
    case 'http-401':
      return 'API 키가 올바르지 않습니다 (401)'
    case 'http-402':
      return 'OpenRouter 크레딧이 부족합니다 (402)'
    case 'http-404':
      return '설정된 모델 이름을 OpenRouter가 모릅니다 (404)'
    case 'http-429':
      return '호출이 너무 잦습니다 (429) — 잠시 뒤 다시 생성'
    case 'network':
      return '모델 서버에 연결하지 못했습니다'
    case 'parse':
      return '모델 응답을 읽지 못했습니다'
    default:
      return reason
        ? `호출 실패 (${reason})`
        : '예전에 만든 초안입니다 — 원인을 보려면 다시 생성하세요'
  }
}

export function Download() {
  const { school, go, setAiDraft, focusOn, confirmPerfProgress } = usePlanStore()
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
  const fileName = `${subject.name}_${plan.semester}학기_계획서.hwpx`
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
    [
      '단원',
      `${subject.units.length}개 · 성취기준 ${subject.standards.length}개 중 ${assigned.size}개 배정`,
    ],
    [
      '진도',
      `${weeksOf(school, plan.semester).length}주 배분 · 정기시험 ${
        plan.exams.map((e) => `${e.week}주`).join(' / ') || '없음'
      }`,
    ],
    ['수행평가', `${plan.performances.length}개 · ${perfSum}%`],
    [
      '로직 검증',
      result.errors.length === 0 ? `${RULE_COUNT}개 규칙 통과` : `오류 ${result.errors.length}개`,
    ],
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
        <div className="flex flex-col gap-3">
          <span className="text-sm text-red-ink">
            로직 오류 {result.errors.length}개를 고쳐야 내려받을 수 있습니다 — 고치기를 누르면 해당
            입력란으로 갑니다
          </span>
          {result.errors.map((e, i) => (
            <div key={i} className="notice-err flex items-center justify-between gap-5">
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-semibold text-red">{e.title}</span>
                <span className="text-[13px] text-red-ink">{e.detail}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => focusOn(e.target ?? 'perf')}
                >
                  고치기
                </button>
                {/*
                 * 규칙 16만 '확인'으로 넘어갈 수 있다 — 진도를 실제와 다르게 적는
                 * 학교도 있어 사람의 판단에 맡긴다. 확인은 지금 상태에만 유효하다.
                 */}
                {e.confirmable && (
                  <button className="btn btn-sm" onClick={confirmPerfProgress}>
                    확인했습니다
                  </button>
                )}
              </div>
            </div>
          ))}
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
                ? `대체 문구 사용 — ${fallbackReasonLabel(ai.fallback_reason)}. 문서의 빨간 글씨는 상투 문안입니다. '다시 생성'으로 재시도할 수 있습니다.`
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
