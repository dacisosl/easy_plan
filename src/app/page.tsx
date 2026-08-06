'use client'

import { useEffect } from 'react'
import { usePlanStore } from '@/store/usePlanStore'
import { fetchSharedSchool } from '@/lib/schoolSync'
import { AppHeader } from '@/components/AppHeader'
import { Home } from '@/screens/Home'
import { Generating } from '@/screens/Generating'
import { Download } from '@/screens/Download'
import { Admin } from '@/screens/Admin'
import { Extras } from '@/screens/Extras'

export default function Page() {
  const { screen, currentPlanId, applySharedSchool } = usePlanStore()
  /* 과목을 고르기 전 첫 화면에서만 바탕에 파란 빛을 깐다 */
  const onHero = screen === 'home' && !currentPlanId

  /*
   * 관리자가 게시한 학교 설정(학사일정·배포표·규칙)을 시작할 때 한 번 받아 온다.
   * 실패하면(오프라인·게시 전) 조용히 로컬/기본값으로 간다 — 앱은 멈추지 않는다.
   * 이 브라우저에 게시 안 된 관리자 수정이 있으면 덮지 않는다.
   */
  useEffect(() => {
    let alive = true
    void fetchSharedSchool().then((shared) => {
      if (!alive || !shared) return
      if (usePlanStore.getState().school_dirty) return
      applySharedSchool(shared.school)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div className={`min-h-screen ${onHero ? 'hero-wash' : 'bg-white'}`}>
      <AppHeader />
      {/* 폭은 헤더와 늘 같게 — 로고·버튼이 본문 모서리에 맞아야 오와 열이 선다 */}
      <main className={`mx-auto max-w-[880px] px-4 pb-24 sm:px-6 ${onHero ? 'pt-4' : 'pt-8'}`}>
        {body()}
      </main>
    </div>
  )
}
