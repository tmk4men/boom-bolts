// 実時間で CPU 同士の試合を流し、一定間隔で撮る。node watch.mjs [枚数] [間隔ms]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname, N = +(process.argv[2] || 10), GAP = +(process.argv[3] || 700)
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5284' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto('http://localhost:5284/'); await p.waitForFunction(() => window.__bbReady)
await p.evaluate(() => { bb.start({ seed: 21, stage: 'canyon', allCpu: true, skipLobby: true }) })
const log = []
for (let i = 0; i < N; i++) {
  await p.waitForTimeout(GAP)
  const st = await p.evaluate(() => ({ ph: bb.S.phase, who: bb.S.active && bb.S.active.name, ai: bb.S.ai && bb.S.ai.st, proj: bb.S.proj.length, w: bb.S.active && bb.S.active.weapon }))
  await p.screenshot({ path: `${ROOT}/検証/watch-${String(i).padStart(2, '0')}.png` })
  log.push(`${i} ${JSON.stringify(st)}`)
}
console.log(log.join('\n')); console.log('errs', errs)
await b.close(); server.kill()
