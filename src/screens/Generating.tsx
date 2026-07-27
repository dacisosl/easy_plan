'use client'

/**
 * 생성 파이프라인 — [구조 채우기 → 검증 → AI 문안 3스테이지 → 완료].
 *
 * 간단 모드: sessionStorage의 입력으로 구조(autofill)를 먼저 채운다.
 * AI 스테이지는 /api/generate 실제 호출 진행에 맞춰 표시된다.
 * 끝나면 로직 오류가 있으면 review, 없으면 download로 간다.
 */

import { useEffect, useRef, useState } from 'react'
import { usePlanStore } from '@/store/usePlanStore'
import { autofill, type SimpleInput } from '@/lib/autofill'
import { generateDraft, type GenerateProgress } from '@/lib/generateClient'

const STAGE_LABELS: { key: GenerateProgress | 'structure'; label: string; detail: string }[] = [
  { key: 'structure', label: '구조 채우기', detail: '진도 배분 · 비율 · 성취기준 · 루브릭 뼈대' },
  { key: 'sections', label: 'Ⅰ·Ⅱ·Ⅸ·Ⅹ 문안', detail: '교수학습 · 평가 목적 · 활용 방안 · 원격수업' },
  { key: 'weekly', label: '주차별 주안점', detail: '진도표 수업 방법 칸' },
  { key: 'perfs', label: '수행평가 문안', detail: '활동 과정 · 루브릭 기준 서술 · 자체 점검' },
]

export function Generating() {
  const { school, go, patchPlan, setAiDraft } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [stage, setStage] = useState<string>('structure')
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !plan || !subject) return
    ran.current = true

    const run = async () => {
      // 1) 간단 모드면 구조부터 채운다
      let working = plan
      const raw = sessionStorage.getItem('easy-plan:simple-inputs')
      if (raw) {
        sessionStorage.removeItem('easy-plan:simple-inputs')
        const inputs = JSON.parse(raw) as SimpleInput[]
        const filled = autofill(plan, subject, school, inputs)
        working = { ...plan, ...filled }
        patchPlan({
          distribution: filled.distribution,
          performances: filled.performances,
        })
      }

      // 2) AI 문안 — 실패해도 fallback으로 완결된다
      try {
        const ai = await generateDraft(working, subject, school, {
          onProgress: (s) => setStage(s),
        })
        setAiDraft(ai)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI 문안 생성에 실패했습니다')
        return
      }

      // 3) 내려받기로 — 로직 오류가 있으면 거기서 목록과 '고치기'가 나온다
      go('download')
    }
    void run()
    // 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!plan || !subject) return null

  const activeIdx = STAGE_LABELS.findIndex((s) => s.key === stage)

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8 pt-16">
      <h1 className="text-xl font-semibold">
        {subject.name} · 계획서 만드는 중
      </h1>

      <div className="flex flex-col gap-5">
        {STAGE_LABELS.map((s, i) => {
          const done = i < activeIdx
          const active = i === activeIdx
          return (
            <div key={s.key} className="flex items-baseline gap-4">
              <span
                className={`w-4 text-sm ${done ? 'text-navy' : active ? 'text-navy' : 'text-ink-5'}`}
                aria-hidden
              >
                {done ? '✓' : active ? '•' : '○'}
              </span>
              <span
                className={
                  active
                    ? 'text-[17px] font-semibold text-navy'
                    : done
                      ? 'text-[15px] text-ink-3'
                      : 'text-[15px] text-ink-5'
                }
              >
                {s.label}
              </span>
              <span className={`text-[13px] ${active ? 'text-navy-mid' : 'text-ink-4'}`}>
                {s.detail}
              </span>
            </div>
          )
        })}
      </div>

      {error ? (
        <div className="flex flex-col gap-3">
          <div className="notice-err text-sm text-red-ink">{error}</div>
          <div>
            <button className="btn btn-sm btn-ghost" onClick={() => go('home')}>
              홈으로
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-3">
          키가 없으면 결정적 대체 문구로 완결됩니다 — 어느 쪽이든 문서는 나옵니다
        </p>
      )}
    </div>
  )
}
