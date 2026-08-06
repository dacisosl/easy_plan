'use client'

/**
 * 관리자 — 담당자가 연 1회 세팅하는 학교 레이어.
 *
 *  ① 학사일정: 학기별 주차(시작·종료·수업일수·행사·정기시험 주)
 *  ② 예정시간 배포표: 주당 이수시간별 주차 예정시간 — 양식 메모7이 요구하는 값
 *  ③ 학교 규칙: 새 계획서의 기본값
 *
 * 여기 값이 바뀌면 진도 배분·월 주차 라벨·진도표 예정시간이 전부 따라 움직인다.
 */

import { useState } from 'react'
import { Portal, Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'
import { scheduledHours, weeksOf } from '@/lib/derive'
import { getModelKey, setModelKey, testModelKey } from '@/lib/generateClient'
import { publishSchool, signInAdminEmail, signInAdminGoogle, syncReady } from '@/lib/schoolSync'
import type { AcademicCalendar, Week } from '@/types'

type Tab = 'calendar' | 'hours' | 'rules'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'calendar', label: '학사일정', hint: '주차 · 수업일수 · 정기시험 주' },
  { id: 'hours', label: '예정시간 배포표', hint: '주당 이수시간별 주차 예정시간' },
  { id: 'rules', label: '학교 규칙', hint: '새 계획서의 기본값' },
]

/** 배포표에서 다룰 주당 이수시간 */
const CREDITS = [1, 2, 3, 4, 5]

export function Admin() {
  const { school, patchSchool, go } = usePlanStore()
  const [tab, setTab] = useState<Tab>('calendar')
  const [semester, setSemester] = useState<1 | 2>(1)

  const patchCalendar = (next: AcademicCalendar) =>
    patchSchool({
      calendars: school.calendars.map((c) => (c.semester === next.semester ? next : c)),
    })

  const patchWeek = (no: number, patch: Partial<Week>) => {
    const cal = school.calendars.find((c) => c.semester === semester)
    if (!cal) return
    patchCalendar({ ...cal, weeks: cal.weeks.map((w) => (w.no === no ? { ...w, ...patch } : w)) })
  }

  return (
    <Screen
      title="관리자"
      subtitle="담당자가 연 1회 세팅합니다 — 모든 계획서가 이 값을 씁니다"
      right={
        <button className="btn btn-sm btn-ghost" onClick={() => go('home')}>
          작성으로 돌아가기
        </button>
      }
    >
      <div className="flex gap-1 overflow-x-auto border-b border-line-soft">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={`cursor-pointer border-0 border-b-2 bg-transparent px-4 py-2.5 text-sm ${
              tab === t.id
                ? 'border-navy font-semibold text-navy'
                : 'border-transparent text-ink-3 hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {syncReady && <PublishBar />}

      {tab === 'calendar' && (
        <CalendarTab
          semester={semester}
          setSemester={setSemester}
          calendars={school.calendars}
          onPatchWeek={patchWeek}
          onPatchCalendar={patchCalendar}
        />
      )}
      {tab === 'hours' && <HoursTab />}
      {tab === 'rules' && <RulesTab />}
    </Screen>
  )
}

/* ── 게시 — 여기서 바꾼 설정을 전 교사에게 ─────── */

/**
 * 관리자 수정은 이 브라우저에만 저장된다(정적 호스팅 — 서버가 없다).
 * '게시'를 눌러야 Firestore 공유본에 올라가고, 그때부터 모든 교사가
 * 앱을 열 때 그 값을 받아 시작한다. 게시에는 관리자 로그인이 필요하다 —
 * 누가 게시할 수 있는지는 서버 규칙(firestore.rules)이 이메일로 판별한다.
 */
function PublishBar() {
  const { school, school_dirty, markSchoolPublished } = usePlanStore()
  const [busy, setBusy] = useState(false)
  const [login, setLogin] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const publish = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await publishSchool(school)
      markSchoolPublished()
      setMsg({ ok: true, text: '게시했습니다 — 모든 선생님이 다음 접속부터 이 설정을 씁니다' })
    } catch (e) {
      const m = e instanceof Error ? e.message : '게시하지 못했습니다'
      if (m === '로그인이 필요합니다') setLogin(true)
      else setMsg({ ok: false, text: m })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-box border px-4 py-3 ${
        school_dirty ? 'border-amber-line bg-amber-bg' : 'border-line-card bg-surface-sub'
      }`}
    >
      <span className="text-[13px] leading-relaxed text-ink-2">
        {school_dirty ? (
          <>
            <b className="text-amber">게시 안 된 변경이 있습니다</b> — 이 브라우저에만 저장된
            상태입니다. 게시해야 모든 선생님에게 반영됩니다.
          </>
        ) : (
          '여기서 바꾼 설정은 게시를 눌러야 모든 선생님에게 공유됩니다.'
        )}
        {msg && (
          <span className={`ml-2 font-semibold ${msg.ok ? 'text-navy' : 'text-red'}`}>
            {msg.text}
          </span>
        )}
      </span>
      <button className="btn btn-sm shrink-0" disabled={busy} onClick={publish}>
        {busy ? '게시 중…' : '모든 선생님에게 게시'}
      </button>

      {login && (
        <PublishLogin
          onDone={() => {
            setLogin(false)
            void publish()
          }}
          onClose={() => setLogin(false)}
        />
      )}
    </div>
  )
}

/** 게시용 관리자 로그인 — 구글 또는 콘솔에서 만든 관리 계정 */
function PublishLogin({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'google' | 'email', job: () => Promise<string>) => {
    setError(null)
    setBusy(kind)
    try {
      await job()
      onDone()
    } catch (e) {
      const m = e instanceof Error ? e.message : '로그인에 실패했습니다'
      // 창을 닫은 것은 오류가 아니다
      setError(/popup-closed|cancelled/i.test(m) ? null : m)
      setBusy(null)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,28,36,0.35)] p-4"
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-[360px] flex-col gap-4 rounded-card bg-surface p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1">
            <span className="text-base font-semibold">게시하려면 관리자 로그인</span>
            <span className="text-[12.5px] text-ink-3">게시 권한은 관리자 계정에만 있습니다.</span>
          </div>
          {error && (
            <p className="rounded-control border border-red-line bg-red-bg px-3 py-2 text-[13px] text-red-ink">
              {error}
            </p>
          )}
          <button
            className="btn btn-ghost"
            disabled={busy !== null}
            onClick={() => run('google', signInAdminGoogle)}
          >
            {busy === 'google' ? '로그인 중…' : '구글로 로그인'}
          </button>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (busy === null) void run('email', () => signInAdminEmail(email, password))
            }}
          >
            <input
              className="control"
              type="email"
              placeholder="관리 계정 이메일"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="control"
              type="password"
              placeholder="비밀번호"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="btn"
              type="submit"
              disabled={busy !== null || !email.includes('@') || password.length < 6}
            >
              {busy === 'email' ? '로그인 중…' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </Portal>
  )
}

/* ── ① 학사일정 ───────────────────────────────── */

function CalendarTab({
  semester,
  setSemester,
  calendars,
  onPatchWeek,
  onPatchCalendar,
}: {
  semester: 1 | 2
  setSemester: (s: 1 | 2) => void
  calendars: AcademicCalendar[]
  onPatchWeek: (no: number, patch: Partial<Week>) => void
  onPatchCalendar: (c: AcademicCalendar) => void
}) {
  const cal = calendars.find((c) => c.semester === semester)
  if (!cal) return <p className="text-sm text-ink-2">{semester}학기 학사일정이 없습니다.</p>

  const teaching = cal.weeks.filter((w) => !w.is_exam && w.class_days > 0).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex overflow-hidden rounded-control border border-line-input">
          {([1, 2] as const).map((s, i) => (
            <button
              key={s}
              onClick={() => setSemester(s)}
              className={`cursor-pointer px-4 py-2 text-sm ${i > 0 ? 'border-l border-line-input' : ''} ${
                semester === s ? 'bg-navy font-semibold text-white' : 'bg-transparent text-ink-2'
              }`}
            >
              {s}학기
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          학년도
          <input
            className="control h-9 w-24"
            type="number"
            value={cal.year}
            onChange={(e) => onPatchCalendar({ ...cal, year: Number(e.target.value) || cal.year })}
          />
        </label>
        <span className="text-[13px] text-ink-3">
          전체 {cal.weeks.length}주 · 수업 {teaching}주 · 정기시험{' '}
          {cal.weeks
            .filter((w) => w.is_exam)
            .map((w) => `${w.no}주`)
            .join(', ') || '없음'}
        </span>
      </div>

      <div className="list overflow-x-auto">
        <div className="list-head grid min-w-[720px] grid-cols-[56px_130px_130px_90px_1fr_90px] gap-3">
          <div>주</div>
          <div>시작</div>
          <div>종료</div>
          <div>수업일수</div>
          <div>행사</div>
          <div>정기시험</div>
        </div>
        {cal.weeks.map((w) => (
          <div
            key={w.no}
            className="grid min-w-[720px] grid-cols-[56px_130px_130px_90px_1fr_90px] items-center gap-3 border-b border-line-soft px-6 py-2 last:border-b-0"
          >
            <span className="text-sm text-ink-2">{w.no}주</span>
            <input
              className="control h-9"
              type="date"
              value={w.start}
              onChange={(e) => onPatchWeek(w.no, { start: e.target.value })}
            />
            <input
              className="control h-9"
              type="date"
              value={w.end}
              onChange={(e) => onPatchWeek(w.no, { end: e.target.value })}
            />
            <input
              className="control h-9 text-center"
              type="number"
              min={0}
              max={5}
              value={w.class_days}
              onChange={(e) => onPatchWeek(w.no, { class_days: Number(e.target.value) || 0 })}
            />
            <input
              className="control h-9"
              value={w.events.join(', ')}
              placeholder="—"
              onChange={(e) =>
                onPatchWeek(w.no, {
                  events: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={w.is_exam}
                onChange={(e) => onPatchWeek(w.no, { is_exam: e.target.checked })}
              />
              시험
            </label>
          </div>
        ))}
      </div>
      <p className="hint">
        정기시험 주로 표시한 주는 진도 배분에서 빠지고, 새 계획서의 시험 주차가 여기서 나옵니다.
      </p>
    </div>
  )
}

/* ── ② 예정시간 배포표 ────────────────────────── */

function HoursTab() {
  const { school, patchSchool } = usePlanStore()
  const [semester, setSemester] = useState<1 | 2>(1)
  const weeks = weeksOf(school, semester)

  const setValue = (credit: number, index: number, value: string) => {
    const current =
      school.hourly_tables?.[credit] ??
      scheduledHours(school, semester, credit).map((h) => h.planned)
    const next = [...current]
    next[index] = Number(value) || 0
    patchSchool({ hourly_tables: { ...(school.hourly_tables ?? {}), [credit]: next } })
  }

  const clear = (credit: number) => {
    const rest = { ...(school.hourly_tables ?? {}) }
    delete rest[credit]
    patchSchool({ hourly_tables: rest })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="notice-info text-sm text-navy-mid">
        양식 메모: &ldquo;주당 이수시간별로 배포해드린 표를 활용해주세요&rdquo;. 배포표 값을 넣으면
        진도표의 예정시간·실시누계가 그 값으로 나갑니다. 비워 두면 수업일수로 계산합니다(회색).
      </div>

      <div className="flex overflow-hidden rounded-control border border-line-input w-fit">
        {([1, 2] as const).map((s, i) => (
          <button
            key={s}
            onClick={() => setSemester(s)}
            className={`cursor-pointer px-4 py-2 text-sm ${i > 0 ? 'border-l border-line-input' : ''} ${
              semester === s ? 'bg-navy font-semibold text-white' : 'bg-transparent text-ink-2'
            }`}
          >
            {s}학기
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 border border-line bg-surface-sub px-3 py-2 text-left">
                시수 \ 주
              </th>
              {weeks.map((w) => (
                <th key={w.no} className="border border-line bg-surface-sub px-2 py-2 font-normal">
                  {w.no}
                </th>
              ))}
              <th className="border border-line bg-surface-sub px-3 py-2">누계</th>
              <th className="border border-line bg-surface-sub px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {CREDITS.map((credit) => {
              const custom = school.hourly_tables?.[credit]
              const calc = scheduledHours(school, semester, credit)
              const total = weeks.reduce(
                (s, _w, i) => s + (custom?.[i] ?? calc[i]?.planned ?? 0),
                0,
              )
              return (
                <tr key={credit}>
                  <th className="sticky left-0 border border-line bg-surface-sub px-3 py-1.5 text-left font-normal">
                    {credit}시간
                  </th>
                  {weeks.map((w, i) => (
                    <td key={w.no} className="border border-line p-0">
                      <input
                        className={`h-8 w-12 border-0 bg-transparent text-center text-[13px] ${
                          custom ? 'text-ink' : 'text-ink-4'
                        }`}
                        value={custom?.[i] ?? calc[i]?.planned ?? 0}
                        onChange={(e) => setValue(credit, i, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="border border-line px-3 py-1.5 text-center">{total}</td>
                  <td className="border border-line px-2 py-1.5 text-center">
                    {custom && (
                      <a className="text-[12px]" onClick={() => clear(credit)}>
                        계산값으로
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        회색 숫자는 계산값입니다. 칸을 고치면 그 시수 줄 전체가 배포표 값이 됩니다.
      </p>
    </div>
  )
}

/* ── ③ 학교 규칙 ──────────────────────────────── */

function RulesTab() {
  const { school, patchSchool } = usePlanStore()
  const r = school.rules
  const set = (patch: Partial<typeof r>) => patchSchool({ rules: { ...r, ...patch } })

  const NUM: { key: keyof typeof r; label: string; hint?: string }[] = [
    { key: 'exam_ratio', label: '정기시험 비율 (%)', hint: '새 계획서의 기본값' },
    { key: 'perf_ratio', label: '수행평가 비율 (%)', hint: '새 계획서의 기본값' },
    { key: 'perf_area_max', label: '수행평가 한 영역 상한 (%)' },
    { key: 'essay_min', label: '서술·논술 하한 (%)' },
    { key: 'base_score_min', label: '기본점수 하한 (만점 대비 %)' },
    { key: 'base_score_max', label: '기본점수 상한 (만점 대비 %)' },
    { key: 'standards_per_perf_max', label: '수행평가별 성취기준 한도', hint: '나이스 입력 한도' },
    { key: 'perf_name_maxlen', label: '수행평가명 길이 (자)' },
    { key: 'notice_lead_weeks', label: '안내 주 역산 (주)' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {NUM.map((f) => (
          <label key={String(f.key)} className="flex flex-col gap-2">
            <span className="label">{f.label}</span>
            <input
              className="control"
              type="number"
              value={r[f.key] as number}
              onChange={(e) => set({ [f.key]: Number(e.target.value) || 0 } as Partial<typeof r>)}
            />
            {f.hint && <span className="hint">{f.hint}</span>}
          </label>
        ))}
      </div>

      <label className="flex max-w-[560px] flex-col gap-2">
        <span className="label">시행 지침 명칭</span>
        <input
          className="control"
          value={r.guideline_name}
          onChange={(e) => set({ guideline_name: e.target.value })}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="label">학년별 반 수</span>
        <div className="flex gap-3">
          {[1, 2, 3].map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm">
              {g}학년
              <input
                className="control h-9 w-20"
                type="number"
                value={r.classes_by_grade[g] ?? 0}
                onChange={(e) =>
                  set({
                    classes_by_grade: {
                      ...r.classes_by_grade,
                      [g]: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <label className="flex max-w-[560px] flex-col gap-2">
        <span className="label">월 기준 주차 표기</span>
        <select
          className="control"
          value={r.month_week_rule}
          onChange={(e) =>
            set({ month_week_rule: e.target.value as 'start' | 'form_example' | 'thursday' })
          }
        >
          <option value="thursday">목요일이 속한 달 기준 (학교 확정 규칙)</option>
          <option value="start">시작일이 속한 달 기준</option>
          <option value="form_example">1일이 낀 주 = 1주 (배포 양식 예시)</option>
        </select>
        <span className="hint">
          같은 주라도 라벨이 한 주씩 밀립니다. 예: 6.29~7.3 주는 목요일 기준 7월 1주, 시작일 기준
          6월 5주.
        </span>
      </label>

      <ModelKeySection />
    </div>
  )
}

/* ── AI 문안 키 (선택) ─────────────────────────── */

/**
 * OpenRouter API 키 — 넣으면 문안 초안을 AI가 다듬는다.
 *
 * 키는 **이 브라우저에만** 저장된다. 서버가 없으니 어디에도 모이지 않고
 * OpenRouter로만 전송된다. 비우고 저장하면 지워진다.
 * 공용 컴퓨터라면 쓰고 나서 지우는 것이 안전하다.
 */
function ModelKeySection() {
  const [key, setKey] = useState(getModelKey())
  const [saved, setSaved] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<string | null>(null)

  const save = () => {
    setModelKey(key)
    setSaved(true)
    setCheckResult(null)
    setTimeout(() => setSaved(false), 1800)
  }

  const check = async () => {
    setChecking(true)
    setCheckResult(null)
    const err = await testModelKey(key)
    setCheckResult(err ?? 'ok')
    setChecking(false)
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-2 border-t border-line-soft pt-5">
      <span className="label">AI 문안 (선택) — OpenRouter API 키</span>
      <div className="flex gap-2">
        <input
          className="control flex-1"
          type="password"
          placeholder="sk-or-…  (비우고 저장하면 지워집니다)"
          value={key}
          autoComplete="off"
          onChange={(e) => setKey(e.target.value)}
        />
        <button className="btn btn-sm shrink-0" onClick={save}>
          {saved ? '저장됨 ✓' : '저장'}
        </button>
        <button className="btn btn-sm btn-ghost shrink-0" onClick={check} disabled={checking}>
          {checking ? '확인 중…' : '연결 확인'}
        </button>
      </div>
      {checkResult && (
        <span className={`text-[13px] ${checkResult === 'ok' ? 'text-navy' : 'text-red'}`}>
          {checkResult === 'ok' ? '연결됐습니다 — 문안 초안을 AI가 다듬습니다' : checkResult}
        </span>
      )}
      <span className="hint">
        키가 있으면 문안 초안(Ⅱ·Ⅲ·주안점·성취수준)을 AI가 과목에 맞게 쓰고, 없으면 기본 문구로
        만듭니다 — 어느 쪽이든 계획서는 완성됩니다. 키는 이 브라우저에만 저장되고 OpenRouter로만
        전송됩니다. 공용 컴퓨터라면 쓰고 나서 지워 주세요.
      </span>
    </div>
  )
}
