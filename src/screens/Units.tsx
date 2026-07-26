'use client'

import { useRef, useState } from 'react'
import { PlanHeaderTitle, Screen, SeedBanner, Section, StepBar } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { applyImport, extractSubject, listSubjects, readWorkbook } from '@/lib/importStandards'

/** 화면 02 · 단원 매핑 */
export function Units() {
  const { go, patchPlan, patchSubject, setUnitStandards, redistribute } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [open, setOpen] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!plan || !subject) return null

  const assigned = new Set(subject.units.flatMap((u) => u.standard_codes))
  const unassigned = subject.standards.filter((s) => !assigned.has(s.code))
  const areaName = (no: string | null) => subject.areas.find((a) => a.no === no)?.name ?? '—'

  const onFile = async (file: File) => {
    setImportError(null)
    try {
      const wb = await readWorkbook(file)
      const names = listSubjects(wb)
      const hit =
        names.find((n) => n === subject.name) ??
        names.find((n) => n.replace(/\s/g, '') === subject.name.replace(/\s/g, ''))
      if (!hit) {
        setImportError(
          `파일에 '${subject.name}' 과목이 없습니다. 과목명을 파일과 똑같이 맞춰 주세요. (${names.length}개 과목 발견)`,
        )
        return
      }
      patchSubject(applyImport(subject, extractSubject(wb, hit)))
    } catch (e) {
      setImportError(e instanceof Error ? e.message : '파일을 읽지 못했습니다')
    }
  }

  return (
    <Screen
      eyebrow="화면 02 · 단원 매핑"
      title={<PlanHeaderTitle />}
      right={<StepBar current="units" />}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />

      {(subject.standards.length === 0 || subject.standards.some((s) => !s.text)) && (
        <SeedBanner onImport={() => fileRef.current?.click()} />
      )}
      {subject.standards.length > 0 && subject.standards.every((s) => !!s.text) && (
        <div className="flex items-center justify-between gap-5 text-[13px] text-ink-3">
          <span>
            성취기준 {subject.standards.length}개 · 고등학교_성취기준_2022.xlsx에서 불러온 값입니다
          </span>
          <a onClick={() => fileRef.current?.click()}>다른 과목으로 바꾸기</a>
        </div>
      )}
      {importError && <div className="notice-err text-sm text-red-ink">{importError}</div>}

      {unassigned.length > 0 && (
        <div className="notice-err flex flex-col gap-3.5 px-7 py-6">
          <div className="text-[19px] font-semibold text-red">
            배정되지 않은 성취기준 {unassigned.length}개
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((s) => (
              <span key={s.code} className="chip chip-err">
                {s.code}
              </span>
            ))}
          </div>
          <div className="max-w-[640px] text-sm leading-relaxed text-red-ink">
            배정되지 않은 성취기준은 진도표와 수행평가 표에서 빠집니다. 아래 목록에서 해당 단원을
            눌러 배정하세요.
          </div>
        </div>
      )}

      <Section title="단원 목록" aside="행을 누르면 성취기준을 고칠 수 있습니다">
        <div className="list">
          <div className="list-head grid grid-cols-[230px_1fr_380px] gap-6">
            <div>영역</div>
            <div>단원명</div>
            <div>성취기준</div>
          </div>

          {subject.units
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((u) => {
              const bad = u.standard_codes.length === 0
              const expanded = open === u.id
              return (
                <div key={u.id}>
                  <div
                    className={`grid cursor-pointer grid-cols-[230px_1fr_380px] items-center gap-6 border-b px-6 py-4 ${
                      bad
                        ? 'border-red-line bg-red-bg hover:bg-red-hover'
                        : 'border-line-soft hover:bg-surface-sub'
                    }`}
                    onClick={() => setOpen(expanded ? null : u.id)}
                  >
                    <div className={`text-sm ${bad ? 'text-red-ink' : 'text-ink-2'}`}>
                      {areaName(u.area_no)}
                    </div>
                    <div className={`text-[15px] ${bad ? 'font-medium text-red' : ''}`}>
                      {u.name}
                    </div>
                    {u.standard_codes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {u.standard_codes.map((c) => (
                          <span key={c} className="chip chip-tag">
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-red">매칭 실패 · 성취기준을 직접 고르세요</div>
                    )}
                  </div>

                  {expanded && (
                    <div className="flex flex-col gap-3 border-b border-line-soft bg-surface-sub px-6 pt-5 pb-6">
                      <div className="text-[13px] text-ink-2">
                        {u.name}에 배정할 성취기준을 고르세요
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {subject.standards.map((s) => {
                          const on = u.standard_codes.includes(s.code)
                          const elsewhere =
                            !on && subject.units.some((x) => x.standard_codes.includes(s.code))
                          return (
                            <span
                              key={s.code}
                              className={`chip ${on ? 'chip-on' : ''} ${elsewhere ? 'opacity-45' : ''}`}
                              title={s.text || '본문 없음 · xlsx를 불러오세요'}
                              onClick={() =>
                                setUnitStandards(
                                  u.id,
                                  on
                                    ? u.standard_codes.filter((c) => c !== s.code)
                                    : [...u.standard_codes, s.code],
                                )
                              }
                            >
                              {s.code}
                            </span>
                          )
                        })}
                      </div>
                      <div className="hint">흐린 칩은 다른 단원에 이미 배정된 성취기준입니다</div>
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        <div className="text-[13px] text-ink-2">
          단원 {subject.units.length}개 · 성취기준 {subject.standards.length}개 중{' '}
          {subject.standards.length - unassigned.length}개 배정
        </div>
      </Section>

      <div className="flex items-center gap-5 pt-1">
        <button
          className="btn"
          onClick={() => {
            patchPlan({ step: Math.max(plan.step, 3) })
            redistribute()
            go('schedule')
          }}
        >
          다음
        </button>
        <span className="text-[13px] text-ink-2">
          배정되지 않은 성취기준이 있어도 넘어갈 수 있습니다
        </span>
      </div>
    </Screen>
  )
}
