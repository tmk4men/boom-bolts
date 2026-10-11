// 全項目の自動検証。node verify.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5282' } })
await new Promise(r => setTimeout(r, 400))
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }

async function page(opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 800 }, ...opts })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()) })
  if (opts.initScript) await p.addInitScript(opts.initScript)
  await p.goto('http://localhost:5282/'); await p.waitForFunction(() => window.__bbReady, null, { timeout: 20000 })
  return p
}

// ---------- 起動と描画
const p = await page()
await p.evaluate(() => { try { localStorage.clear() } catch (e) {} ; bb.resetProfile() })
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('タイトルの画面に絵が出ている（輝度の分散）', async () => {
  await p.waitForTimeout(500)
  const v = await p.evaluate(() => {
    const c = document.querySelector('#cv'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data
    let s = 0, s2 = 0, n = 0
    for (let i = 0; i < d.length; i += 400) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; s += l; s2 += l * l; n++ }
    return s2 / n - (s / n) ** 2
  })
  expect(v > 200, 'var ' + v); return { var: Math.round(v) }
})
await t('対戦開始ボタンでロビーが出て、数秒で自分の番になる', async () => {
  await p.click('#bStart'); await p.click('#bFreeGo')
  expect(await p.isVisible('#lobby'), 'lobby hidden')
  await p.waitForFunction(() => bb.S.phase === 'turn' && bb.S.active.human, null, { timeout: 8000 })
  return { phase: await p.evaluate(() => bb.S.phase) }
})
await t('マウスで狙う方向へドラッグして離すと発射される', async () => {
  const r = await p.evaluate(() => { const me = bb.S.bots[0]; return { x: me.x, y: me.y } })
  await p.mouse.move(640, 400); await p.mouse.down(); await p.mouse.move(700, 330, { steps: 5 })
  const aiming = await p.evaluate(() => !!bb.S.bots[0].power)
  await p.mouse.up()
  await p.waitForTimeout(100)
  const s = await p.evaluate(() => ({ fired: bb.S.fired, phase: bb.S.phase, proj: bb.S.proj.length }))
  expect(aiming, 'power not shown while dragging'); expect(s.fired && s.phase === 'retreat', JSON.stringify(s)); return s
})
await t('撃ったあとは5秒で逃げる時間になる', async () => {
  const tt = await p.evaluate(() => bb.S.turnTime); expect(tt <= 5 && tt > 3, 'tt ' + tt); return { tt: +tt.toFixed(2) }
})
await t('クリックしただけ（ドラッグなし）では撃たない', async () => {
  await p.evaluate(() => { bb.pause(true); bb.start({ seed: 3, skipLobby: true }); bb.toTurn(0); bb.pause(false) })
  await p.mouse.click(640, 400); await p.waitForTimeout(100)
  const f = await p.evaluate(() => bb.S.fired); expect(!f, 'fired on click')
})
await t('キーボード: Dで右へ歩き、Space/W/Enterでジャンプ、F長押しで発射', async () => {
  const x0 = await p.evaluate(() => bb.S.bots[0].x)
  await p.keyboard.down('KeyD'); await p.waitForTimeout(500); await p.keyboard.up('KeyD')
  const x1 = await p.evaluate(() => bb.S.bots[0].x)
  const airs = []
  for (const k of ['Space', 'KeyW', 'Enter']) { await p.keyboard.press(k); await p.waitForTimeout(80); airs.push(await p.evaluate(() => !bb.S.bots[0].grounded)); await p.waitForTimeout(1000) }
  const air = airs.every(Boolean)
  const alive = await p.evaluate(() => [bb.S.bots[0].alive, bb.S.phase])
  await p.evaluate(() => { bb.pause(true); bb.start({ seed: 3, skipLobby: true }); bb.toTurn(0); bb.pause(false) })
  await p.keyboard.down('KeyF'); await p.waitForTimeout(500); await p.keyboard.up('KeyF'); await p.waitForTimeout(60)
  const f = await p.evaluate(() => bb.S.fired)
  expect(x1 !== x0, 'did not move'); expect(air, 'no jump ' + airs); expect(f, 'no fire ' + alive)
  return { moved: +(x1 - x0).toFixed(1) }
})
await t('数字キーで武器を変える／未解放は選べない（Lv1）', async () => {
  await p.evaluate(() => { bb.pause(true); bb.start({ seed: 3, skipLobby: true }); bb.toTurn(0); bb.pause(false) })
  await p.keyboard.press('Digit2'); const a = await p.evaluate(() => bb.S.bots[0].weapon)
  await p.keyboard.press('Digit3'); const b2 = await p.evaluate(() => bb.S.bots[0].weapon)
  expect(a === 'grenade', a); expect(b2 === 'grenade', 'locked hammer selected: ' + b2)
})
await t('武器トレイが開き、未解放はLv表示になっている', async () => {
  await p.click('#wslot'); await p.waitForTimeout(100)
  const s = await p.evaluate(() => [...document.querySelectorAll('#tray .wbtn')].map(b => [b.dataset.k, b.classList.contains('locked'), b.querySelector('em').textContent]))
  await p.click('#wslot')
  expect(s.length === 13, 'n ' + s.length); expect(s.find(q => q[0] === 'hammer')[1], 'hammer not locked')
  return s.slice(0, 4)
})

await t('タッチ: 左スティックで歩き、上に倒すとジャンプ、右を引いて離すと発射', async () => {
  await p.evaluate(() => { bb.pause(true); bb.start({ seed: 3, skipLobby: true }); bb.toTurn(0); bb.pause(false) })
  const ev = (type, id, x, y) => p.evaluate(([type, id, x, y]) => document.querySelector('#touch').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 })), [type, id, x, y])
  const x0 = await p.evaluate(() => bb.S.bots[0].x)
  await ev('pointerdown', 1, 150, 650); await ev('pointermove', 1, 210, 650); await p.waitForTimeout(500)
  const x1 = await p.evaluate(() => bb.S.bots[0].x)
  await ev('pointermove', 1, 150, 580); await p.waitForTimeout(60)
  const air = await p.evaluate(() => !bb.S.bots[0].grounded)
  await ev('pointerup', 1, 150, 580); await p.waitForTimeout(300)
  await p.evaluate(() => { bb.pause(true); bb.start({ seed: 3, skipLobby: true }); bb.toTurn(0); bb.pause(false) })
  await ev('pointerdown', 2, 1100, 650); await ev('pointermove', 2, 1150, 600); await p.waitForTimeout(60)
  const pw = await p.evaluate(() => bb.S.bots[0].power)
  await ev('pointerup', 2, 1150, 600); await p.waitForTimeout(80)
  const f = await p.evaluate(() => bb.S.fired)
  expect(Math.abs(x1 - x0) > 5, 'no walk'); expect(air, 'no jump'); expect(pw > 0.5, 'power ' + pw); expect(f, 'no fire')
  return { walked: +(x1 - x0).toFixed(1), power: +pw.toFixed(2) }
})
await t('スマホ縦持ちでは横向きの案内が出る', async () => {
  const q = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const pg = await q.newPage(); await pg.goto('http://localhost:5282/'); await pg.waitForFunction(() => window.__bbReady)
  const v = await pg.isVisible('#rotate'); await q.close(); expect(v, 'rotate hidden')
})
await t('ジャンプ: 短押しは低く、長押しは高く跳ぶ', async () => {
  const h = async (ms) => {
    await p.evaluate(() => { bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0); const me = bb.S.bots[0]; me.x = 1030; me.y = 700; me.grounded = false; bb.run(90); bb.pause(false) })
    const y0 = await p.evaluate(() => bb.S.bots[0].y)
    await p.keyboard.down('Space'); await p.waitForTimeout(ms); await p.keyboard.up('Space')
    let minY = y0; for (let i = 0; i < 20; i++) { await p.waitForTimeout(40); minY = Math.min(minY, await p.evaluate(() => bb.S.bots[0].y)) }
    return Math.round(y0 - minY)
  }
  const small = await h(40), big = await h(700)
  expect(big > small * 1.8 && small > 8, JSON.stringify({ small, big })); return { small, big }
})
await t('ジャンプ中に左右へ動ける（キーを押した方へ流れる）', async () => {
  const dx = async (key) => {
    await p.evaluate(() => { bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0); const me = bb.S.bots[0]; me.x = 1150; me.y = 700; me.grounded = false; bb.run(90); bb.pause(false) })
    const x0 = await p.evaluate(() => bb.S.bots[0].x)
    await p.keyboard.down('Space'); await p.waitForTimeout(120)
    if (key) await p.keyboard.down(key)
    await p.waitForTimeout(350)
    const x1 = await p.evaluate(() => [bb.S.bots[0].x, bb.S.bots[0].grounded])
    if (key) await p.keyboard.up(key)
    await p.keyboard.up('Space'); await p.waitForTimeout(500)
    return { d: Math.round(x1[0] - x0), air: !x1[1] }
  }
  const none = await dx(null), left = await dx('KeyA'), right = await dx('KeyD')
  expect(left.air && right.air, 'not airborne'); expect(Math.abs(none.d) < 3 && left.d < -20 && right.d > 20, JSON.stringify({ none, left, right }))
  return { none: none.d, left: left.d, right: right.d }
})
await t('表情: 狙う・当てる・撃たれる・吹き飛ぶ・瀕死・撃破で顔が変わる', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0)
    const S = bb.S, me = S.bots[0], e = S.bots[1], m = bb.moodOf
    const out = { idle: m(e) }
    me.power = 0.5; out.aim = m(me); me.power = 0.95; out.strain = m(me); me.power = 0
    e.x = me.x + 100; e.y = me.y; e.grounded = true; e.hp = 100
    me.weapon = 'rocket'; bb.fire(Math.atan2(e.y - 6 - (me.y - 3), e.x - me.x), 1); bb.run(14)
    out.attacker = m(me); out.victim = m(e); bb.run(30); out.flying = m(e)
    bb.run(200); e.hp = 10; out.low = m(e)
    e.hp = 1; e.alive = true; me.moodT = 0; bb.S.bots[1].lastHit = { by: me, t: S.time }; e.y = 1200; bb.run(5); out.ko = m(me)
    return out
  })
  expect(r.idle === 'idle' && r.aim === 'focus' && r.strain === 'strain' && r.attacker === 'happy' && r.victim === 'hurt' && r.low === 'worried' && r.ko === 'smug', JSON.stringify(r)); return r
})
await t('余韻: 撃破のあと、次の番まで2秒以上映し続ける', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0)
    const S = bb.S, me = S.bots[0], e = S.bots[1]
    e.lastHit = { by: me, t: S.time }; e.x = 1000; e.y = 1100; e.grounded = false; e.vy = 200
    S.turnTime = 0; bb.run(1)
    let f = 0; const idx = S.turnIdx; while (S.turnIdx === idx && f < 60 * 15) { bb.run(1); f++ }
    return { sec: +(f / 60).toFixed(2), ko: !e.alive || e.deaths > 0 }
  })
  expect(r.sec >= 2 && r.ko, JSON.stringify(r)); return r
})
await t('置物: 足元を崩すと落ちる', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.start({ seed: 9, stage: 'jungle', skipLobby: true }); bb.toTurn(0)
    const d = bb.T.decos.find(q => !q.hang); const y0 = d.y
    bb.carveAt(d.x, d.y + 30, 34); bb.run(60)
    return { n: bb.T.decos.length, fell: d.dead || d.y > y0 + 5 }
  })
  expect(r.n > 5 && r.fell, JSON.stringify(r)); return r
})
await t('ミニマップが出ていて、押すと全体表示、ホイールで拡大縮小', async () => {
  await p.evaluate(() => { bb.pause(true); bb.start({ seed: 9, skipLobby: true }); bb.toTurn(0); bb.pause(false) })
  await p.waitForTimeout(300)
  const vis = await p.isVisible('#mini')
  const lum = await p.evaluate(() => { const c = document.querySelector('#mini'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++; return n })
  const s0 = await p.evaluate(() => bb.S.cam.s)
  await p.mouse.move(640, 400); await p.mouse.wheel(0, 400); await p.mouse.wheel(0, 400); await p.waitForTimeout(700)
  const s1 = await p.evaluate(() => bb.S.cam.s)
  await p.click('#mini'); await p.waitForTimeout(800)
  const over = await p.evaluate(() => bb.S.cam.over)
  await p.click('#mini')
  expect(vis && lum > 100 && s1 < s0 * 0.9 && over, JSON.stringify({ vis, lum, s0, s1, over })); return { s0: +s0.toFixed(2), s1: +s1.toFixed(2) }
})
await t('音: BGMと全効果音を鳴らしてもエラーが出ない', async () => {
  const r = await p.evaluate(async () => {
    const errs = []
    try { bb.auInit(); bb.playSong('match'); await new Promise(r => setTimeout(r, 400)); for (const n of bb.SFX_NAMES) { bb.S.silent = false; bb.sfx(n, 1) } await new Promise(r => setTimeout(r, 300)) } catch (e) { errs.push(e.message) }
    return { errs, state: bb.AU.ctx && bb.AU.ctx.state, scheduled: bb.AU.step }
  })
  expect(!r.errs.length && r.scheduled > 0, JSON.stringify(r)); return r
})
// ---------- ルールと武器（内部状態を直接組んで確かめる）
await p.evaluate(() => bb.pause(true))
const setup = `
  bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0);
  var S = bb.S, me = S.bots[0], e = S.bots[1];
  S.crates.length = 0;
  S.bots.slice(2).forEach(b => { b.x = 60 + b.id * 10; b.y = 300; b.alive = false });
  // 自分の右 110px の同じ足場に敵を置く
  function putNear(dx) { e.x = me.x + dx; let f = Math.round(me.y + 14 - 40); while (f < 1160 && !(bb.T.m[(f + 1) * 2400 + Math.round(e.x)])) f++; e.y = f - 14; e.grounded = true; e.vx = e.vy = 0 }
`
const run = (body) => p.evaluate(new Function(setup + body))
await t('ロケットが当たると敵のHPが減り、与ダメージ×10点が入る', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); putNear(110); bb.run(5);
    const hp0 = e.hp; me.weapon='rocket'; bb.fire(Math.atan2(e.y-6-(me.y-3), e.x-me.x), 1); bb.run(40);
    return { dmg: hp0 - e.hp, score: me.score }`)
  expect(r.dmg > 15, JSON.stringify(r)); expect(r.score === r.dmg * 10, JSON.stringify(r)); return r
})
await t('爆発で地形が削れる（マスクの画素が減る）', async () => {
  const r = await run(`const n0 = bb.solidCount(); me.weapon='rocket'; bb.fire(Math.PI/2, 0.5); bb.run(30); return { removed: n0 - bb.solidCount() }`)
  expect(r.removed > 1500, JSON.stringify(r)); return r
})
await t('撃破で +500 とキル数、相手は次の番に満タンで復活', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); putNear(110); bb.run(5); e.hp = 3;
    bb.fire(Math.atan2(e.y-6-(me.y-3), e.x-me.x), 1); bb.run(40);
    const k = { kills: me.kills, alive: e.alive, score: me.score };
    bb.toTurn(1); k.respawned = e.alive && e.hp === e.maxHp; return k`)
  expect(r.kills === 1 && !r.alive && r.score >= 500 && r.respawned, JSON.stringify(r)); return r
})
await t('水に落ちると死に、直前に当てた相手に撃破がつく', async () => {
  const r = await run(`e.lastHit = { by: me, t: S.time }; e.x = 1000; e.y = 1100; e.grounded = false; e.vx = 0; e.vy = 100; bb.run(40);
    return { alive: e.alive, kills: me.kills }`)
  expect(r.kills === 1, JSON.stringify(r)); return r
})
await t('爆風で吹き飛ばして水に落とせる（端の敵の内側にロケット）', async () => {
  const r = await run(`let ex = 0; for (let x = 0; x < 600; x++) { let y = 400; while (y < 1100 && !bb.T.m[y*2400+x]) y++; if (y < 900) { ex = x + 14; break } }
    let f = 400; while (!bb.T.m[(f+1)*2400+ex]) f++; e.x = ex; e.y = f - 14; e.grounded = true; e.hp = 999; e.maxHp = 999;
    me.x = ex + 130; let g = 400; while (!bb.T.m[(g+1)*2400+Math.round(me.x)]) g++; me.y = g - 14; me.grounded = true;
    me.weapon = 'rocket'; bb.fire(Math.atan2(e.y - 8 - (me.y - 3), e.x - me.x), 1); bb.run(400);
    return { alive: e.alive, ex: Math.round(e.x), kills: me.kills }`)
  expect(r.kills === 1, JSON.stringify(r)); return r
})
await t('グレネードは約3秒後に爆発する', async () => {
  const r = await run(`me.weapon='grenade'; me.ammo.grenade = 5; bb.fire(-1.3, 0.4); let n = 0; while (S.proj.length && n < 400) { bb.run(1); n++ } return { sec: +(n/60).toFixed(2) }`)
  expect(r.sec > 2.7 && r.sec < 3.3, JSON.stringify(r)); return r
})
await t('テレポ弾は撃っても番が終わらず、着弾点へ移動する', async () => {
  const r = await run(`me.ammo.tele = 2; me.weapon='tele'; const x0 = me.x; bb.fire(-0.9, 0.6); bb.run(120);
    return { phase: S.phase, fired: S.fired, moved: Math.round(Math.abs(me.x - x0)) }`)
  expect(r.phase === 'turn' && !r.fired && r.moved > 60, JSON.stringify(r)); return r
})
await t('リボルバー6発が射線上の敵に当たる', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); putNear(200); bb.run(5); const hp0 = e.hp; me.ammo.revolver = 2; me.weapon='revolver';
    bb.fire(Math.atan2(e.y-6-(me.y-3), e.x-me.x), 1); bb.run(90); return { dmg: hp0 - e.hp }`)
  expect(r.dmg >= 30, JSON.stringify(r)); return r
})
await t('ハンマーは隣の敵を大きく吹き飛ばす', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); putNear(28); bb.run(5); const x0 = e.x, hp0 = e.hp; me.ammo.hammer = 3; me.weapon='hammer';
    bb.fire(Math.atan2(e.y-6-(me.y-3), e.x-me.x), 1); bb.run(20); return { dmg: hp0 - e.hp, pushed: Math.round(e.x - x0) }`)
  expect(r.dmg >= 25 && r.pushed > 30, JSON.stringify(r)); return r
})
await t('地雷は地面に刺さり、敵が近づくと爆発する', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); me.ammo.mine = 2; me.weapon='mine'; bb.fire(-0.3, 0.3); bb.run(90);
    const m = S.proj.find(q => q.k === 'mine'); const stuck = m && m.stuck; const hp0 = e.hp;
    e.x = m.x + 20; e.y = m.y - 14; e.grounded = false; bb.run(120);
    return { stuck, exploded: !S.proj.some(q => q.k === 'mine'), dmg: hp0 - e.hp }`)
  expect(r.stuck && r.exploded && r.dmg > 10, JSON.stringify(r)); return r
})
await t('鉄球はぶつかった相手にダメージを与えて転がり、あとで爆発する', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); putNear(90); bb.run(5); const hp0 = e.hp; me.ammo.cannon = 2; me.weapon='cannon';
    bb.fire(Math.atan2(e.y-6-(me.y-3), e.x-me.x), 0.8); bb.run(300); return { dmg: hp0 - e.hp, gone: !S.proj.length }`)
  expect(r.dmg > 10 && r.gone, JSON.stringify(r)); return r
})
await t('火炎ボトルの火がしばらく燃えて敵を削る（撃った側に点）', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); putNear(120); bb.run(5); const hp0 = e.hp; me.ammo.fire = 2; me.weapon='fire';
    bb.fire(Math.atan2(e.y-20-(me.y-3), e.x-me.x), 0.55); bb.run(30); const fl = S.flames.length; bb.run(200); return { flames: fl, dmg: hp0 - e.hp, score: me.score }`)
  expect(r.flames > 5 && r.dmg > 0 && r.score > 0, JSON.stringify(r)); return r
})
await t('毒ガスを浴びた敵は、自分の番のたびにHPが減る', async () => {
  const r = await run(`me.x = 1030; me.y = 700; me.grounded=false; bb.run(120); putNear(120); bb.run(5); me.ammo.gas = 2; me.weapon='gas';
    bb.fire(Math.atan2(e.y-6-(me.y-3), e.x-me.x), 0.6); bb.run(90); const pz = e.poison; const hp1 = e.hp; bb.toTurn(1); return { poison: pz, tick: hp1 - e.hp }`)
  expect(r.poison === 3 && r.tick > 0, JSON.stringify(r)); return r
})
await t('補給箱: 回復・弾・リベットが拾える', async () => {
  const r = await run(`const out = {};
    for (const kind of ['heal','ammo','rivet']) { me.hp = 50; const sc = me.score, am = JSON.stringify(me.ammo);
      S.crates.push({ x: me.x, y: me.y, vy: 0, kind, landed: true, dead: false }); bb.run(2);
      out[kind] = kind === 'heal' ? me.hp - 50 : kind === 'rivet' ? (me.rivetBonus || 0) : (JSON.stringify(me.ammo) !== am) }
    return out`)
  expect(r.heal === 30 && r.rivet === 50 && r.ammo === true, JSON.stringify(r)); return r
})
await t('手番中に何もしなければ25秒で次の人の番になる', async () => {
  const r = await run(`const n0 = S.turnIdx; let f = 0; while (S.turnIdx === n0 && f < 60*40) { bb.run(1); f++ } return { sec: +(f/60).toFixed(1), next: S.turnIdx }`)
  expect(r.sec > 25 && r.sec < 27, JSON.stringify(r)); return r
})

// ---------- CPU
await t('CPU は毎回、制限時間内に撃つ（3シード×各12手）', async () => {
  const r = await p.evaluate(() => {
    const out = { turns: 0, fired: 0, hits: 0, late: 0, dmg: 0 }
    for (const seed of [1, 2, 3]) {
      bb.start({ seed, stage: seed === 2 ? 'jungle' : 'canyon', diff: 'normal', allCpu: true, skipLobby: true })
      for (let k = 0; k < 12; k++) {
        bb.toTurn((bb.S.turnIdx + 1) % 4)
        const b = bb.S.active, before = bb.S.bots.reduce((s, o) => s + (o !== b ? o.hp : 0), 0)
        const dealt0 = b.dealt
        let f = 0
        while (!bb.S.fired && bb.S.phase === 'turn' && f < 60 * 30) { bb.run(1); f++ }
        out.turns++
        if (bb.S.fired) out.fired++; else out.late++
        bb.run(60 * 6)
        if (b.dealt > dealt0) { out.hits++; out.dmg += b.dealt - dealt0 }
      }
    }
    return out
  })
  expect(r.fired === r.turns, JSON.stringify(r)); expect(r.hits >= r.turns * 0.3, 'hit rate low ' + JSON.stringify(r)); return r
})
await t('CPU 同士で4分の試合を最後まで回せる（固まらない・結果が出る）', async () => {
  const r = await p.evaluate(() => {
    bb.start({ seed: 77, stage: 'jungle', diff: 'hard', allCpu: true, skipLobby: true })
    let f = 0, settleMax = 0, settleRun = 0, turns = 0, last = -1
    while (bb.S.phase !== 'over' && f < 60 * 400) {
      bb.run(1); f++
      if (bb.S.phase === 'settle') { settleRun++; settleMax = Math.max(settleMax, settleRun) } else settleRun = 0
      if (bb.S.turnIdx !== last) { turns++; last = bb.S.turnIdx }
    }
    bb.run(120)
    return { sec: Math.round(f / 60), over: bb.S.phase === 'over', turns, settleMax: +(settleMax / 60).toFixed(1), result: !document.querySelector('#result').hidden, scores: bb.S.bots.map(b => b.score), kills: bb.S.bots.map(b => b.kills), deaths: bb.S.bots.map(b => b.deaths) }
  })
  expect(r.over && r.result && r.sec <= 250, JSON.stringify(r)); expect(r.scores.some(s => s > 0), 'no score'); return r
})
await t('CPU の1回の考える時間がフレームを止めない（1フレーム内の最大処理）', async () => {
  const ms = await p.evaluate(() => {
    bb.start({ seed: 4, allCpu: true, skipLobby: true }); bb.toTurn(1)
    let worst = 0
    for (let i = 0; i < 60 * 6 && !bb.S.fired; i++) { const t0 = performance.now(); bb.S.manual = false; bb.update(1 / 60); const d = performance.now() - t0; worst = Math.max(worst, d) }
    bb.S.manual = true
    return worst
  })
  expect(ms < 30, 'worst ' + ms); return { worstMs: +ms.toFixed(1) }
})

// ---------- 育成
await t('試合が終わるとリベットと経験値が入り、保存される', async () => {
  const r = await p.evaluate(() => {
    bb.resetProfile(); const r0 = bb.profile.rivets
    bb.start({ seed: 8, skipLobby: true }); const me = bb.S.bots[0]
    me.score = 3000; me.dealt = 200; me.kills = 2; bb.S.bots.slice(1).forEach(b => b.score = 100)
    bb.finish(); bb.run(120)
    const saved = JSON.parse(localStorage.getItem('boombolts.v1'))
    return { rivets: bb.profile.rivets - r0, lv: bb.profile.lv, saved: saved.rivets === bb.profile.rivets, side: document.querySelector('#resSide').innerText.replace(/\s+/g, ' ').slice(0, 160) }
  })
  expect(r.rivets > 0 && r.saved && r.lv >= 2, JSON.stringify(r)); return r
})
await t('レベルが上がると武器が解放され、試合で使える', async () => {
  const r = await p.evaluate(() => {
    bb.setProfile({ lv: 4 }); bb.start({ seed: 8, skipLobby: true }); const me = bb.S.bots[0]
    return { hammer: me.ammo.hammer, revolver: me.ammo.revolver, mine: me.ammo.mine }
  })
  expect(r.hammer > 0 && r.revolver > 0 && r.mine === 0, JSON.stringify(r)); return r
})
await t('ガレージ: お金が足りないと買えない／足りれば買えて装備される', async () => {
  await p.evaluate(() => { bb.goTitle(); bb.setProfile({ lv: 3, rivets: 100, gears: 0, owned: { h1: 0, b1: 0, l1: 0 }, eq: { head: 'h1', body: 'b1', legs: 'l1' } }); bb.openGarage() })
  await p.click('#gTabs button[data-s="legs"]')
  await p.click('#gList .part:nth-child(2) button[data-a="buy"]')
  const a = await p.evaluate(() => ({ owned: 'l2' in bb.profile.owned, riv: bb.profile.rivets }))
  await p.evaluate(() => { bb.setProfile({ rivets: 1000 }); bb.openGarage() })
  await p.click('#gTabs button[data-s="legs"]')
  await p.click('#gList .part:nth-child(2) button[data-a="buy"]')
  const b2 = await p.evaluate(() => ({ owned: 'l2' in bb.profile.owned, eq: bb.profile.eq.legs, riv: bb.profile.rivets }))
  expect(!a.owned && a.riv === 100, JSON.stringify(a)); expect(b2.owned && b2.eq === 'l2' && b2.riv === 650, JSON.stringify(b2)); return b2
})
await t('ガレージ: 強化すると段階と能力値が上がり、ランク未到達は鍵', async () => {
  await p.click('#gList .part:nth-child(2) button[data-a="up"]')
  const r = await p.evaluate(() => ({ lv: bb.profile.owned.l2, riv: bb.profile.rivets, lockedRank3: document.querySelector('#gList .part:nth-child(3)').classList.contains('locked'), jump: [...document.querySelectorAll('#gStats .st')].find(e => e.innerText.includes('ジャンプ')).innerText.replace(/\s+/g, ' ') }))
  expect(r.lv === 1 && r.riv < 650 && r.lockedRank3, JSON.stringify(r)); return r
})
await t('パーツの能力値が試合に効く（HP・装甲で被ダメが減る）', async () => {
  const r = await p.evaluate(() => {
    const hit = () => { bb.start({ seed: 8, skipLobby: true }); bb.toTurn(1); const me = bb.S.bots[0], e = bb.S.bots[1];
      e.x = me.x - 60; e.y = me.y; e.weapon = 'rocket'; e.st.atk = 0; const h = me.hp; bb.fire(0, 1); bb.run(30); return { maxHp: me.maxHp, taken: h - me.hp } }
    bb.setProfile({ lv: 10, owned: { h1: 0, b1: 0, l1: 0 }, eq: { head: 'h1', body: 'b1', legs: 'l1' } }); const a = hit()
    bb.setProfile({ owned: { h1: 0, b1: 0, l1: 0, h3: 3, b4: 3, l4: 3 }, eq: { head: 'h3', body: 'b4', legs: 'l4' } }); const b = hit()
    return { base: a, armored: b }
  })
  expect(r.armored.maxHp > r.base.maxHp && r.armored.taken < r.base.taken && r.base.taken > 0, JSON.stringify(r)); return r
})
await t('保存領域が使えない環境でも起動して遊べる', async () => {
  const q = await page({ initScript: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied') } }) } })
  await q.click('#bStart'); await q.click('#bFreeGo'); await q.waitForFunction(() => bb.S.phase === 'turn', null, { timeout: 8000 })
  const e = q.errs.filter(x => !/denied/.test(x)); expect(e.length === 0, e.join('|'))
  await q.context().close()
})
await t('壊れた保存データでも起動する', async () => {
  const q = await page({ initScript: () => { localStorage.setItem('boombolts.v1', '{broken') } })
  expect(q.errs.length === 0, q.errs.join('|')); expect(await q.evaluate(() => bb.profile.lv === 1), 'lv'); await q.context().close()
})

await t('ストーリー: 第1話だけ選べて、会話→ロビー→試合の順に進む', async () => {
  await p.evaluate(() => { bb.pause(false); bb.resetProfile(); bb.goTitle() })
  await p.click('#bStory')
  const list = await p.evaluate(() => [...document.querySelectorAll('#storyList .chap:not(.tut)')].map(b => b.disabled))
  await p.click('#storyList .chap:nth-child(2)')
  const talk1 = await p.isVisible('#talk')
  const narr = await p.evaluate(() => document.querySelector('#talkName').textContent === 'ドック')
  let n = 0; while (await p.isVisible('#talk') && n < 30) { await p.click('#talk'); await p.waitForTimeout(40); n++ }
  const ph = await p.evaluate(() => bb.S.phase)
  expect(list.length === 5 && !list[0] && list.slice(1).every(Boolean), JSON.stringify(list))
  expect(talk1 && narr && ph === 'lobby', JSON.stringify({ talk1, narr, ph })); return { clicks: n }
})
await t('ストーリー: 目標達成で勝ちの会話→結果「目標達成」→次の話が解放', async () => {
  await p.evaluate(() => { bb.pause(true); const S = bb.S; S.phase = 'turn'; S.active = S.bots[0]; S.bots[0].kills = 1; S.bots[0].score = 900; bb.finish(); bb.run(100) })
  const talk = await p.isVisible('#talk')
  const name = await p.evaluate(() => document.querySelector('#talkName').textContent)
  await p.evaluate(() => bb.pause(false))
  let n = 0; while (await p.isVisible('#talk') && n < 30) { await p.click('#talk'); await p.waitForTimeout(40); n++ }
  await p.waitForTimeout(200)
  const r = await p.evaluate(() => ({ head: document.querySelector('#resHead').textContent, btn: document.querySelector('#bAgain').textContent, story: bb.profile.story, goal: (document.querySelector('.goal') || {}).textContent }))
  expect(talk && (name === 'ポンコツ' || name === 'ドック') && r.head === '目標達成！' && r.story === 1 && r.btn === '次の話へ', JSON.stringify({ talk, name, ...r })); return r
})
await t('ストーリー: 次の話へ→第2話の会話。失敗すると負けの会話→未解放のまま', async () => {
  await p.click('#bAgain'); await p.waitForTimeout(100)
  const first = await p.evaluate(() => document.querySelector('#talkName').textContent)
  await p.click('#talkSkip')
  await p.evaluate(() => { bb.pause(true); const S = bb.S; S.phase = 'turn'; S.active = S.bots[0]; S.bots.forEach((b, i) => b.score = [10, 900, 800, 700][i]); bb.finish(); bb.run(100); bb.talkEnd(); })
  const r = await p.evaluate(() => ({ head: document.querySelector('#resHead').textContent, btn: document.querySelector('#bAgain').textContent, story: bb.profile.story }))
  await p.evaluate(() => bb.pause(false))
  expect(first === 'ネジマル' && r.head === '目標ならず' && r.story === 1 && r.btn === 'もう一戦', JSON.stringify({ first, ...r })); return r
})
await t('声: 当てた側と当たった側に吹き出しが出る', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0)
    const S = bb.S, me = S.bots[0], e = S.bots[1]
    e.x = me.x + 100; e.y = me.y; e.grounded = true; me.sayCd = 0; e.sayCd = 0; me.say = null
    bb.fire(Math.atan2(e.y - 6 - (me.y - 3), e.x - me.x), 1); bb.run(14)
    return { me: me.say && me.say.kind, e: e.say && e.say.text }
  })
  expect(r.me === 'hit' && r.e, JSON.stringify(r)); return r
})
await t('移動: ジェットパックで上昇でき、番は終わらない', async () => {
  await p.evaluate(() => { bb.goTitle(); bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0); bb.pause(false) })
  await p.click('#wslot'); await p.click('#tray .wbtn[data-k="jet"]')
  const y0 = await p.evaluate(() => bb.S.bots[0].y)
  await p.keyboard.down('Space'); await p.waitForTimeout(900); await p.keyboard.up('Space')
  const r = await p.evaluate(() => ({ rise: Math.round(bb.S.bots[0].y), phase: bb.S.phase, fuel: bb.S.bots[0].jet && +bb.S.bots[0].jet.fuel.toFixed(1), ammo: bb.S.bots[0].ammo.jet }))
  expect(y0 - r.rise > 60 && r.phase === 'turn' && r.ammo === 1, JSON.stringify({ y0, ...r })); return { rise: Math.round(y0 - r.rise), fuel: r.fuel }
})
await t('移動: ワイヤーフックで刺さった所へ引き寄せられる', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0)
    const me = bb.S.bots[0]; me.x = 1030; me.y = 700; me.grounded = false; bb.run(90)
    const x0 = me.x, y0 = me.y; me.weapon = 'hook'
    // 右上の岩（中央の浮島の上の小島）に向けて撃つ
    let a = -1.2, best = null
    for (let k = 0; k < 40; k++) { a = -0.3 - k * 0.06; best = a; let x = me.x, y = me.y - 3, hit = false; for (let d = 0; d < 430; d += 4) { x += Math.cos(a) * 4; y += Math.sin(a) * 4; if (bb.T.m[(y | 0) * 2400 + (x | 0)]) { hit = true; break } } if (hit && Math.hypot(x - me.x, y - me.y) > 100) break }
    const ok = bb.fire(best, 1); bb.run(90)
    return { ok, moved: Math.round(Math.hypot(me.x - x0, me.y - y0)), phase: bb.S.phase }
  })
  expect(r.ok && r.moved > 60 && r.phase === 'turn', JSON.stringify(r)); return r
})
await t('移動: パラシュートを開くとゆっくり落ち、落下ダメージがない', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0)
    const me = bb.S.bots[0]; me.x = 1200; me.y = 200; me.grounded = false; me.vy = 0; me.chute = true; const hp = me.hp
    bb.run(30); const vy = me.vy; bb.run(400)
    return { vy: Math.round(vy), landed: me.grounded, dmg: hp - me.hp, closed: !me.chute }
  })
  expect(r.vy <= 85 && r.landed && r.dmg === 0 && r.closed, JSON.stringify(r)); return r
})
await t('チュートリアル: 歩く→跳ぶ→撃つ→武器替え→落とす を実操作で通し、完了でストーリー画面へ', async () => {
  await p.evaluate(() => { bb.pause(false); bb.resetProfile(); bb.goTitle() })
  await p.click('#bStory'); await p.click('#storyList .chap.tut')
  const doc = await p.evaluate(() => document.querySelector('#talkName').textContent)
  let n = 0; while (await p.isVisible('#talk') && n < 20) { await p.click('#talk'); await p.waitForTimeout(40); n++ }
  const steps = []
  const step = () => p.evaluate(() => bb.TUT && bb.TUT.step)
  const waitStep = async (k, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await step() >= k) return true; await p.waitForTimeout(50) } return false }
  steps.push(await p.isVisible('#coach'))
  // 1 歩く
  await p.keyboard.down('KeyD'); const s1 = await waitStep(1, 8000); await p.keyboard.up('KeyD'); steps.push(s1)
  // 2 段差に跳び乗る（右へ歩きつつ長押しジャンプ）
  await p.waitForTimeout(200)
  let s2 = false
  for (let k = 0; k < 6 && !s2; k++) {
    const x = await p.evaluate(() => bb.S.bots[0].x)
    if (x > 560) { await p.keyboard.down('KeyA'); await p.waitForTimeout(300); await p.keyboard.up('KeyA') }
    await p.keyboard.down('KeyD'); await p.keyboard.down('Space'); await p.waitForTimeout(260); await p.keyboard.up('KeyD'); await p.waitForTimeout(250); await p.keyboard.up('Space')
    s2 = await waitStep(2, 1600)
  }
  steps.push(s2)
  // 3 かかしを撃つ（ドラッグで狙う）
  const aim = await p.evaluate(() => { const me = bb.S.bots[0], d = bb.S.bots[1]; return { me: [me.x, me.y], d: [d.x, d.y] } })
  // 当たる角度を弾道計算で探し、その方向へドラッグする（人が狙えば当たる距離かの確認も兼ねる）
  const shot = await p.evaluate(() => { const me = bb.S.bots[0], d = bb.S.bots[1]; let best = null
    for (let a = -1.4; a < -0.1; a += 0.01) { const r = bb.simShot(me, 'rocket', a, 1); const dist = Math.hypot(r.x - d.x, r.y - (d.y - 6)); if (!best || dist < best.dist) best = { a, dist } }
    return best })
  await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(400 + 160 * Math.cos(shot.a), 400 + 160 * Math.sin(shot.a), { steps: 4 }); await p.mouse.up()
  const s3 = await waitStep(3, 4000)
  steps.push(s3)
  // 4 武器を替える
  await p.keyboard.press('Digit2'); steps.push(await waitStep(4, 3000))
  // 5 落とす（ここは内部で水へ押し出して判定だけ確かめる）
  await p.evaluate(() => { const d = bb.S.bots[1]; d.vx = 300; d.vy = -100; d.grounded = false; d.x += 40 })
  steps.push(await waitStep(5, 6000))
  await p.waitForTimeout(300)
  let m = 0; while (await p.isVisible('#talk') && m < 20) { await p.click('#talk'); await p.waitForTimeout(40); m++ }
  await p.waitForTimeout(300)
  const r = await p.evaluate(() => ({ story: !document.querySelector('#story').hidden, tut: bb.profile.tut, riv: bb.profile.rivets }))
  expect(shot.dist < 40 && doc === 'ドック' && steps.every(Boolean) && r.story && r.tut && r.riv === 400, JSON.stringify({ doc, steps, aim, shot, ...r })); return { steps: steps.length, ...r }
})
await t('物語: 第1話の冒頭でドックが島と大会のわけを語る', async () => {
  await p.click('#storyList .chap:nth-child(2)')
  const lines = []
  for (let i = 0; i < 6; i++) { lines.push(await p.evaluate(() => document.querySelector('#talkName').textContent + ':' + bb.STORY[0].intro[0][2].slice(0, 6))); await p.click('#talk'); await p.click('#talk') }
  const txt = await p.evaluate(() => bb.STORY.map(c => c.intro.concat(c.win).map(l => l[2]).join('')).join(''))
  expect(lines[0].startsWith('ドック') && /大電池/.test(txt) && /戦争/.test(txt) && /順番に撃つ/.test(txt), lines[0]); await p.evaluate(() => bb.talkEnd())
  return { first: lines[0] }
})
await t('ロボ同士は重ならない（歩いてぶつかると止まる・重なりは押し分ける）', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.start({ seed: 9, stage: 'canyon', skipLobby: true }); bb.toTurn(0)
    const S = bb.S, me = S.bots[0], e = S.bots[1]
    me.x = 1030; me.y = 700; me.grounded = false; e.x = 1100; e.y = 700; e.grounded = false; bb.run(90)
    bb.run(240, { moveKey: 1 })
    const gapWalk = Math.round(e.x - me.x)
    // わざと同じ場所に重ねる
    e.x = me.x + 3; e.y = me.y; bb.run(20, { moveKey: 0 })
    const gapSep = Math.round(Math.abs(e.x - me.x))
    // 上から落とす
    e.x = me.x; e.y = me.y - 60; e.grounded = false; e.vy = 0; bb.run(120)
    const gapDrop = Math.round(Math.abs(e.x - me.x))
    return { gapWalk, gapSep, gapDrop }
  })
  expect(r.gapWalk >= 22 && r.gapSep >= 22 && r.gapDrop >= 20, JSON.stringify(r)); return r
})
await t('ショップ: 弾を買うと持ち越しになり、試合の弾に上乗せ。基本を使い切ってから減る', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.goTitle(); bb.resetProfile(); bb.setProfile({ lv: 3, rivets: 5000, gears: 10 })
    const sale = bb.saleWeapon()
    bb.buyAmmo('grenade'); const afterBuy = { riv: bb.profile.rivets, stock: bb.profile.stock.grenade }
    bb.start({ seed: 9, skipLobby: true }); bb.toTurn(0); const me = bb.S.bots[0]
    const start = me.ammo.grenade
    me.weapon = 'grenade'
    for (let i = 0; i < 5; i++) { bb.S.fired = false; bb.S.phase = 'turn'; bb.fire(-1, 0.3); bb.run(200); bb.toTurn(0); me.weapon = 'grenade' }
    const afterBase = { ammo: me.ammo.grenade, stock: bb.profile.stock.grenade }
    bb.S.fired = false; bb.S.phase = 'turn'; bb.fire(-1, 0.3)
    return { sale, afterBuy, start, afterBase, afterOne: bb.profile.stock.grenade }
  })
  const price = r.sale === 'grenade' ? 204 : 240
  expect(r.afterBuy.riv === 5000 - price && r.afterBuy.stock === 8 && r.start === 13 && r.afterBase.stock === 8 && r.afterOne === 7, JSON.stringify(r)); return r
})
await t('ショップ: 武器パック・ブースト・両替が効き、現金のギアは押しても買えない', async () => {
  const r = await p.evaluate(() => {
    bb.goTitle(); bb.resetProfile(); bb.setProfile({ lv: 5, rivets: 2000, gears: 10 })
    bb.buyPack(bb.PACKS[0]); const st = Object.values(bb.profile.stock).reduce((a, b) => a + b, 0)
    document.querySelector('#reveal').hidden = true
    bb.openShop(); document.querySelector('#shopTabs button[data-t="boost"]').click()
    document.querySelectorAll('#shopList .buy')[0].click(); document.querySelectorAll('#shopList .buy')[1].click()
    const kits = bb.profile.kits, xp2 = bb.profile.xp2
    document.querySelector('#shopTabs button[data-t="gear"]').click()
    const btns = [...document.querySelectorAll('#shopList .buy')]
    const g0 = bb.profile.gears; btns[0].click(); const exch = { gears: bb.profile.gears, riv: bb.profile.rivets }
    const moneyDisabled = btns.slice(1).every(b => b.disabled)
    bb.start({ seed: 9, skipLobby: true }); const boost = bb.S.bots[0].boost
    return { st, kits, xp2, exch, g0, moneyDisabled, boost }
  })
  expect(r.st === 9 && r.kits === 1 && r.xp2 === 3 && r.exch.gears === r.g0 - 5 && r.moneyDisabled && r.boost === 3, JSON.stringify(r)); return r
})
await t('ショップ: 試合中に弾が切れると、試合を止めずに購入案内が出て買える', async () => {
  const r = await p.evaluate(() => {
    bb.goTitle(); bb.resetProfile(); bb.setProfile({ lv: 3, rivets: 3000 })
    bb.start({ seed: 9, skipLobby: true }); bb.toTurn(0); const me = bb.S.bots[0]
    me.ammo.bouncer = 1; me.weapon = 'bouncer'; bb.fire(-1, 0.3)
    const shown = !document.querySelector('#offer').hidden
    document.querySelector('#offer .buy').click()
    return { shown, ammo: me.ammo.bouncer, phase: bb.S.phase }
  })
  expect(r.shown && r.ammo === 8 && r.phase === 'retreat', JSON.stringify(r)); return r
})
await t('英語: 切り替えるとタイトル・武器・会話・結果が英語になり、戻すと日本語', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.goTitle(); bb.resetProfile(); bb.setLang('en'); bb.goTitle()
    const title = [document.querySelector('#bStory').innerText, document.querySelector('#bStart').innerText, document.querySelector('#bGarage').innerText, document.documentElement.lang]
    bb.start({ seed: 9, skipLobby: true }); bb.toTurn(0)
    const tray = [...document.querySelectorAll('#tray .wbtn span')].slice(0, 3).map(e => e.textContent)
    const card = document.querySelector('#cards .nm').textContent
    bb.goTitle(); bb.playChapter(0); bb.talkNext()
    const talk = document.querySelector('#talkText').textContent
    bb.talkEnd(); bb.S.bots[0].score = 900; bb.S.bots[0].kills = 1; bb.S.phase = 'turn'; bb.finish(); bb.run(100); bb.talkEnd()
    const res = document.querySelector('#resHead').textContent + ' / ' + document.querySelector('#resSide dl').innerText.split('\n')[0]
    // 日本語が残っていないか（画面に出ている文字）
    const jp = /[\u3040-\u30ff\u4e00-\u9fff]/
    const leftover = [...document.querySelectorAll('#result *')].filter(e => e.children.length === 0 && jp.test(e.textContent) && e.offsetParent).map(e => e.textContent).slice(0, 5)
    bb.goTitle(); bb.setLang('ja'); bb.goTitle()
    const back = document.querySelector('#bStart').innerText
    return { title, tray, card, talk, res, leftover, back }
  })
  expect(r.title[1] === 'Free Battle' && r.title[3] === 'en' && r.tray[0] === 'Rocket' && r.card === 'You' && /Scrap Island/.test(r.talk) && /Goal cleared/.test(r.res) && !r.leftover.length && r.back === 'フリー対戦', JSON.stringify(r)); return r
})
await t('遊び方: タイトルと一時停止から開け、PC/スマホで中身が変わる', async () => {
  const r = await p.evaluate(() => {
    bb.pause(true); bb.goTitle(); document.querySelector('#bHowto').click()
    const vis = !document.querySelector('#howto').hidden
    document.querySelector('#howtoTabs [data-t="pc"]').click(); const pc = document.querySelector('#howtoList b').textContent
    document.querySelector('#howtoTabs [data-t="sp"]').click(); const sp = document.querySelector('#howtoList b').textContent
    document.querySelector('#bHowtoBack').click(); const backTitle = !document.querySelector('#title').hidden
    return { vis, pc, sp, backTitle }
  })
  expect(r.vis && r.pc === 'A / D' && r.sp === '左スティック' && r.backTitle, JSON.stringify(r)); return r
})
await t('スマホのチュートリアル: 今やる操作の上に指ガイドが出る', async () => {
  const q = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })
  const pg = await q.newPage(); await pg.goto('http://localhost:5282/'); await pg.waitForFunction(() => window.__bbReady)
  const r = await pg.evaluate(async () => {
    bb.start({ stage: 'practice', seed: 4242, tutorial: true, skipTalk: true })
    await new Promise(r => setTimeout(r, 300))
    const g = document.querySelector('#guide'), L = document.querySelector('#stickL').getBoundingClientRect()
    return { shown: !g.hidden, anim: g.className, onStick: Math.abs(parseFloat(g.style.left) - (L.left + L.width / 2)) < 2, text: document.querySelector('#coachText').textContent }
  })
  await q.close()
  expect(r.shown && r.anim === 'g-right' && r.onStick && /左スティック/.test(r.text), JSON.stringify(r)); return r
})
// ---------- 速度（端末のリフレッシュレートに依存しない）
await t('ゲーム内時間が実時間どおり進む（1秒あたり約60ステップ）', async () => {
  const r = await p.evaluate(async () => {
    bb.goTitle(); bb.pause(false); bb.start({ seed: 1, skipLobby: true })
    const t0 = bb.S.tick, p0 = performance.now(); await new Promise(r => setTimeout(r, 2000)); const sec = (performance.now() - p0) / 1000; return Math.round((bb.S.tick - t0) / sec)
  })
  expect(r > 56 && r < 63, 'ticks/s ' + r); return { ticksPerSec: r }
})
await t('fps（試合中）', async () => {
  const r = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2) } requestAnimationFrame(f) }))
  return { fps: r }
})
await t('試合を通して画面側でエラーが出ていない', async () => { expect(p.errs.length === 0, p.errs.slice(0, 3).join('|')) })

console.log(results.join('\n'))
console.log(`\n${pass} ok / ${fail} fail`)
await browser.close(); server.kill()
process.exit(fail ? 1 : 0)
