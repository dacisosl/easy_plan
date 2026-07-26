import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const config: NextConfig = {
  // hwpx 렌더링은 서버에서만 돈다. 번들러가 노드 전용 모듈을 건드리지 않게 둔다.
  serverExternalPackages: ['@xmldom/xmldom', 'jszip'],
  // 상위 폴더에 다른 lockfile이 있어도 이 폴더를 루트로 본다
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
}

export default config
