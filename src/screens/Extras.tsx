'use client'

/**
 * 참고자료 — 카드 세 장으로 들어가는 서랍.
 *
 *   사용안내   이 앱을 어떻게 쓰는가
 *   작년자료   public/refs/ 에 둔 파일을 내려받는다 (빌드가 목록을 굽는다)
 *   학교알리미 다른 학교 평가계획을 보러 나간다 (바깥 링크)
 *
 * 사용안내는 교사가 읽는 글이다. 개발 용어 없이 세 가지만 답한다:
 *  ① 무엇을 넣고 무엇을 기획하면 되는가
 *  ② 편집기는 그 입력을 문서 어디에 어떻게 옮기는가
 *  ③ 무엇을 조심하면 되는가
 * 맨 앞의 '누가 무엇을 하나' 표가 전체 그림이다 — 사람들은 목차보다 역할 분담을 먼저 궁금해한다.
 */

import { useEffect, useState } from 'react'
import { Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'

/** 학교알리미 — 공시된 다른 학교 평가계획을 찾아보는 자리 */
const SCHOOLINFO_URL = 'https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do'

interface RefFile {
  name: string
  href: string
  file: string
  size: number
}

/**
 * 서랍의 카드 한 장 — 세로로 긴 판형.
 *
 * 위에서 아래로: 아이콘(무엇인지 한눈에) → 제목 → 설명 → 행동 문구(무슨 일이
 * 일어나는지). 행동 문구를 바닥에 붙여 세 카드의 눈높이를 맞추고, 올리면 살짝
 * 떠오르게 해 '눌린다'는 것을 손보다 먼저 눈이 알게 한다.
 */
function Card({
  icon,
  title,
  desc,
  action,
  onOpen,
  href,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  /** 바닥의 행동 문구 — '읽어보기' '내려받기' 처럼 눌렀을 때의 일 */
  action: string
  /** onOpen도 href도 없으면 아직 열 수 없는 카드 — '준비 중' 표시가 붙는다 */
  onOpen?: () => void
  href?: string
}) {
  const live = Boolean(onOpen || href)
  const cls = `group flex min-h-[220px] flex-col rounded-card border p-4 text-left sm:min-h-[260px] sm:p-6 ${
    live
      ? 'cursor-pointer border-line-card bg-surface transition-all duration-200 hover:-translate-y-1 hover:border-navy-mid hover:shadow-lg hover:shadow-navy/10'
      : 'cursor-default border-line-soft bg-surface-off'
  }`

  const inner = (
    <>
      {/* 아이콘 — 연한 파랑 판 위에. 올리면 판이 진해져 카드가 살아 있음을 한 번 더 말한다 */}
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors sm:h-13 sm:w-13 ${
          live
            ? 'bg-navy-bg text-navy group-hover:bg-navy group-hover:text-white'
            : 'bg-surface-sub text-ink-4'
        }`}
      >
        {icon}
      </span>

      <span className="mt-3.5 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink sm:mt-4 sm:text-[17px]">
        {title}
        {!live && (
          <span className="rounded-chip border border-line-input bg-surface px-2 py-0.5 text-[11px] font-normal text-ink-3">
            준비 중
          </span>
        )}
      </span>
      <span className="mt-1.5 flex-1 text-[12.5px] leading-relaxed break-keep text-ink-2 sm:text-[13.5px]">
        {desc}
      </span>

      {/* 행동 문구 — 바닥 고정. 밖으로 나가는 길은 화살표를 비스듬히(↗) */}
      {live && (
        <span className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-navy">
          {action}
          <span className="transition-transform duration-200 group-hover:translate-x-0.5">
            {href ? '↗' : '→'}
          </span>
        </span>
      )}
    </>
  )

  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    )
  }
  return (
    <button className={cls} onClick={onOpen} disabled={!onOpen}>
      {inner}
    </button>
  )
}

/* 선 굵기·모서리를 헤더의 로봇 아이콘과 맞춘 카드 아이콘들 */

const ICON = {
  width: 26,
  height: 26,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** 펼친 책 — 사용안내 */
function BookIcon() {
  return (
    <svg {...ICON} aria-hidden>
      <path d="M2.5 5h6.2A2.8 2.8 0 0 1 11.5 7.8V20a2.4 2.4 0 0 0-2.4-2.3H2.5z" />
      <path d="M21.5 5h-6.2a2.8 2.8 0 0 0-2.8 2.8V20a2.4 2.4 0 0 1 2.4-2.3h6.6z" />
    </svg>
  )
}

/** 내려받는 서류철 — 작년자료 */
function FolderDownIcon() {
  return (
    <svg {...ICON} aria-hidden>
      <path d="M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 10.5v5M9.6 13.4 12 15.8l2.4-2.4" />
    </svg>
  )
}

/** 학교 건물 — 학교알리미 */
function SchoolIcon() {
  return (
    <svg {...ICON} aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V9.6L12 5l7 4.6V21" />
      <path d="M12 5V3h3" />
      <path d="M10 21v-4.5h4V21" />
      <path d="M8.2 12.5h.01M12 12.5h.01M15.8 12.5h.01" />
    </svg>
  )
}

/** 바이트를 사람이 읽는 크기로 */
function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** 소제목 하나 — 번호와 제목을 붙이고 아래 내용을 받는다 */
function Part({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-box border border-line-card bg-surface-sub px-5 py-6 sm:px-7">
      <h2 className="flex items-baseline gap-2.5 text-[17px] font-semibold text-ink">
        <span className="text-navy">{no}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line-soft py-2.5 last:border-b-0 sm:grid-cols-[168px_1fr] sm:gap-4">
      <span className="text-[14px] font-semibold text-ink">{k}</span>
      <span className="text-[14px] leading-relaxed text-ink-2">{v}</span>
    </div>
  )
}

export function Extras() {
  const { go, startNew, currentPlanId } = usePlanStore()
  const [view, setView] = useState<'menu' | 'guide' | 'refs'>('menu')
  /** null = 아직 목록을 못 읽음 (파일이 하나도 없으면 빈 배열) */
  const [refs, setRefs] = useState<RefFile[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/refs/index.json')
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .catch(() => ({ files: [] }))
      .then((j: { files?: RefFile[] }) => alive && setRefs(j.files ?? []))
    return () => {
      alive = false
    }
  }, [])

  const backToMenu = (
    <button className="btn btn-sm btn-ghost" onClick={() => setView('menu')}>
      ← 참고자료
    </button>
  )

  if (view === 'menu') {
    return (
      <Screen
        title="참고자료"
        subtitle="계획서 작성에 곁들이는 것들"
        right={
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => (currentPlanId ? go('home') : startNew())}
          >
            작성으로 돌아가기
          </button>
        }
      >
        {/* 늘 가로 3분할 — 세 장이 한 줄에 나란히 보여야 서랍 전체가 한눈에 잡힌다 */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-5">
          <Card
            icon={<BookIcon />}
            title="사용안내"
            desc="무엇을 넣으면 무엇이 되는지 — 역할 분담부터 주의사항까지 한 장으로."
            action="읽어보기"
            onOpen={() => setView('guide')}
          />
          {/* 파일이 하나도 없으면 열어 봐야 빈 화면이다 — 그때는 '준비 중'으로 둔다 */}
          <Card
            icon={<FolderDownIcon />}
            title="작년자료"
            desc={
              refs && refs.length > 0
                ? `작년 학년별 평가계획서 실물 ${refs.length}개 — 기획할 때 곁에 두는 사례집.`
                : '작년 과목별 평가계획서 모음 — 참고할 실물 사례.'
            }
            action="내려받기"
            onOpen={refs && refs.length > 0 ? () => setView('refs') : undefined}
          />
          <Card
            icon={<SchoolIcon />}
            title="학교알리미"
            desc="다른 학교는 어떻게 짰을까 — 전국 학교의 공시된 평가계획을 찾아봅니다."
            action="다른 학교 평가계획 참고하기"
            href={SCHOOLINFO_URL}
          />
        </div>
      </Screen>
    )
  }

  if (view === 'refs') {
    return (
      <Screen title="작년자료" subtitle="눌러서 내려받으세요" right={backToMenu}>
        <div className="flex flex-col divide-y divide-line-soft rounded-box border border-line-card">
          {(refs ?? []).map((f) => (
            <a
              key={f.href}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-sub sm:px-5"
              href={f.href}
              download={f.file}
            >
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{f.name}</span>
              <span className="shrink-0 text-[12.5px] text-ink-3">{sizeLabel(f.size)}</span>
              <span className="shrink-0 text-navy">↓</span>
            </a>
          ))}
        </div>
        <p className="hint">
          작년 계획서는 그대로 쓰는 문서가 아니라 참고용입니다 — 올해 학사일정과 지침이 다릅니다.
        </p>
      </Screen>
    )
  }

  return (
    <Screen
      title="사용 안내"
      subtitle="선생님은 계획만, 편집은 편집기가 — 무엇을 넣으면 무엇이 되는지"
      right={backToMenu}
    >
      {/* ── 한눈에: 역할 분담 ── */}
      <div className="rounded-box border border-navy-line bg-navy-bg px-5 py-5 sm:px-7">
        <h2 className="mb-3 text-[15px] font-semibold text-navy">한눈에 — 누가 무엇을 하나</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="text-[13.5px] font-semibold text-ink">선생님이 정하는 것</span>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[13.5px] leading-relaxed text-ink-2">
              <li>수행평가 — 무엇을, 언제, 어떤 성취기준으로</li>
              <li>정기시험 횟수와 시험범위</li>
              <li>반영 비율 (정기시험 : 수행평가, 서·논술)</li>
              <li>학년·시수·지도교사 같은 기본값</li>
            </ul>
          </div>
          <div>
            <span className="text-[13.5px] font-semibold text-ink">편집기가 해 주는 것</span>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[13.5px] leading-relaxed text-ink-2">
              <li>성취기준을 21주 진도표에 배분</li>
              <li>표 20여 개의 열·행·병합·수치 재구성</li>
              <li>같은 값이 들어가는 아홉 곳에 자동 전파</li>
              <li>학교 지침 19가지 자동 검증</li>
              <li>한글(.hwpx) 파일로 완성</li>
            </ul>
          </div>
        </div>
      </div>

      <Part no="①" title="무엇을 넣고, 무엇을 기획하면 되나요">
        <p className="text-[14px] leading-relaxed text-ink-2">
          첫 화면에서 과목을 고르면 나머지는 모두 기본값이 채워진 채 시작합니다. 실제로 기획할 것은{' '}
          <b className="text-ink">수행평가 하나</b>입니다.
        </p>
        <div>
          <Row
            k="기본설정"
            v="학년 · 주당 시수 · 지도교사 · 학기 · 분할점수 방식. 고르기만 하면 됩니다."
          />
          <Row
            k="정기시험"
            v="2회 / 1회 / 수행 100% 중 선택. 회차별 시험범위는 '어느 성취기준까지 나가는지' 하나만 고르면 진도가 따라 맞춰집니다."
          />
          <Row
            k="비율 조정"
            v="정기시험·수행평가 반영 비율과 회차별 단답·서술 배점. 숫자만 넣으면 나머지(선택형 몫, 서·논술 합계)는 자동 계산됩니다."
          />
          <Row
            k="수행평가 (핵심)"
            v={
              <>
                <b className="text-ink">명칭</b>(20자 이내, 무엇을 하는지 드러나게) ·{' '}
                <b className="text-ink">실시 시기</b> · <b className="text-ink">성취기준</b> ·{' '}
                <b className="text-ink">실시 의도</b> 한 줄. 성취기준을 직접 고르면 진도표가 그
                성취기준을 실시 주 전에 배우도록 스스로 조정됩니다.
              </>
            }
          />
        </div>
        <p className="rounded-control bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
          <b className="text-ink">기획 기준 (학교 지침)</b> — 수행평가는 학기 성적의 40% 이상(3학년
          30%), 서로 다른 2영역 이상, 한 영역 35% 이하(지필 2회 과목은 40%), 서·논술형 합계 30%
          이상(1단위·수행 80% 이상 과목 제외), 실시 시기는 1회 시험 2주 전부터 2회 시험 전까지. 외울
          필요 없습니다 — 어긋나면 편집기가 알려 줍니다.
        </p>
      </Part>

      <Part no="②" title="넣은 값은 문서 어디로 가나요">
        <div>
          <Row
            k="성취기준"
            v="Ⅰ 진도표(주차별 배분) · Ⅳ 평가의 종류와 방법 표 · Ⅺ 성취기준별 성취수준 표. 시험범위와 수행평가 시기를 기준으로 21주에 나눠 앉습니다."
          />
          <Row
            k="수행평가명"
            v="아홉 곳에 똑같이 들어갑니다 — 진도표의 실시 주와 안내 주, Ⅲ-2 방침, Ⅳ 표, Ⅵ 세부기준표 등. 한 번만 쓰면 끝나는 이유입니다."
          />
          <Row
            k="시험 정보"
            v="Ⅲ-2 다(횟수)·라(비율) 문장, Ⅳ 표의 열 구성(문항 유형 수만큼 칸이 늘고 줄어듦), 평가 시기(목요일이 속한 달 기준 '7월 1주' 표기)."
          />
          <Row
            k="과목 특성"
            v="이수(P/F) 과목은 분할점수 문장이 P/F 문장으로, 공통과목만 최소 성취수준이 들어가고, 서·논술 면제 과목은 해당 조항이 지워지고 번호가 당겨집니다 — 전부 자동."
          />
          <Row
            k="AI 문안 (선택)"
            v="Ⅱ 평가의 목적, Ⅲ-1 기본방향, 주차별 주안점, 학기단위 성취수준의 문장을 과목에 맞게 써 줍니다. 인증 후 관리자 승인을 받은 계정만 쓸 수 있고, 없으면 기본 문구로 완성됩니다."
          />
        </div>
      </Part>

      <Part no="③" title="확인할 것과 주의할 것">
        <div>
          <Row
            k="자동 검증 19가지"
            v="비율 합계, 영역 상한, 기본점수 범위, 진도와 시험범위 정합 등을 저장할 때마다 검사합니다. 모두 통과해야 내려받을 수 있고, '고치기'를 누르면 해당 입력란으로 데려갑니다."
          />
          <Row
            k="진도 확인 질문"
            v="수행평가 성취기준을 실시 주까지 안 배우는 배치면 '교과진도계획에 맞는 수행평가 성취기준을 선택하셨나요?'라고 묻습니다. 계획대로 맞다면 '확인했습니다'로 넘어갈 수 있습니다."
          />
          <Row
            k="빨간 글씨"
            v="문서의 빨간 글씨는 확인이 필요한 곳입니다 — 진도표의 단원명·성취기준(어느 주에 무엇을 다룰지)과 AI가 쓴 문안. 한글에서 읽고 검정으로 바꾸며 검토해 주세요. 배경색이 칠해진 칸(예정시간·실시누계)은 직접 채우는 칸입니다."
          />
          <Row
            k="루브릭(Ⅵ)"
            v="수행평가 세부 채점 기준표는 뼈대만 만들어 드립니다 — 배점과 기준 서술은 한글에서 선생님이 다듬는 것을 전제로 합니다."
          />
          <Row
            k="저장 위치"
            v="계획서는 지금 쓰는 브라우저에만 저장됩니다. 다른 컴퓨터나 다른 브라우저에서는 보이지 않으니, 완성본 한글 파일은 내려받아 보관하세요."
          />
        </div>
      </Part>

      <div className="flex justify-center pb-4">
        <button
          className="btn btn-accent"
          onClick={() => (currentPlanId ? go('home') : startNew())}
        >
          작성하러 가기
        </button>
      </div>
    </Screen>
  )
}
