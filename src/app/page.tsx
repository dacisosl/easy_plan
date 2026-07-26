'use client'

import { usePlanStore, type ScreenId } from '@/store/usePlanStore'
import { Home } from '@/screens/Home'
import { Setup } from '@/screens/Setup'
import { Units } from '@/screens/Units'
import { Schedule } from '@/screens/Schedule'
import { Performances } from '@/screens/Performances'
import { PerfEdit } from '@/screens/PerfEdit'
import { Review } from '@/screens/Review'
import { Focus } from '@/screens/Focus'
import { Download } from '@/screens/Download'
import { Simple } from '@/screens/Simple'
import { Generating } from '@/screens/Generating'
import { Result } from '@/screens/Result'

const SCREENS: { id: ScreenId; no: string; label: string }[] = [
  { id: 'home', no: '09', label: '시작' },
  { id: 'setup', no: '01', label: '과목 설정' },
  { id: 'units', no: '02', label: '단원 매핑' },
  { id: 'schedule', no: '03', label: '진도 설계' },
  { id: 'performances', no: '04', label: '수행평가 목록' },
  { id: 'performance', no: '05', label: '수행평가 편집' },
  { id: 'review', no: '06', label: '검토' },
  { id: 'focus', no: '07', label: '직접 확인' },
  { id: 'download', no: '08', label: '내려받기' },
  { id: 'simple', no: '10', label: '간단 입력' },
  { id: 'generating', no: '11', label: '생성 중' },
  { id: 'result', no: '12', label: '생성 결과' },
]

export default function Page() {
  const { screen, go, currentPlanId, plans, openPlan, editPerf } = usePlanStore()

  const body = () => {
    if (screen !== 'home' && !currentPlanId) return <Home />
    switch (screen) {
      case 'home':
        return <Home />
      case 'setup':
        return <Setup />
      case 'units':
        return <Units />
      case 'schedule':
        return <Schedule />
      case 'performances':
        return <Performances />
      case 'performance':
        return <PerfEdit />
      case 'review':
        return <Review />
      case 'focus':
        return <Focus />
      case 'download':
        return <Download />
      case 'simple':
        return <Simple />
      case 'generating':
        return <Generating />
      case 'result':
        return <Result />
    }
  }

  const jump = (id: ScreenId) => {
    if (id === 'home') return go('home')
    if (!currentPlanId && plans[0]) return openPlan(plans[0].id, id)
    if (id === 'performance') {
      const plan = plans.find((p) => p.id === currentPlanId)
      return plan?.performances[0] ? editPerf(plan.performances[0].id) : go('performances')
    }
    go(id)
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-line bg-bg px-6 py-2.5">
        <span className="eyebrow mr-3" title="디자인 시안의 12개 화면으로 바로 이동합니다">
          화면
        </span>
        {SCREENS.map((s) => (
          <button
            key={s.id}
            onClick={() => jump(s.id)}
            className={`cursor-pointer rounded-tag border px-2.5 py-1 font-mono text-xs ${
              screen === s.id
                ? 'border-navy bg-navy text-white'
                : 'border-line bg-transparent text-ink-2 hover:border-navy-line-hover'
            }`}
          >
            {s.no} {s.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-[1520px] px-6 pt-8 pb-24">{body()}</main>
    </div>
  )
}
