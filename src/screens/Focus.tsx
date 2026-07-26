'use client'

import type { ReactNode } from 'react'
import { Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { HUMAN_CHECKS } from '@/lib/validate'
import { classRange, monthWeekLabel, periodLabel, rubricMax, tiebreakOrder } from '@/lib/derive'
import type { SchoolLayer, SemesterPlan, Subject } from '@/types'

/** 화면 07 · 직접 확인 포커스 모드 */
export function Focus() {
  const { school, go, focusIndex, setFocusIndex, setHumanCheck, editPerf } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  if (!plan || !subject) return null

  const item = HUMAN_CHECKS[focusIndex]
  if (!item) {
    go('review')
    return null
  }
  const done = HUMAN_CHECKS.filter((c) => plan.human_checks[c.id]).length

  const next = () => {
    setHumanCheck(item.id, true)
    const remaining = HUMAN_CHECKS.findIndex((c, i) => i !== focusIndex && !plan.human_checks[c.id])
    if (remaining < 0) go('review')
    else setFocusIndex(remaining)
  }

  return (
    <Screen
      eyebrow="화면 07 · 직접 확인 포커스 모드"
      title={`직접 확인 · ${done} / ${HUMAN_CHECKS.length}`}
      right={
        <a className="text-sm text-ink-2" onClick={() => go('review')}>
          검토로 돌아가기
        </a>
      }
      bodyClass="gap-7 max-w-[980px] pt-6"
    >
      <div className="flex gap-1.5">
        {HUMAN_CHECKS.map((c, i) => (
          <span
            key={c.id}
            className={`h-1 flex-1 rounded-sm ${
              plan.human_checks[c.id] ? 'bg-ink-5' : i === focusIndex ? 'bg-navy' : 'bg-line'
            }`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-5 rounded-box border-2 border-navy p-8">
        <div className="text-[22px] leading-normal font-semibold">{item.label} 확인하세요</div>
        <CheckBody id={item.id} plan={plan} subject={subject} school={school} />
      </div>

      <div className="flex items-center gap-6">
        <button className="btn" onClick={next}>
          확인하고 다음
        </button>
        <a
          className="text-sm text-ink-2"
          onClick={() => {
            if (item.id === 'rubric' && plan.performances[0]) editPerf(plan.performances[0].id)
            else if (item.id === 'unit-match') go('units')
            else if (item.id === 'distribution') go('schedule')
            else go('setup')
          }}
        >
          고치기
        </a>
      </div>
    </Screen>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 text-[15px] leading-loose">
      <span className="w-36 shrink-0 text-ink-2">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function CheckBody({
  id,
  plan,
  subject,
  school,
}: {
  id: string
  plan: SemesterPlan
  subject: Subject
  school: SchoolLayer
}) {
  const box = 'flex flex-col gap-3 pt-1'

  if (id === 'unit-match') {
    const bad = subject.units.filter((u) => u.standard_codes.length === 0)
    return (
      <div className={box}>
        <div className="text-sm text-ink-2">
          단원 {subject.units.length}개 · 성취기준이 없는 단원 {bad.length}개
        </div>
        <div className="flex flex-col gap-2 text-[15px]">
          {subject.units.slice(0, 8).map((u) => (
            <div key={u.id}>
              <span className="mr-2.5 font-semibold text-navy-mid">{u.name}</span>
              {u.standard_codes.join(' · ') || <span className="text-red">매칭 없음</span>}
            </div>
          ))}
          {subject.units.length > 8 && (
            <div className="text-ink-3">… 외 {subject.units.length - 8}개</div>
          )}
        </div>
      </div>
    )
  }

  if (id === 'distribution') {
    const ordered = [...subject.units].sort((a, b) => a.order - b.order)
    const label = (uid: string) =>
      String(ordered.findIndex((u) => u.id === uid) + 1).padStart(2, '0')
    return (
      <div className={box}>
        <div className="flex flex-col gap-1.5 text-[15px]">
          {school.calendar.weeks.map((w) => (
            <div key={w.no} className="flex gap-4">
              <span className="w-[190px] shrink-0 text-ink-2">
                {w.no}주 · {monthWeekLabel(school, w.no)} · {periodLabel(w)}
              </span>
              <span className={w.is_exam ? 'font-semibold text-navy' : ''}>
                {w.is_exam
                  ? `${plan.exams.find((e) => e.week === w.no)?.no ?? ''}회 정기시험`
                  : (plan.distribution[w.no] ?? []).map(label).join(' · ') || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (id === 'rubric') {
    return (
      <div className={box}>
        {plan.performances.map((p) => (
          <div key={p.id} className="flex flex-col gap-3">
            <div className="text-sm text-ink-2">
              {p.name || '(이름 없음)'} · 배점 합 {rubricMax(p)}점 · 기본점수 {p.base_score}점
            </div>
            {p.rubric.length === 0 && <div className="text-[15px] text-red">루브릭이 없습니다</div>}
            {p.rubric.map((r) => (
              <div key={r.id} className="flex flex-col gap-2">
                <div className="text-[15px] font-semibold">{r.element || '(요소 이름 없음)'}</div>
                <div className="flex flex-col gap-2 text-base leading-loose">
                  {r.levels.map((lv, i) => (
                    <div key={i}>
                      <span className="mr-2.5 font-semibold text-navy-mid">{lv.score}점</span>
                      {lv.text || <span className="text-red">기준 서술 비어 있음</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (id === 'section-i-ii') {
    return (
      <div className={box}>
        <Line label="Ⅰ 교수학습">{subject.teaching_plan || '(비어 있음)'}</Line>
        <Line label="Ⅱ 평가의 목적">{subject.objectives || '(비어 있음)'}</Line>
      </div>
    )
  }

  if (id === 'teachers') {
    return (
      <div className={box}>
        <Line label="지도교사">{plan.teachers.join(', ') || '(비어 있음)'}</Line>
        <Line label="담당 학급">
          {plan.grade}학년 {classRange(school, plan.grade) || '(반 수 미설정)'}
        </Line>
        <Line label="Ⅰ 표 분할 수">{plan.teachers.length}명 기준</Line>
      </div>
    )
  }

  if (id === 'exam-items') {
    return (
      <div className={box}>
        {plan.exams.length === 0 && <div className="text-[15px]">정기시험이 없습니다</div>}
        {plan.exams.map((e) => (
          <Line key={e.no} label={`${e.no}회 · ${e.week}주`}>
            {e.parts.map((p) => `${p.kind} ${p.count}문항 ${p.points}점`).join(' · ')}
          </Line>
        ))}
      </div>
    )
  }

  if (id === 'split-score') {
    return (
      <div className={box}>
        <Line label="분할점수 방식">{plan.split_score_type}</Line>
        <Line label="동점자 처리 순서">{tiebreakOrder(plan).join(' → ')}</Line>
        <Line label="학교 지침">{school.rules.guideline_name}</Line>
      </div>
    )
  }

  if (id === 'meeting-date') {
    const exam = plan.exams[0]
    return (
      <div className={box}>
        <Line label="1회 정기시험">
          {exam ? `${exam.week}주 · ${monthWeekLabel(school, exam.week)}` : '없음'}
        </Line>
        <Line label="학기 기간">
          {periodLabel(school.calendar.weeks[0])} ~{' '}
          {periodLabel(school.calendar.weeks[school.calendar.weeks.length - 1])}
        </Line>
        <Line label="주요 행사">
          {school.calendar.weeks
            .filter((w) => w.events.length > 0)
            .map((w) => `${w.no}주 ${w.events.join(', ')}`)
            .join(' · ')}
        </Line>
      </div>
    )
  }

  // absent · appeal — 문장 은행에서 뽑아 보여준다
  return (
    <div className={box}>
      <div className="text-sm text-ink-2">문장 은행 {id === 'absent' ? 'Ⅷ' : 'Ⅸ'} 항목</div>
      <div className="flex flex-col gap-2 text-base leading-loose">
        {school.sentences
          .filter((s) => s.section === (id === 'absent' ? 'Ⅷ' : 'Ⅸ'))
          .sort((a, b) => a.order - b.order)
          .map((s) => (
            <div key={s.id}>{s.text}</div>
          ))}
      </div>
    </div>
  )
}
