'use client'

import { usePlanStore } from '@/store/usePlanStore'
import { AppHeader } from '@/components/AppHeader'
import { Home } from '@/screens/Home'
import { Setup } from '@/screens/Setup'
import { Units } from '@/screens/Units'
import { Schedule } from '@/screens/Schedule'
import { Performances } from '@/screens/Performances'
import { Review } from '@/screens/Review'
import { Download } from '@/screens/Download'
import { Generating } from '@/screens/Generating'

export default function Page() {
  const { screen, currentPlanId } = usePlanStore()

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
      case 'review':
        return <Review />
      case 'download':
        return <Download />
      case 'generating':
        return <Generating />
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="px-6 pt-10 pb-24">{body()}</main>
    </div>
  )
}
