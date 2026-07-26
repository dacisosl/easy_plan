'use client'

import type { ReactNode } from 'react'
import { STEPS, usePlanStore, type ScreenId } from '@/store/usePlanStore'

/* ── 진행 표시 ─────────────────────────────── */

export function StepBar({ current }: { current: ScreenId }) {
  const idx = STEPS.findIndex((s) => s.id === current)
  if (idx < 0) return null
  return (
    <div className="flex items-center gap-3.5">
      <div className="flex gap-[5px]">
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            title={s.label}
            className={`h-[3px] w-[26px] ${
              i < idx ? 'bg-ink-5' : i === idx ? 'bg-navy' : 'bg-line'
            }`}
          />
        ))}
      </div>
      <span className="text-[13px] text-ink-2">
        {idx + 1}단계 / {STEPS.length}
      </span>
    </div>
  )
}

/* ── 화면 틀 ───────────────────────────────── */

export function Screen({
  eyebrow,
  title,
  subtitle,
  right,
  children,
  bodyClass = 'gap-8',
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  bodyClass?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <div className="card">
        <div className="flex h-15 items-center justify-between border-b border-line-soft px-10">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[15px] font-semibold">{title}</span>
            {subtitle && <span className="text-[13px] text-ink-2">{subtitle}</span>}
          </div>
          {right}
        </div>
        <div className={`flex flex-col px-10 pt-9 pb-11 ${bodyClass}`}>{children}</div>
      </div>
    </div>
  )
}

/** 과목 · 학년 · 학점을 헤더에 그대로 쓰는 화면용 */
export function PlanHeaderTitle() {
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  if (!plan || !subject) return null
  return (
    <>
      {subject.name}
      <span className="ml-2.5 text-[13px] font-normal text-ink-2">
        {plan.grade}학년 · {plan.credit}학점
      </span>
    </>
  )
}

/* ── 폼 ───────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-2 ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

export function Section({
  title,
  aside,
  children,
  className = 'gap-3.5',
}: {
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-baseline justify-between">
        <div className="sec-title">{title}</div>
        {aside && <div className="text-[13px] text-ink-2">{aside}</div>}
      </div>
      {children}
    </div>
  )
}

/* ── 알림 ─────────────────────────────────── */

export function Notice({
  tone,
  title,
  detail,
  action,
}: {
  tone: 'err' | 'warn' | 'info'
  title: ReactNode
  detail?: ReactNode
  action?: ReactNode
}) {
  const box = tone === 'err' ? 'notice-err' : tone === 'warn' ? 'notice-warn' : 'notice-info'
  const titleColor = tone === 'err' ? 'text-red' : tone === 'warn' ? 'text-ink' : 'text-navy'
  const detailColor =
    tone === 'err' ? 'text-red-ink' : tone === 'warn' ? 'text-ink-2' : 'text-navy-mid'
  return (
    <div className={`${box} flex items-center justify-between gap-5`}>
      <div className="flex flex-col gap-1.5">
        <span className={`text-[17px] font-semibold ${titleColor}`}>{title}</span>
        {detail && <span className={`text-sm ${detailColor}`}>{detail}</span>}
      </div>
      {action}
    </div>
  )
}

/* ── 범례 ─────────────────────────────────── */

export function LegendDot({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  return (
    <span className="flex items-center gap-[7px]">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {children}
    </span>
  )
}

/* ── 숫자 요약 ─────────────────────────────── */

export function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: 'err' | 'warn'
}) {
  const color = tone === 'err' ? 'text-red' : tone === 'warn' ? 'text-amber' : 'text-ink'
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className={`text-[28px] font-semibold tracking-[-0.02em] ${color}`}>{value}</span>
    </div>
  )
}

/** 시드 데이터 안내 — 성취기준 xlsx로 교체하기 전까지 */
export function SeedBanner({ onImport }: { onImport: () => void }) {
  return (
    <div className="notice-warn flex items-center justify-between gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-amber">샘플 성취기준입니다</span>
        <span className="text-sm text-ink-2">
          코드만 있고 본문·성취수준이 비어 있습니다. 고등학교_성취기준_2022.xlsx를 불러오면
          채워집니다.
        </span>
      </div>
      <button className="btn btn-sm btn-ghost shrink-0" onClick={onImport}>
        xlsx 불러오기
      </button>
    </div>
  )
}
