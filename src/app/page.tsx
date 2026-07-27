'use client'

import { usePlanStore } from '@/store/usePlanStore'
import { AppHeader } from '@/components/AppHeader'
import { Home } from '@/screens/Home'
import { Generating } from '@/screens/Generating'
import { Download } from '@/screens/Download'
import { Admin } from '@/screens/Admin'

export default function Page() {
  const { screen, currentPlanId } = usePlanStore()

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
    <div className="min-h-screen bg-white">
      <AppHeader />
      <main className="mx-auto max-w-[1200px] px-6 pt-8 pb-24">{body()}</main>
    </div>
  )
}
