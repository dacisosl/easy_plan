'use client'

import { usePlanStore } from '@/store/usePlanStore'
import { AppHeader } from '@/components/AppHeader'
import { AuthGate } from '@/components/AuthGate'
import { Home } from '@/screens/Home'
import { Generating } from '@/screens/Generating'
import { Download } from '@/screens/Download'
import { Admin } from '@/screens/Admin'
import { Extras } from '@/screens/Extras'

export default function Page() {
  const { screen, currentPlanId } = usePlanStore()
  /* 과목을 고르기 전 첫 화면에서만 바탕에 파란 빛을 깐다 */
  const onHero = screen === 'home' && !currentPlanId

  const body = () => {
    // 계획서가 없는데 작성 화면으로 들어오면 홈으로 되돌린다
    if (!currentPlanId && screen !== 'home' && screen !== 'admin' && screen !== 'extras')
      return <Home />
    switch (screen) {
      case 'generating':
        return <Generating />
      case 'download':
        return <Download />
      case 'extras':
        return <Extras />
      case 'admin':
        return <Admin />
      default:
        return <Home />
    }
  }

  return (
    <AuthGate>
      <div className={`min-h-screen ${onHero ? 'hero-wash' : 'bg-white'}`}>
        <AppHeader />
        {/* 폭은 헤더와 늘 같게 — 로고·버튼이 본문 모서리에 맞아야 오와 열이 선다 */}
        <main className={`mx-auto max-w-[880px] px-4 pb-24 sm:px-6 ${onHero ? 'pt-4' : 'pt-8'}`}>
          {body()}
        </main>
      </div>
    </AuthGate>
  )
}
