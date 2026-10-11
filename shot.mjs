// 1場面ずつ撮る。node shot.mjs <scene> [幅x高さ] [webkit]
// scene: title | play | aim | boom | tray | garage | result | lobby
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname, scene = process.argv[2] || 'title'
const size = process.argv.find(a => /^\d+x\d+$/.test(a)) || '1280x800', [W, H] = size.split('x').map(Number)
const useWebkit = process.argv.includes('webkit')
const touch = process.argv.includes('touch'), en = process.argv.includes('en')
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5281' } })
await new Promise(r => setTimeout(r, 400))
const b = useWebkit ? await webkit.launch() : await chromium.launch()
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: W, height: H }, ...(touch ? { isMobile: !useWebkit, hasTouch: true, deviceScaleFactor: 2 } : {}) })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) }); p.on('requestfailed', r => errs.push('fail ' + r.url()))
await p.goto('http://localhost:5281/'); await p.waitForFunction(() => window.__bbReady, null, { timeout: 20000 }); await p.waitForTimeout(800)
const info = await p.evaluate(([sc, touch, en]) => {
  const out = {}
  if (en) { bb.setLang('en'); bb.goTitle() }
  if (sc === 'howto') { bb.openHowto('title'); return out }
  if (sc === 'shopg') { bb.openShop(); document.querySelector('#shopTabs [data-t="ammo"]').click(); return out }
  if (sc === 'garage') { bb.setProfile({ lv: 7, rivets: 3200, gears: 4, owned: { h1: 1, b1: 0, l1: 2, h2: 0, l2: 1 }, eq: { head: 'h2', body: 'b1', legs: 'l2' } }); bb.openGarage(); return out }
  if (sc === 'title') return out
  bb.pause(true)
  if (touch) document.body.classList.add('touch')
  if (sc !== 'tut' && sc !== 'doctalk') bb.start({ seed: 5, stage: sc.includes('jungle') ? 'jungle' : 'canyon', diff: 'normal', skipLobby: sc !== 'lobby' })
  if (sc === 'lobby') { bb.run(30); return out }
  if (sc !== 'tut' && sc !== 'doctalk') { bb.toTurn(0); bb.run(10) }
  const S = bb.S, me = S.bots[0]
  if (sc.startsWith('close')) {
    // 4体を並べて表情とパーツを見る
    const moods = sc === 'close2' ? ['scared', 'sick', 'shout', 'sad'] : ['focus', 'happy', 'hurt', 'worried']
    const eqs = [{ head: 'h1', body: 'b1', legs: 'l1' }, { head: 'h2', body: 'b2', legs: 'l2' }, { head: 'h3', body: 'b3', legs: 'l3' }, { head: 'h4', body: 'b4', legs: 'l4' }]
    S.bots.forEach((b, i) => { b.alive = true; b.eq = eqs[i]; b.x = 980 + i * 52; b.y = 700; b.grounded = false; b.hurtT = 0 })
    bb.run(60)
    S.bots.forEach((b, i) => { b.mood = moods[i]; b.moodT = 99; b.facing = i % 2 ? -1 : 1; b.aim = b.facing > 0 ? -0.4 : Math.PI + 0.4; b.weapon = ['rocket', 'hammer', 'revolver', 'cannon'][i] })
    S.active = null; S.phase = 'settle'; S.cam.zoom = 1.6; S.cam.over = false; window.__close = true
  }
  if (sc.startsWith('aim')) { me.weapon = 'rocket'; me.aim = -0.8; me.power = 0.72; window.__aimHold = true; out.aim = true }
  if (sc === 'move') {
    const [a, b2, c2, d2] = S.bots; S.bots.forEach(b => { b.alive = true })
    a.x = 1000; a.y = 520; a.grounded = false; a.jet = { fuel: 2, max: 3 }; a.jetOn = true; a.vy = -100
    b2.x = 1120; b2.y = 380; b2.grounded = false; b2.chute = true; b2.chuteOpen = true; b2.vy = 60
    c2.x = 1260; c2.y = 600; c2.grounded = false; c2.hook = { x: 1200, y: 470, t: 0 }
    d2.say = { text: 'くらえ！', kind: 'fire', life: 1.4, max: 1.5 }; c2.say = { text: 'なにぃ！', kind: 'fly', life: 1, max: 1.2 }; b2.say = { text: 'ひえっ', kind: 'scared', life: 1, max: 1.5 }
    S.phase = 'settle'; S.active = null; window.__move = true
  }
  if (sc === 'tut') { bb.goTitle(); bb.start({ stage: 'practice', seed: 4242, tutorial: true, skipTalk: true }); bb.run(30) }
  if (sc === 'doctalk') { bb.goTitle(); bb.startTutorial(); bb.run(60) }
  if (sc === 'talk') { bb.goTitle(); bb.playChapter(0); bb.talkNext(); bb.talkNext(); bb.talkNext(); }
  if (sc === 'hp') { S.bots[1].hp = 30; S.bots[2].hp = 12; }
  if (sc === 'tray') { document.querySelector('#tray').hidden = false }
  if (sc === 'boom') {
    const e = S.bots[1]; const a = Math.atan2(e.y - me.y, e.x - me.x)
    out.before = bb.solidCount()
    me.weapon = 'grenade'; bb.fire(-1.0, 0.6); bb.run(60 * 3 + 5)
    out.after = bb.solidCount()
  }
  if (sc === 'result') { S.bots.forEach((b, i) => { b.score = [3432, 2245, 2990, 750][i]; b.kills = [3, 1, 2, 0][i] }); bb.finish(); bb.run(100) }
  out.bots = S.bots.map(b => ({ n: b.name, x: Math.round(b.x), y: Math.round(b.y), hp: b.hp, g: b.grounded }))
  return out
}, [scene, touch, en])
if (info.aim) { await p.evaluate(() => { const me = bb.S.bots[0]; me.power = 0.72; me.aim = -0.8; bb.S.phase = 'turn' }) }
await p.waitForTimeout(scene === 'boom' ? 150 : 600)
if (scene === 'move') await p.evaluate(() => { const S = bb.S; S.cam.x = 1150; S.cam.y = 500; S.cam.s = 2; S.cam.sx = S.cam.sy = 0; S.bots[0].jetOn = true; bb.render() })
if (scene.startsWith('close')) await p.evaluate(() => { bb.S.bots.forEach(b => { b.moodT = 99; b.hurtT = 0 }); const bs = bb.S.bots; bb.S.cam.x = bs.reduce((a, b) => a + b.x, 0) / 4; bb.S.cam.y = bs.reduce((a, b) => a + b.y, 0) / 4 - 22; document.querySelector('#hud').hidden = true; bb.S.cam.s = 3.2; bb.S.cam.sx = bb.S.cam.sy = 0; bb.render() })
if (info.aim) await p.evaluate(() => { const me = bb.S.bots[0]; me.power = 0.72; me.aim = -0.8; bb.render() })
mkdirSync(ROOT + '/検証', { recursive: true })
const file = `${ROOT}/検証/${scene}-${size}${useWebkit ? '-webkit' : ''}${touch ? '-touch' : ''}${en ? '-en' : ''}.png`
await p.screenshot({ path: file })
console.log(JSON.stringify({ file, info, errs }, null, 1))
await b.close(); server.kill()
