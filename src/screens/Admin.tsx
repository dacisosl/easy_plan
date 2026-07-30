'use client'

/**
 * 관리자 — 담당자가 연 1회 세팅하는 학교 레이어.
 *
 *  ① 학사일정: 학기별 주차(시작·종료·수업일수·행사·정기시험 주)
 *  ② 예정시간 배포표: 주당 이수시간별 주차 예정시간 — 양식 메모7이 요구하는 값
 *  ③ 학교 규칙: 새 계획서의 기본값
 *  ④ 사용자 승인: 누구에게 AI 문안을 열어 줄지 (관리자에게만 보인다)
 *
 * 여기 값이 바뀌면 진도 배분·월 주차 라벨·진도표 예정시간이 전부 따라 움직인다.
 */

import { useEffect, useState } from 'react'
import { Screen } from '@/components/ui'
import { useMe } from '@/components/AuthGate'
import { signInWithEmail, signInWithGoogle, signOutEverywhere } from '@/lib/firebase/client'
import { usePlanStore } from '@/store/usePlanStore'
import { scheduledHours, weeksOf } from '@/lib/derive'
import type { AcademicCalendar, Week } from '@/types'

type Tab = 'calendar' | 'hours' | 'rules' | 'users'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'calendar', label: '학사일정', hint: '주차 · 수업일수 · 정기시험 주' },
  { id: 'hours', label: '예정시간 배포표', hint: '주당 이수시간별 주차 예정시간' },
  { id: 'rules', label: '학교 규칙', hint: '새 계획서의 기본값' },
]

const USERS_TAB = { id: 'users' as Tab, label: '사용자 승인', hint: 'AI 문안을 쓸 사람 정하기' }

/** 배포표에서 다룰 주당 이수시간 */
const CREDITS = [1, 2, 3, 4, 5]

export function Admin() {
  const { school, patchSchool, go } = usePlanStore()
  const me = useMe()
  const [tab, setTab] = useState<Tab>('calendar')
  const [semester, setSemester] = useState<1 | 2>(1)

  // 승인 탭은 관리자에게만 보인다. 숨기는 것은 예의일 뿐이고, 실제 자물쇠는 서버에 있다
  const tabs = me?.admin ? [...TABS, USERS_TAB] : TABS

  /*
   * 관리자 화면 전체를 관리자 인증 뒤에 둔다. 여기서만 구글과 이메일 두 길을
   * 다 보여 준다 — 교사용 '해밀고 인증'은 구글 하나다. 길이 둘이면 묻게 된다.
   * 로컬(로그인 설정 없음)에서는 그냥 연다.
   */
  if (!me?.authDisabled && !me?.admin) {
    return <AdminAuth loggedInAs={me?.email ?? null} onBack={() => go('home')} />
  }

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
        {tabs.map((t) => (
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
      {tab === 'users' && <UsersTab myUid={me?.uid ?? ''} />}
    </Screen>
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
          onChange={(e) => set({ month_week_rule: e.target.value as 'start' | 'form_example' })}
        >
          <option value="start">시작일이 속한 달 기준</option>
          <option value="form_example">1일이 낀 주 = 1주 (배포 양식 예시)</option>
        </select>
        <span className="hint">
          같은 주라도 라벨이 한 주씩 밀립니다 — 담당자 확인이 필요한 항목입니다.
        </span>
      </label>
    </div>
  )
}

/* ── ④ 사용자 승인 ────────────────────────────── */

interface UserRow {
  uid: string
  email: string
  displayName: string | null
  googleName: string | null
  approved: boolean
  admin: boolean
  lastSeenAt: string | null
  approvedBy: string | null
}

/** '7월 30일 오후 2:15' 정도로 — 연도까지 적으면 표가 시끄럽다 */
function whenLabel(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/**
 * 들어온 사람들을 보여 주고 AI 문안 사용을 열어 준다.
 *
 * 승인은 '들어오는 문'이 아니다 — 승인 없이도 계획서를 짜고 한글 파일을 받을 수 있다.
 * 이 스위치가 여는 것은 학교 예산으로 도는 AI 문안 하나다. 화면에도 그렇게 적어 둔다.
 */
function UsersTab({ myUid }: { myUid: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 지금 저장 중인 사람 — 버튼을 두 번 누르는 것을 막는다 */
  const [busyUid, setBusyUid] = useState<string | null>(null)

  const load = () => {
    fetch('/api/admin/users')
      .then(async (r) => {
        const b = (await r.json()) as { users?: UserRow[]; error?: string }
        if (!r.ok) throw new Error(b.error ?? '명단을 가져오지 못했습니다')
        return b.users ?? []
      })
      .then(setUsers)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : '명단을 가져오지 못했습니다'),
      )
  }

  useEffect(load, [])

  const toggle = async (u: UserRow) => {
    setError(null)
    setBusyUid(u.uid)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: u.uid, approved: !u.approved }),
      })
      const b = (await res.json()) as { users?: UserRow[]; error?: string }
      if (!res.ok) throw new Error(b.error ?? '저장하지 못했습니다')
      setUsers(b.users ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setBusyUid(null)
    }
  }

  if (error) {
    return (
      <p className="rounded-control border border-red-line bg-red-bg px-4 py-3 text-[13.5px] leading-relaxed text-red-ink">
        {error}
      </p>
    )
  }
  if (!users) return <p className="hint">명단을 가져오는 중…</p>

  const waiting = users.filter((u) => !u.approved).length

  return (
    <div className="flex flex-col gap-4">
      <p className="hint max-w-[620px] leading-relaxed">
        승인은 <b>AI 문안</b>을 쓸 수 있게 하는 것입니다. 승인하지 않아도 계획서를 만들고 한글
        파일로 내려받는 일은 됩니다 — 빨간 글씨가 고정 문구로 나올 뿐입니다.
        {waiting > 0 && <> 지금 {waiting}명이 기다립니다.</>}
      </p>

      <div className="flex flex-col divide-y divide-line-soft rounded-control border border-line-soft">
        {users.length === 0 && <p className="hint px-4 py-6 text-center">아직 아무도 없습니다.</p>}

        {users.map((u) => (
          <div key={u.uid} className="flex items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14.5px] font-medium text-ink">
                {u.displayName ?? u.googleName ?? '이름 미정'}
                {u.admin && <span className="ml-2 text-[12px] font-normal text-navy">관리자</span>}
                {u.uid === myUid && (
                  <span className="ml-2 text-[12px] font-normal text-ink-3">나</span>
                )}
              </span>
              <span className="truncate text-[12.5px] text-ink-3">
                {u.email} · 최근 {whenLabel(u.lastSeenAt)}
                {u.approvedBy && ` · ${u.approvedBy} 승인`}
              </span>
            </div>

            {u.admin ? (
              // 관리자는 스위치가 없다 — 끌 수 없는 스위치를 보여 주면 눌러 보게 된다
              <span className="shrink-0 text-[12.5px] text-ink-3">항상 사용</span>
            ) : (
              <button
                className={`btn btn-sm shrink-0 ${u.approved ? 'btn-ghost' : ''}`}
                disabled={busyUid === u.uid}
                onClick={() => toggle(u)}
              >
                {busyUid === u.uid ? '…' : u.approved ? '해제' : '승인'}
              </button>
            )}
          </div>
        ))}
      </div>

      <button className="btn btn-sm btn-ghost self-start" onClick={load}>
        다시 불러오기
      </button>
    </div>
  )
}

/* ── 관리자 인증 ──────────────────────────────── */

/**
 * 관리자만 여기서 인증한다 — 구글과 이메일 두 길이 다 열려 있다.
 * 이메일 계정은 Firebase 콘솔(Authentication → Users)에서 만들어 둔 관리 계정이다.
 * 앱에 가입 화면은 없다 — 아무나 계정을 만들 수 있으면 명단이 소음으로 채워진다.
 */
function AdminAuth({ loggedInAs, onBack }: { loggedInAs: string | null; onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'google' | 'email', job: () => Promise<void>) => {
    setError(null)
    setBusy(kind)
    try {
      await job()
      // 관리자인지는 서버가 다시 판단한다 — 새로 읽는 게 가장 확실하다
      window.location.reload()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '인증에 실패했습니다'
      // 사용자가 창을 닫은 것은 오류가 아니다 — 조용히 되돌린다
      setError(/popup-closed|cancelled/i.test(msg) ? null : msg)
      setBusy(null)
    }
  }

  const emailReady = email.includes('@') && password.length >= 6

  return (
    <Screen title="관리자" subtitle="관리자 계정으로 인증해야 들어올 수 있습니다">
      <div className="mx-auto flex w-full max-w-[380px] flex-col gap-5 py-6">
        {loggedInAs && (
          <p className="rounded-control border border-amber-line bg-amber-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-ink">
            지금 계정({loggedInAs})은 관리자가 아닙니다.
            <br />
            관리자 계정으로 다시 인증해 주세요.
          </p>
        )}
        {error && (
          <p className="rounded-control border border-red-line bg-red-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-red-ink">
            {error}
          </p>
        )}

        <button
          className="btn btn-ghost flex w-full items-center justify-center gap-3"
          disabled={busy !== null}
          onClick={() =>
            run('google', async () => {
              // 이미 다른 계정이 붙어 있으면 떼고 시작한다 — 반쯤 겹친 상태를 만들지 않는다
              if (loggedInAs) await signOutEverywhere()
              await signInWithGoogle()
            })
          }
        >
          {/* 구글 브랜드 마크 — 네 색을 그대로 써야 알아본다 */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
          {busy === 'google' ? '인증 중…' : '구글로 인증'}
        </button>

        <div className="flex items-center gap-3 text-[12px] text-ink-4">
          <span className="h-px flex-1 bg-line-soft" />
          또는 관리 계정으로
          <span className="h-px flex-1 bg-line-soft" />
        </div>

        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (emailReady && busy === null)
              run('email', async () => {
                if (loggedInAs) await signOutEverywhere()
                await signInWithEmail(email, password)
              })
          }}
        >
          <input
            className="control"
            type="email"
            placeholder="이메일"
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
          <button className="btn w-full" type="submit" disabled={!emailReady || busy !== null}>
            {busy === 'email' ? '인증 중…' : '로그인'}
          </button>
        </form>

        <button
          className="cursor-pointer self-center border-0 bg-transparent p-0 text-[13px] text-ink-3 underline-offset-4 hover:underline"
          onClick={onBack}
        >
          작성으로 돌아가기
        </button>
      </div>
    </Screen>
  )
}
