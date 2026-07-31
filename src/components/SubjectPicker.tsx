'use client'

/**
 * 과목 콤보박스 — 타이핑하면 아래로 일치 목록이 필터링되어 뜬다.
 *
 * 239개를 드롭다운으로 나열하지 않는다. 부분 일치(공백 무시)로 거르고,
 * 클릭 또는 Enter로 선택한다. 목록에 없는 이름은 '직접 입력'으로 확정할 수 있다 —
 * 성취기준 없이 시작하는 수동 과목이 된다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

/** 지금 Enter를 누르면 확정될 과목 */
export interface SubjectDraft {
  name: string
  listed: boolean
}

export function SubjectPicker({
  value,
  onPick,
  placeholder = '과목명 검색 — 예) 대수, 통합사회1',
  autoFocus,
  onDraftChange,
  hero = false,
  right,
}: {
  value: string
  /** listed = 성취기준 파일에 있는 과목인지 */
  onPick: (name: string, listed: boolean) => void
  placeholder?: string
  autoFocus?: boolean
  /** 바깥에 '작성 시작' 버튼을 두고 싶을 때 — Enter와 같은 값을 넘겨준다 */
  onDraftChange?: (draft: SubjectDraft | null) => void
  /** 첫 화면용 큰 검색줄 — 높고 넓고 둥글게 */
  hero?: boolean
  /** 검색줄 안쪽 오른쪽에 넣을 것 (시작 버튼) */
  right?: React.ReactNode
}) {
  const [names, setNames] = useState<string[] | null>(null)
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/data/subjects.json')
      .then((r) => r.json())
      .then((j: { subjects?: string[] }) => {
        if (alive) setNames(j.subjects ?? [])
      })
      .catch(() => {
        if (alive) setNames([])
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => setQuery(value), [value])

  // 바깥 클릭으로 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const squash = (s: string) => s.replace(/\s/g, '').toLowerCase()
  const matches = useMemo(() => {
    if (!names) return []
    const q = squash(query)
    if (!q) return names.slice(0, 12)
    return names.filter((n) => squash(n).includes(q)).slice(0, 12)
  }, [names, query])

  const exact = names?.some((n) => squash(n) === squash(query)) ?? false

  /* Enter가 확정할 값 — 바깥 버튼도 똑같은 값을 쓴다 */
  const draft: SubjectDraft | null = !query.trim()
    ? null
    : matches[cursor]
      ? { name: matches[cursor], listed: true }
      : { name: query.trim(), listed: false }

  useEffect(() => {
    onDraftChange?.(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.name, draft?.listed])

  const pick = (name: string, listed: boolean) => {
    setQuery(name)
    setOpen(false)
    onPick(name, listed)
  }

  return (
    <div ref={rootRef} className="relative">
      {/* 돋보기 — 여기가 '찾는 칸'이라는 걸 글로 설명하지 않아도 알게 한다 */}
      <svg
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-4 ${
          hero ? 'left-6' : 'left-3'
        }`}
        width={hero ? 20 : 16}
        height={hero ? 20 : 16}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 L14 14" strokeLinecap="round" />
      </svg>
      {right && (
        <div className="absolute top-1/2 right-2.5 z-10 -translate-y-1/2">{right}</div>
      )}
      <input
        className={hero ? 'search-pill' : 'control pl-9'}
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setCursor(0)
        }}
        /*
         * 포커스만으로는 목록을 열지 않는다.
         * 첫 화면은 커서를 자동으로 놓아 주는데, 그때 목록까지 펼쳐지면
         * 누르지도 않았는데 화면이 늘어진다. 실제로 누르거나 칠 때만 연다.
         */
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) {
            // 키보드만 쓰는 사람도 아래 화살표로 목록을 열 수 있어야 한다
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
            }
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (matches[cursor]) pick(matches[cursor], true)
            else if (query.trim()) pick(query.trim(), false)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {open && (query.trim() !== '' || matches.length > 0) && (
        <div
          className={`absolute top-full right-0 left-0 z-20 max-h-72 overflow-y-auto border border-line bg-white py-1 ${
            hero ? 'mt-2 rounded-box shadow-[0_10px_30px_rgba(20,40,80,0.10)]' : 'mt-1 rounded-control'
          }`}
        >
          {names === null && (
            <div className="px-3 py-2 text-sm text-ink-3">과목 목록을 불러오는 중…</div>
          )}
          {matches.map((n, i) => (
            <div
              key={n}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === cursor ? 'bg-navy-bg text-navy' : 'hover:bg-surface-sub'
              }`}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(n, true)
              }}
            >
              {n}
            </div>
          ))}
          {names !== null && query.trim() !== '' && !exact && (
            <div
              className="cursor-pointer border-t border-line-soft px-3 py-2 text-sm text-amber hover:bg-surface-sub"
              onMouseDown={(e) => {
                e.preventDefault()
                pick(query.trim(), false)
              }}
            >
              &lsquo;{query.trim()}&rsquo; 직접 입력 — 성취기준 없이 시작
            </div>
          )}
          {names !== null && matches.length === 0 && query.trim() === '' && (
            <div className="px-3 py-2 text-sm text-ink-3">과목명을 입력하세요</div>
          )}
        </div>
      )}
    </div>
  )
}
