import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  // 화면 구석의 Next.js 개발 표시기를 끈다 — 작업 화면을 가린다
  devIndicators: false,
  // hwpx 렌더링은 서버에서만 돈다. 번들러가 노드 전용 모듈을 건드리지 않게 둔다.
  serverExternalPackages: ['@xmldom/xmldom', 'jszip'],
  // 상위 폴더에 다른 lockfile이 있어도 이 폴더를 루트로 본다
  outputFileTracingRoot: root,
  /**
   * ★ 서버가 런타임에 디스크에서 읽는 파일들.
   *
   * 두 라우트가 `join(process.cwd(), …)`로 경로를 **런타임에 조립**한다.
   * Next.js의 파일 추적은 정적 분석이라 이런 경로를 못 잡는다 —
   * 명시하지 않으면 Vercel 같은 서버리스 환경에서 파일이 번들에 안 실려
   * 두 API가 500으로 죽는다. 로컬에서는 파일이 옆에 있어서 티가 안 난다.
   */
  outputFileTracingIncludes: {
    '/api/export': ['./templates/form_2026.hwpx'],
    '/api/subjects': ['./data/**'],
    '/api/subjects/[name]': ['./data/**'],
  },
}

export default config
