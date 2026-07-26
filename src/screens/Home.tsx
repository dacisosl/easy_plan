'use client'

import { useState } from 'react'
import { STEPS, usePlanStore } from '@/store/usePlanStore'

/** 화면 09 · 시작 화면 (새로 만들기 모달 포함) */
export function Home() {
  const { plans, subjects, school, openPlan, newPlan } = usePlanStore()
  const [modal, setModal] = useState(false)
  const [mode, setMode] = useState<'간단' | '심화'>('간단')

  const subjectOf = (id: string) => subjects.find((s) => s.id === id)

  const statusOf = (step: number) =>
    step > STEPS.length
      ? '완료 · 내려받음'
      : `${step}단계 / ${STEPS.length} · ${STEPS[Math.min(step - 1, STEPS.length - 1)].label}`

  const ago = (iso: string) => {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (diff <= 0) return '오늘'
    if (diff === 1) return '어제'
    return `${d.getMonth() + 1}월 ${d.getDate()}일`
  }

  // 간단 작성은 과목 레이어가 채워져 있을 때만 쓸 수 있다
  const subjectReady = subjects.some((s) => s.standards.length > 0 && s.units.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="eyebrow">화면 09 · 시작 화면</div>
      <div className="card relative">
        <div className="flex h-15 items-center justify-between border-b border-line-soft px-10">
          <span className="text-[15px] font-semibold">교수학습 및 평가 운영계획서</span>
          <span className="text-[13px] text-ink-2">
            {school.calendar.year}학년도 {school.calendar.semester}학기
          </span>
        </div>

        <div className="flex min-h-[480px] max-w-[900px] flex-col gap-6 px-10 pt-9 pb-24">
          <div className="flex items-baseline justify-between">
            <span className="sec-title">작성 중인 계획서</span>
            <button className="btn btn-sm" onClick={() => setModal(true)}>
              새로 만들기
            </button>
          </div>

          {plans.length === 0 ? (
            <div className="rounded-box border border-dashed border-line-input px-6 py-8 text-[15px] text-ink-2">
              아직 계획서가 없습니다. 새로 만들기를 누르세요.
            </div>
          ) : (
            <div className="list">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className="list-row hoverable grid grid-cols-[1fr_220px_120px] items-center gap-6 py-[18px]"
                  onClick={() => openPlan(p.id)}
                >
                  <span className="text-base font-medium">
                    {subjectOf(p.subject_id)?.name ?? '과목 미정'} · {p.grade}학년
                    <span className="ml-2 text-[13px] font-normal text-ink-3">{p.mode}</span>
                  </span>
                  <span className="text-sm text-ink-2">{statusOf(p.step)}</span>
                  <span className="text-[13px] text-ink-3">{ago(p.updated_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {modal && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-[rgba(27,28,30,0.28)]"
            onClick={() => setModal(false)}
          >
            <div
              className="flex w-[560px] flex-col gap-5 rounded-card bg-surface p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[19px] font-semibold">어떻게 작성할까요</div>
              <div className="flex flex-col gap-3">
                <ModeCard
                  on={mode === '간단'}
                  title="간단"
                  desc="6가지만 입력하면 나머지를 자동으로 채웁니다. 약 5분"
                  disabled={!subjectReady}
                  disabledNote="이 과목은 아직 준비되지 않았습니다 — 심화로 시작하세요"
                  onClick={() => subjectReady && setMode('간단')}
                />
                <ModeCard
                  on={mode === '심화'}
                  title="심화"
                  desc="단원부터 루브릭까지 직접 채웁니다. 약 40분"
                  onClick={() => setMode('심화')}
                />
              </div>
              <button
                className="btn"
                onClick={() => {
                  setModal(false)
                  newPlan(subjectReady ? mode : '심화')
                }}
              >
                시작
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ModeCard({
  on,
  title,
  desc,
  onClick,
  disabled,
  disabledNote,
}: {
  on: boolean
  title: string
  desc: string
  onClick: () => void
  disabled?: boolean
  disabledNote?: string
}) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-box ${
        disabled
          ? 'cursor-not-allowed border border-line bg-surface-off px-[21px] py-5 opacity-70'
          : on
            ? 'cursor-pointer border-2 border-navy px-[21px] py-[19px]'
            : 'cursor-pointer border border-line px-[21px] py-5 hover:border-navy-line-hover'
      }`}
    >
      <span className={`text-[17px] font-semibold ${on && !disabled ? 'text-navy' : ''}`}>
        {title}
      </span>
      <span
        className={`text-sm leading-relaxed ${on && !disabled ? 'text-navy-mid' : 'text-ink-2'}`}
      >
        {disabled ? disabledNote : desc}
      </span>
    </div>
  )
}
