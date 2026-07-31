import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  /**
   * 완전 정적 내보내기 — 서버가 없다.
   *
   * 한글(.hwpx) 조립도, 문안 초안도, 과목 데이터도 전부 브라우저에서 처리한다.
   * 과목은 빌드 때 JSON으로 굽고(scripts/build-subjects.ts), 양식 파일은
   * public에 둔다. 그래서 Firebase Hosting(정적 CDN)에 바로 올라가고
   * 배포가 수십 초면 끝난다 — App Hosting(서버 컨테이너)을 쓸 이유가 없어졌다.
   */
  output: 'export',
  // 화면 구석의 Next.js 개발 표시기를 끈다 — 작업 화면을 가린다
  devIndicators: false,
  // 상위 폴더에 다른 lockfile이 있어도 이 폴더를 루트로 본다
  outputFileTracingRoot: root,
}

export default config
