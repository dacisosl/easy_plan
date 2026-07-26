'use client'

import { useEffect, useRef, useState } from 'react'
import { Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { GENERATION_STAGES, autofill, type SimpleInput } from '@/lib/autofill'

/** 화면 11 · 생성 중 */
export function Generating() {
  const { school, go, patchPlan } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [stage, setStage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [count, setCount] = useState(0)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !plan || !subject) return
    ran.current = true

    const raw = sessionStorage.getItem('easy-plan:simple-inputs')
    const inputs: SimpleInput[] = raw ? (JSON.parse(raw) as SimpleInput[]) : []
    setCount(inputs.length)
    const filled = autofill(plan, subject, school, inputs)

    let step = 0
    const timer = setInterval(() => {
      step += 1
      setStage(Math.floor(step / 3))
      setProgress(((step % 3) + 1) / 3)
      if (step >= GENERATION_STAGES.length * 3) {
        clearInterval(timer)
        patchPlan({
          distribution: filled.distribution,
          performances: filled.performances,
          step: filled.step,
        })
        go('result')
      }
    }, 260)
    return () => clearInterval(timer)
    // 한 번만 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!plan || !subject) return null

  const counts = [
    `${school.calendar.weeks.length}주 · 단원 ${subject.units.length}개`,
    `수행평가 ${count}개`,
    '평가 요소 배점 배분',
    `문장 ${school.sentences.length}개 중 조건 통과분`,
  ]

  return (
    <Screen
      eyebrow="화면 11 · 생성 중"
      title={`${subject.name} · 계획서 만드는 중`}
      bodyClass="gap-7 max-w-[800px] pt-14 pb-16"
    >
      <div className="flex flex-col gap-5">
        {GENERATION_STAGES.map((s, i) => {
          const done = i < stage
          const active = i === stage
          return (
            <div key={s.key} className="flex flex-col gap-2.5">
              <div className="flex items-baseline gap-4">
                <span
                  className={
                    active
                      ? 'text-xl font-semibold text-navy'
                      : done
                        ? 'text-[17px] text-ink-4'
                        : 'text-[17px] text-ink-5'
                  }
                >
                  {s.label}
                </span>
                <span className={`text-sm ${active ? 'text-navy-mid' : 'text-ink-4'}`}>
                  {counts[i]}
                </span>
              </div>
              {active && (
                <div className="h-1 overflow-hidden rounded-sm bg-line">
                  <span
                    className="block h-1 bg-navy transition-[width] duration-200"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="text-sm text-ink-2">이 화면을 닫아도 계속 진행됩니다</div>
    </Screen>
  )
}
