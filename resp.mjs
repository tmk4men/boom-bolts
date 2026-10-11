// 画面サイズごとに主要画面を撮り、はみ出しを数値で調べる。node resp.mjs [webkit]
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname, useWebkit = process.argv.includes('webkit')
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5285' } })
await new Promise(r => setTimeout(r, 400))
const b = useWebkit ? await webkit.launch() : await chromium.launch()
const SIZES = [[667, 375, true], [844, 390, true], [1024, 768, true], [1280, 720, false], [1920, 1080, false], [2560, 1440, false]]
const SCREENS = ['title', 'free', 'story', 'shop', 'garage', 'match', 'result', 'talk', 'howto']
mkdirSync(`${ROOT}/検証/resp`, { recursive: true })
const issues = []
for (const [w, h, touch] of SIZES) {
  const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: !useWebkit, deviceScaleFactor: 2 } : {}) })
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', e => errs.push(e.message))
  await p.goto('http://localhost:5285/'); await p.waitForFunction(() => window.__bbReady)
  await p.evaluate(en => { bb.resetProfile(); bb.setProfile({ lv: 6, rivets: 3000, gears: 8, tut: true, story: 2 }); if (en) bb.setLang('en') }, process.argv.includes('en'))
  for (const sc of SCREENS) {
    await p.evaluate(sc => {
      bb.pause(true); bb.goTitle()
      if (sc === 'story') bb.openStory()
      if (sc === 'free') document.querySelector('#bStart').click()
      if (sc === 'howto') bb.openHowto('title')
      if (sc === 'shop') bb.openShop()
      if (sc === 'garage') bb.openGarage()
      if (sc === 'match' || sc === 'result') { bb.start({ seed: 5, skipLobby: true }); bb.toTurn(0); bb.run(10) }
      if (sc === 'result') { bb.S.bots.forEach((x, i) => { x.score = [3000, 2000, 1000, 500][i] }); bb.finish(); bb.run(100) }
      if (sc === 'talk') { bb.playChapter(0) }
    }, sc)
    await p.waitForTimeout(450)
    const r = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight, out = []
      const docW = document.documentElement.scrollWidth
      for (const el of document.querySelectorAll('button, .card, #timer, #mini, .tbox, #coach, .plate')) {
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue
        const scr = el.closest('.scr')
        if (scr && scr.scrollHeight > scr.clientHeight) { if (r.left < -1 || r.right > W + 1) out.push((el.id || el.className) + ' x') }
        else if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) out.push((el.id || el.className.toString().slice(0, 20)) + ` ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`)
      }
      return { docW, W, out: out.slice(0, 6) }
    })
    if (r.docW > r.W + 1) issues.push(`${w}x${h} ${sc}: 横はみ出し ${r.docW}>${r.W}`)
    if (r.out.length) issues.push(`${w}x${h} ${sc}: 画面外 ${r.out.join(' | ')}`)
    await p.screenshot({ path: `${ROOT}/検証/resp/${sc}-${w}x${h}${useWebkit ? '-wk' : ''}.png` })
  }
  if (errs.length) issues.push(`${w}x${h} errors: ${errs.join('|')}`)
  await ctx.close()
}
console.log(issues.length ? issues.join('\n') : 'no issues')
await b.close(); server.kill()
