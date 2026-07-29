'use client'

import { usePlanStore } from '@/store/usePlanStore'
import { AppHeader } from '@/components/AppHeader'
import { Home } from '@/screens/Home'
import { Generating } from '@/screens/Generating'
import { Download } from '@/screens/Download'
import { Admin } from '@/screens/Admin'

export default function Page() {
  const { screen, currentPlanId } = usePlanStore()
  /* 과목을 고르기 전 첫 화면에서만 바탕에 파란 빛을 깐다 */
  const onHero = screen === 'home' && !currentPlanId

  const body = () => {
    // 계획서가 없는데 작성 화면으로 들어오면 홈으로 되돌린다
    if (!currentPlanId && screen !== 'home' && screen !== 'admin') return <Home />
    switch (screen) {
      case 'generating':
        return <Generating />
      case 'download':
        return <Download />
      case 'admin':
        return <Admin />
      default:
        return <Home />
    }
  }

  return (
    <div className={`min-h-screen ${onHero ? 'hero-wash' : 'bg-white'}`}>
      <AppHeader />
      <main
        className={`mx-auto px-6 pb-24 ${onHero ? 'max-w-[1000px] pt-4' : 'max-w-[880px] pt-8'}`}
      >
        {body()}
      </main>
    </div>
  )
}
