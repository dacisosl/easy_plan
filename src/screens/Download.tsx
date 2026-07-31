'use client'

/**
 * 내려받기 — 요약 + 문안 초안 상태 + hwpx 다운로드.
 *
 * 초안이 없거나 입력이 바뀌었으면 generating을 먼저 거친다.
 * 조립도 초안도 브라우저 안에서 끝난다 — 서버가 없다(정적 호스팅).
 */

import { useState } from 'react'
import { ColorKey, PlanSubtitle, Portal, Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { RULE_COUNT, validate } from '@/lib/validate'
import { weeksOf } from '@/lib/derive'
import { generateDraft } from '@/lib/generateClient'

export function Download() {
  const { school, go, setAiDraft, focusOn, confirmPerfProgress } = usePlanStore()
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === s.currentPlanId))
  const subject = usePlanStore((s) => {
    const p = s.plans.find((x) => x.id === s.currentPlanId)
    return p ? s.subjects.find((x) => x.id === p.subject_id) : undefined
  })
  const [busy, setBusy] = useState(false)
  /* 내려받기 전 마지막 안내 — 문서에서 사람 몫이 무엇인지 한 번은 말하고 보낸다 */
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [regen, setRegen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  if (!plan || !subject) return null

  const result = validate(plan, subject, school)
  const assigned = new Set(subject.units.flatMap((u) => u.standard_codes))
  const perfSum = plan.performances.reduce((s, p) => s + p.ratio, 0)
  const fileName = `${subject.name}_${plan.semester}학기_계획서.hwpx`
  const ai = plan.ai

  /*
   * 한글 파일을 **브라우저에서** 조립한다 — 서버가 없다(정적 호스팅).
   * 양식을 받아 와 renderForm을 그대로 돌린다. 계획서 데이터가 어디로도
   * 전송되지 않는다는 뜻이기도 하다.
   */
  const download = async () => {
    if (!ai) return go('generating')
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      const tpl = await fetch('/form_2026.hwpx')
      if (!tpl.ok) throw new Error('양식 파일을 불러오지 못했습니다')
      const template = new Uint8Array(await tpl.arrayBuffer())

      // 조립 코드는 무겁다(잘라서 필요할 때만 싣는다)
      const { renderForm } = await import('@/lib/hwpx/renderForm')
      const { bytes, report } = await renderForm(template, plan, subject, school, ai)
      setWarnings(report.warnings)

      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/hwp+zip' }),
      )
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
          <span className="sec-title">문안 초안</span>
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
              {new Date(ai.created_at).toLocaleString('ko-KR')} 생성 — 문서의 빨간 글씨는 자동
              문안이니 읽고 다듬어 주세요
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
            onClick={() => (ai ? setConfirmOpen(true) : go('generating'))}
          >
            {busy ? '만드는 중…' : `${fileName} 내려받기`}
          </button>

          {confirmOpen && (
            <DownloadNotice
              onConfirm={() => {
                setConfirmOpen(false)
                void download()
              }}
              onClose={() => setConfirmOpen(false)}
            />
          )}
        </div>
        <ColorKey />
        <span className="hint">
          한글 2020 이상에서 열립니다 · 빨간 글씨(자동 문안)를 읽고 검정으로 바꾸며 검토하세요 ·
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

/**
 * 내려받기 전 안내 — 일부러 크게 만든 모달.
 *
 * 문서가 자동으로 나오니 다 끝난 줄 알기 쉽다. 어디까지가 도구 몫이고
 * 어디부터가 사람 몫인지, 내려받는 순간에 못 지나치게 큼직하게 말한다.
 */
function DownloadNotice({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,28,36,0.45)] p-4 sm:p-6"
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-[540px] flex-col gap-6 rounded-card bg-surface p-7 sm:p-9"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[21px] font-semibold tracking-[-0.01em] text-ink sm:text-[23px]">
            내려받기 전에 꼭 확인하세요
          </span>

          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[14px] font-bold text-white">
                1
              </span>
              <p className="text-[16px] leading-relaxed break-keep text-ink sm:text-[17px]">
                AI로 생성한 초안(<b className="text-red">빨간 글씨</b>)은{' '}
                <b>반드시 검토해 주세요.</b>
              </p>
            </div>
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[14px] font-bold text-white">
                2
              </span>
              <p className="text-[16px] leading-relaxed break-keep text-ink sm:text-[17px]">
                수행평가 <b>루브릭</b>은 한글에서 <b>직접 편집·작성</b>해야 합니다.
              </p>
            </div>
          </div>

          <div className="mt-1 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
            <button className="btn btn-lg px-9" autoFocus onClick={onConfirm}>
              확인했어요 · 내려받기
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
