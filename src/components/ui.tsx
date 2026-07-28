'use client'

import { useState, type ReactNode } from 'react'
import { usePlanStore } from '@/store/usePlanStore'

/* ── 화면 틀 — 카드 상자 없이 흰 바탕에 바로 ── */

export function Screen({
  title,
  subtitle,
  right,
  children,
  className = '',
}: {
  /** 없으면 제목 줄 자체를 그리지 않는다 — 홈은 상단 바 간판이 그 역할을 한다 */
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`mx-auto flex w-full max-w-[880px] flex-col gap-8 ${className}`}>
      {(title || right) && (
        <div className="flex items-end justify-between border-b border-line-soft pb-4">
          <div className="flex flex-col gap-1">
            {title && <h1 className="text-xl font-semibold">{title}</h1>}
            {subtitle && <span className="text-sm text-ink-2">{subtitle}</span>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * 입력 구획 — 테두리로 묶어 무엇을 적는 자리인지 한눈에 보이게 한다.
 * `id`는 오류의 '고치기'가 스크롤해 올 앵커다.
 */
export function Fieldset({
  id,
  title,
  hint,
  action,
  error,
  children,
  preview,
  open,
  onToggle,
}: {
  id: string
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  /** 이 구획에 걸린 검증 오류 — 있으면 테두리가 붉어지고 접을 수 없다 */
  error?: ReactNode
  children: ReactNode
  /** 접혀 있을 때 보여 줄 자동 입력값 요약. onToggle과 함께 주면 접이식이 된다. */
  preview?: ReactNode
  open?: boolean
  onToggle?: () => void
}) {
  const collapsible = onToggle != null
  // 오류가 걸린 구획은 강제로 펼친다 — 접힌 채로 고칠 수는 없다
  const expanded = !collapsible || open || !!error

  if (!expanded) {
    return (
      <section
        id={id}
        className="flex items-center gap-5 rounded-box border border-line-card bg-surface-sub px-6 py-4"
      >
        {/* 항목 이름은 폭을 고정해 세로로 줄을 맞춘다 */}
        <h2 className="fs-title w-[148px] shrink-0">{title}</h2>
        {/*
         * 미리보기가 글이면 흰 칸에 담아 또렷하게,
         * 칩처럼 누를 수 있는 것이면 그대로 둔다 — 접힌 채로 바로 고를 수 있어야 한다.
         */}
        {typeof preview === 'string' ? (
          <span className="min-w-0 flex-1 truncate rounded-control border border-line-input bg-surface px-3 py-2 text-[14px] text-ink">
            {preview}
          </span>
        ) : (
          <div className="min-w-0 flex-1">{preview}</div>
        )}
        <button type="button" className="btn btn-sm btn-accent shrink-0" onClick={onToggle}>
          직접 입력 ▾
        </button>
      </section>
    )
  }

  return (
    <section
      id={id}
      className={`flex flex-col gap-4 rounded-box border px-6 py-5 ${
        error ? 'border-red-line bg-red-bg/40' : 'border-line-card bg-surface-sub'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="fs-title">{title}</h2>
          {hint && <span className="text-[13px] text-ink-3">{hint}</span>}
        </div>
        <div className="flex items-center gap-3">
          {action}
          {collapsible && !error && (
            <a className="text-[13px]" onClick={onToggle}>
              접기 ▴
            </a>
          )}
        </div>
      </div>
      {children}
      {error && <div className="text-[13px] text-red">{error}</div>}
    </section>
  )
}

/** 과목 · 학년 · 학점 부제 */
export function PlanSubtitle() {
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  if (!plan || !subject) return null
  return (
    <>
      {subject.name} · {plan.grade}학년 · {plan.credit}학점
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

/**
 * 칩 고르기 모달 — 성취기준처럼 목록이 긴 값을 눌러서 고른다.
 *
 * 취소하면 아무것도 바꾸지 않는다. 하나도 안 고르고 저장하면
 * 자동 선정으로 되돌아간다.
 */
export function ChipPicker({
  title,
  options,
  selected,
  max,
  onSave,
  onClose,
}: {
  title: ReactNode
  options: { value: string; label: string; sub?: string }[]
  selected: string[]
  max?: number
  onSave: (values: string[]) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string[]>(selected)
  const full = max != null && picked.length >= max

  const toggle = (v: string) =>
    setPicked((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : full ? prev : [...prev, v],
    )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,28,36,0.35)] p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[76vh] w-full max-w-[880px] flex-col gap-3 rounded-card bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <span className="text-[13px] text-ink-3">
            {picked.length}
            {max != null ? ` / ${max}` : ''}
          </span>
        </div>

        {/* 성취기준은 문장이 길다 — 2열로 펼쳐 한 화면에 담는다 */}
        <div className="grid grid-cols-1 content-start gap-1.5 overflow-y-auto pr-1 lg:grid-cols-2">
          {options.map((o) => {
            const on = picked.includes(o.value)
            const blocked = !on && full
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                disabled={blocked}
                className={`flex w-full items-start gap-2.5 rounded-control border px-3 py-2 text-left transition-colors ${
                  on
                    ? 'border-navy bg-navy text-white'
                    : blocked
                      ? 'cursor-not-allowed border-line bg-surface-off text-ink-4'
                      : 'border-line-input bg-surface hover:border-navy-line-hover'
                }`}
              >
                <span className={`shrink-0 font-mono text-[12px] ${on ? '' : 'text-navy'}`}>
                  {o.label}
                </span>
                {o.sub && (
                  <span
                    className={`line-clamp-2 text-[12px] leading-snug ${on ? 'text-white/85' : 'text-ink-2'}`}
                  >
                    {o.sub}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-3">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-sm" onClick={() => onSave(picked)}>
            저장
          </button>
        </div>
      </div>
    </div>
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
  const titleColor = tone === 'err' ? 'text-red' : tone === 'warn' ? 'text-amber' : 'text-navy'
  const detailColor =
    tone === 'err' ? 'text-red-ink' : tone === 'warn' ? 'text-amber-ink' : 'text-navy-mid'
  return (
    <div className={`${box} flex items-center justify-between gap-5`}>
      <div className="flex flex-col gap-1.5">
        <span className={`text-base font-semibold ${titleColor}`}>{title}</span>
        {detail && <span className={`text-sm ${detailColor}`}>{detail}</span>}
      </div>
      {action}
    </div>
  )
}

/* ── 범례 ─────────────────────────────────── */

export function LegendDot({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-[7px]">
      <span className={`h-3 w-3 rounded-[3px] ${className}`} />
      {children}
    </span>
  )
}

/* ── 문서 검토 언어 안내 — 색이 곧 상태 ────── */

export function ColorKey() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-2">
      <span>
        <span className="font-semibold text-ink">검정</span> 코드가 계산한 값
      </span>
      <span>
        <span className="font-semibold text-red">빨강</span> AI 초안 — 한글에서 읽고 검정으로
      </span>
      <span>
        <span className="rounded-[3px] bg-[#FFF3C4] px-1.5 py-0.5 text-ink-2">배경색</span> 직접
        채우는 칸
      </span>
    </div>
  )
}
