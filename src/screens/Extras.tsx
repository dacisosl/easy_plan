'use client'

/**
 * 참고자료 — 아직 무엇을 담을지 정하기 전이다.
 *
 * 자리만 잡아 둔다. 빈 화면을 그냥 두면 눌러 놓고 고장인 줄 알기 때문에,
 * 무엇이 없는지와 어디로 돌아가면 되는지를 적어 둔다.
 */

import { Screen } from '@/components/ui'
import { usePlanStore } from '@/store/usePlanStore'

export function Extras() {
  const { go, startNew, currentPlanId } = usePlanStore()

  return (
    <Screen title="참고자료">
      <div className="flex flex-col items-center gap-4 rounded-box border border-line-card bg-surface-sub px-6 py-16 text-center">
        <span className="text-[15px] font-semibold text-ink">아직 준비 중입니다</span>
        <p className="max-w-[420px] text-[14px] leading-relaxed text-ink-2">
          여기에 담을 기능을 정하는 중입니다.
          <br />
          지금은 계획서 작성만 쓸 수 있습니다.
        </p>
        <button
          className="btn btn-sm btn-accent mt-2"
          onClick={() => (currentPlanId ? go('home') : startNew())}
        >
          작성으로 돌아가기
        </button>
      </div>
    </Screen>
  )
}
