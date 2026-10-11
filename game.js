'use strict';
// BOOM BOLTS  ブリキロボの砲撃戦
// 物理と時間で進むものは update()（固定60Hz）でだけ進める。draw() は今の状態を描くだけ。
(function () {

// ---------------------------------------------------------------- 定数
const W = 2400, H = 1300, WATER = 1170, G = 760, R = 14, STEP = 1 / 60;
const TURN_TIME = 25, RETREAT = 5, MATCH_TIME = 240, KILL_PTS = 500;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise1(rnd) {
  const k = [];
  for (let i = 0; i < 5; i++) k.push({ f: (0.004 + rnd() * 0.02) * (i + 1), p: rnd() * 6.28, a: 1 / (i + 1) });
  const s = k.reduce((q, o) => q + o.a, 0);
  return x => { let v = 0; for (const o of k) v += o.a * Math.sin(x * o.f + o.p); return v / s; };
}

// ---------------------------------------------------------------- 武器
const WP = {
  rocket:   { name: 'ロケット',   speed: 820, impact: true, R: 50, dmg: 45, push: 430, ammo: Infinity, lv: 1 },
  grenade:  { name: 'グレネード', speed: 640, rest: 0.42, fuse: 3, R: 56, dmg: 50, push: 450, ammo: 5, lv: 1 },
  hammer:   { name: 'ハンマー',   melee: true, fixed: 30, dmg: 32, push: 720, ammo: 3, lv: 2 },
  bouncer:  { name: '跳ねボール', speed: 660, rest: 0.86, fuse: 3.5, R: 46, dmg: 40, push: 380, ammo: 3, lv: 3 },
  revolver: { name: 'リボルバー', gun: true, fixed: 92, range: 900, dmg: 8, push: 150, ammo: 2, lv: 4 },
  mine:     { name: '地雷',       speed: 420, stick: true, R: 50, dmg: 45, push: 430, ammo: 2, lv: 5 },
  cannon:   { name: '鉄球',       speed: 600, grav: 1.15, rest: 0.22, roll: true, fuse: 2.4, contact: 14, R: 68, dmg: 52, push: 500, ammo: 2, lv: 6 },
  fire:     { name: '火炎ボトル', speed: 600, impact: true, fireBomb: true, R: 22, dmg: 6, push: 60, ammo: 2, lv: 7 },
  tele:     { name: 'テレポ弾',   speed: 760, impact: true, tele: true, ammo: 2, lv: 8 },
  gas:      { name: '毒ガス',     speed: 600, impact: true, gas: true, R: 30, dmg: 10, push: 60, ammo: 2, lv: 9 },
  // 移動アイテム（使っても番は終わらない）
  jet:      { name: 'ジェットパック', move: 'jet', ammo: 2, lv: 1 },
  hook:     { name: 'ワイヤーフック', move: 'hook', fixed: 110, range: 430, ammo: 4, lv: 1 },
  chute:    { name: 'パラシュート',   move: 'chute', ammo: 3, lv: 1 },
};
const WORDER = ['rocket', 'grenade', 'hammer', 'bouncer', 'revolver', 'mine', 'cannon', 'fire', 'tele', 'gas', 'jet', 'hook', 'chute'];
const WCOLOR = { jet: '#FF9330', hook: '#9AA3AB', chute: '#F2C230', rocket: '#D9DDE1', grenade: '#6E8F4E', hammer: '#9AA3AB', bouncer: '#FF4FA0', revolver: '#C9CED3', mine: '#F2C230', cannon: '#55595F', fire: '#FF8A2A', tele: '#4FE3F0', gas: '#A97CF0' };

const ICON = {
  rocket: '<path d="M5 19l3-3"/><path d="M14 4l6 0 0 6-8 8-6-6z"/><path d="M8 10l-4 1 3 3"/><path d="M14 16l-1 4-3-3"/>',
  grenade: '<circle cx="12" cy="14" r="6"/><path d="M10 8V6h4v2"/><path d="M14 6l4-2"/>',
  hammer: '<path d="M5 4h10v6H5z"/><path d="M10 10v11"/><path d="M15 7h4"/>',
  bouncer: '<circle cx="12" cy="9" r="5"/><path d="M4 21h16"/><path d="M8 17l1.5-2M16 17l-1.5-2"/>',
  revolver: '<path d="M3 8h15l2-2h1v4h-6l-2 2v7H9l1-7H3z"/>',
  mine: '<path d="M3 18h18"/><path d="M6 18a6 6 0 0 1 12 0"/><path d="M12 9V6"/>',
  cannon: '<circle cx="12" cy="13" r="7"/><path d="M9 10.5a3 3 0 0 1 3-2"/>',
  fire: '<path d="M10 3h4v4l3 4v10H7V11l3-4z"/><path d="M12 19c-2 0-2.4-2.4-.8-3.6 0 1.2 1.8 1 1.6-.9 1.6 1 1.6 4.5-.8 4.5z"/>',
  tele: '<circle cx="12" cy="12" r="2"/><path d="M12 6a6 6 0 1 1-6 6"/><path d="M12 2a10 10 0 1 1-10 10"/>',
  gas: '<path d="M7 15a4 4 0 0 1 .5-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7z"/><path d="M8 19v2M12 18v3M16 19v2"/>',
  jet: '<rect x="7" y="3" width="10" height="12" rx="3"/><path d="M9 15l-1 3M15 15l1 3"/><path d="M8 19c0 1.5 1 2.5 1 2.5M16 19c0 1.5-1 2.5-1 2.5"/>',
  hook: '<path d="M4 20l9-9"/><path d="M13 11l4-7M13 11l7-4M13 11l6 3"/><circle cx="4" cy="20" r="1.5"/>',
  chute: '<path d="M3 11a9 7 0 0 1 18 0z"/><path d="M3 11l9 8 9-8M12 11v8"/><rect x="10" y="19" width="4" height="3" rx="1"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  wrench: '<path d="M15 4a5 5 0 0 0-5 6.5L4 16.5 7.5 20l6-6A5 5 0 0 0 20 9l-3 3-3-1-1-3z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  view: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  rivet: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
const svg = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

// ---------------------------------------------------------------- パーツ（育成）
const STAT_KEYS = ['atk', 'armor', 'hp', 'jump', 'speed'];
const STAT_NAME = { atk: '攻撃', armor: '装甲', hp: 'HP', jump: 'ジャンプ', speed: '速さ' };
const STAT_MAX = { atk: 30, armor: 30, hp: 80, jump: 60, speed: 60 };
const PARTS = [
  { id: 'h1', slot: 'head', tier: 1, name: 'ブラウン管', shape: 'tv',     base: { armor: 2 },            up: { armor: 1, hp: 3 },  cost: 0 },
  { id: 'h2', slot: 'head', tier: 2, name: 'まる電球',   shape: 'bulb',   base: { atk: 6, armor: 2 },    up: { atk: 2 },           cost: 350 },
  { id: 'h3', slot: 'head', tier: 3, name: 'バケツ兜',   shape: 'bucket', base: { armor: 9, hp: 10 },    up: { armor: 2, hp: 3 },  cost: 1000, gears: 2 },
  { id: 'h4', slot: 'head', tier: 4, name: '砲塔ヘッド', shape: 'turret', base: { atk: 15, armor: 6 },   up: { atk: 3, armor: 1 }, cost: 2400, gears: 5 },
  { id: 'b1', slot: 'body', tier: 1, name: 'ブリキ缶',   shape: 'can',    base: { hp: 0 },               up: { hp: 5 },            cost: 0 },
  { id: 'b2', slot: 'body', tier: 2, name: 'ドラム缶',   shape: 'drum',   base: { hp: 20 },              up: { hp: 5 },            cost: 350 },
  { id: 'b3', slot: 'body', tier: 3, name: 'ボイラー',   shape: 'boiler', base: { hp: 30, atk: 5 },      up: { hp: 5, atk: 1 },    cost: 1000, gears: 2 },
  { id: 'b4', slot: 'body', tier: 4, name: 'タンク装甲', shape: 'tank',   base: { hp: 45, armor: 8 },    up: { hp: 6, armor: 1 },  cost: 2400, gears: 5 },
  { id: 'l1', slot: 'legs', tier: 1, name: 'ちょこ足',   shape: 'stub',   base: { speed: 0 },            up: { speed: 4 },         cost: 0 },
  { id: 'l2', slot: 'legs', tier: 2, name: 'バネ足',     shape: 'spring', base: { jump: 20 },            up: { jump: 5 },          cost: 350 },
  { id: 'l3', slot: 'legs', tier: 3, name: 'ローラー',   shape: 'roller', base: { speed: 32, jump: 6 },  up: { speed: 5, jump: 2 }, cost: 1000, gears: 2 },
  { id: 'l4', slot: 'legs', tier: 4, name: 'ジェット脚', shape: 'jet',    base: { jump: 34, speed: 20 }, up: { jump: 5, speed: 4 }, cost: 2400, gears: 5 },
];
const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));
const TIER_LV = { 1: 1, 2: 3, 3: 6, 4: 10 };
const MAX_UP = 3;
const upCost = (p, lv) => Math.round(Math.max(120, p.cost * 0.4) * (lv + 1));
function partStats(id, lv) {
  const p = PART[id], s = {};
  for (const k of STAT_KEYS) s[k] = (p.base[k] || 0) + (p.up[k] || 0) * lv;
  return s;
}
function loadoutStats(eq, lvs) {
  const s = { atk: 0, armor: 0, hp: 0, jump: 0, speed: 0 };
  for (const slot of ['head', 'body', 'legs']) {
    const ps = partStats(eq[slot], lvs[eq[slot]] || 0);
    for (const k of STAT_KEYS) s[k] += ps[k];
  }
  for (const k of STAT_KEYS) s[k] = Math.min(s[k], STAT_MAX[k]);
  return s;
}
const xpNeed = lv => 250 + lv * 150;

// 進行状況（ブラウザ内に保存。失敗してもゲームは動く）
const SAVE_KEY = 'boombolts.v1';
function freshProfile() {
  return { tut: false, story: 0, lv: 1, xp: 0, rivets: 200, gears: 0, owned: { h1: 0, b1: 0, l1: 0 }, eq: { head: 'h1', body: 'b1', legs: 'l1' }, best: 0, wins: 0, matches: 0 };
}
let P = freshProfile();
function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o.lv === 'number' && o.owned && o.eq) P = Object.assign(freshProfile(), o);
    }
  } catch (e) { /* 保存できない環境では毎回まっさら */ }
}
function saveProfile() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) {} }

// ---------------------------------------------------------------- ステージ
const STAGES = {
  canyon: {
    name: 'サビ鉄キャニオン', sky: ['#1E1424', '#5A2E36', '#A0503A'], sun: '#FFB27A', sunGlow: 'rgba(255,120,70,', haze: 'rgba(110,50,44,', far: '#5E3A36', water: ['#23434E', '#0B1C22'], grass: false,
    rock: [132, 72, 46], rock2: [106, 56, 38], topLight: [206, 140, 92], top: [170, 108, 66], topDark: [120, 72, 44], debris: '#7A4630', step: true,
    build(f) {
      f.island(330, 760, 260, 520, { taper: 0.25 });
      f.island(830, 600, 115, 640, { taper: 0.15, round: 20 });
      f.island(1200, 830, 230, 190);
      f.island(1200, 560, 95, 70);
      f.island(1590, 640, 120, 640, { taper: 0.15, round: 20 });
      f.island(2080, 780, 270, 520, { taper: 0.25 });
      f.plank(560, 735, 770);
      f.plank(1680, 1830, 790);
      f.hole(330, 1010, 70, 60);
    },
  },
  jungle: {
    name: 'コケ浮島', sky: ['#121E26', '#2E4A50', '#5E7E74'], sun: '#D8E6D4', sunGlow: 'rgba(170,210,190,', haze: 'rgba(70,100,96,', far: '#3E5E58', water: ['#1A3E48', '#08171C'], grass: true,
    rock: [84, 80, 74], rock2: [66, 62, 58], topLight: [112, 160, 82], top: [74, 124, 56], topDark: [44, 84, 38], debris: '#4E4842', step: false,
    build(f) {
      f.island(270, 700, 220, 270);
      f.island(700, 880, 190, 170);
      f.island(1200, 760, 300, 320);
      f.hole(1200, 1010, 140, 110);
      f.island(1700, 880, 190, 170);
      f.island(2130, 700, 220, 270);
      f.island(1200, 520, 110, 80);
      f.island(500, 520, 80, 60);
      f.island(1900, 520, 80, 60);
      f.plank(1105, 1295, 640);
    },
  },
  practice: {
    name: 'ドックの修理工場', sky: ['#18242C', '#3A5656', '#6E8A7C'], sun: '#E2ECD8', sunGlow: 'rgba(180,215,195,', haze: 'rgba(80,110,104,', far: '#46645E', water: ['#1A3E48', '#08171C'], grass: true,
    rock: [90, 84, 76], rock2: [70, 66, 60], topLight: [118, 166, 86], top: [80, 130, 60], topDark: [48, 90, 40], debris: '#4E4842', step: false, hidden: true,
    build(f) {
      f.island(520, 800, 500, 380, { bump: 4 });
      f.island(620, 752, 46, 70, { bump: 0, round: 6, taper: 0.1 });
      f.island(1350, 806, 260, 330, { bump: 4 });
    },
  },
};

let T = null; // 地形 { key, st, m(マスク), cv, c }
function buildStage(key, seed) {
  const st = STAGES[key], rnd = mulberry((seed ^ 0x9e3779b9) >>> 0), m = new Uint8Array(W * H);
  const n1 = noise1(rnd), n2 = noise1(rnd);
  const fill = (x, y0, y1, mat) => {
    if (x < 0 || x >= W) return;
    y0 = Math.max(0, Math.round(y0)); y1 = Math.min(H, Math.round(y1));
    for (let y = y0; y < y1; y++) m[y * W + x] = mat;
  };
  const f = {
    island(cx, top, hw, depth, o = {}) {
      for (let x = Math.round(cx - hw); x <= cx + hw; x++) {
        const t = (x - cx) / hw;
        let bump = n1(x) * (o.bump ?? 16);
        if (st.step) bump = Math.round(bump / 8) * 8;
        const ty = top + bump + Math.pow(Math.abs(t), 4) * (o.round ?? 50);
        const d = depth * Math.pow(Math.max(0, 1 - t * t), o.taper ?? 0.5) * (0.85 + 0.15 * n2(x * 1.7));
        fill(x, ty, ty + Math.max(10, d), 1);
      }
    },
    plank(x0, x1, y, th = 9) { for (let x = x0; x <= x1; x++) fill(x, y, y + th, 2); },
    hole(cx, cy, rx, ry) {
      for (let y = Math.max(0, cy - ry); y <= Math.min(H - 1, cy + ry); y++) {
        const dy = (y - cy) / ry, span = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
        for (let x = Math.max(0, Math.round(cx - span)); x <= Math.min(W - 1, Math.round(cx + span)); x++) m[y * W + x] = 0;
      }
    },
  };
  st.build(f);
  return { key, st, m, cv: null, c: null };
}
function solid(x, y) {
  x = x | 0; y = y | 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return 0;
  return T.m[y * W + x];
}
function carve(x, y, r) {
  const m = T.m, r2 = r * r;
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++) {
    const dy = yy - y, span = Math.sqrt(Math.max(0, r2 - dy * dy));
    const x0 = Math.max(0, Math.floor(x - span)), x1 = Math.min(W - 1, Math.ceil(x + span));
    if (x1 >= x0) m.fill(0, yy * W + x0, yy * W + x1 + 1);
  }
  mini.dirty = true;
  decoCarve(x, y, r);
  const c = T.c;
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const gr = c.createRadialGradient(x, y, r * 0.8, x, y, r + 9);
  gr.addColorStop(0, 'rgba(38,22,14,0.85)'); gr.addColorStop(1, 'rgba(38,22,14,0)');
  c.fillStyle = gr; c.beginPath(); c.arc(x, y, r + 9, 0, 7); c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.restore();
}
function normalAt(x, y, r) {
  let nx = 0, ny = 0;
  for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
    if (dx * dx + dy * dy > r * r) continue;
    if (solid(x + dx, y + dy)) { nx -= dx; ny -= dy; }
  }
  const l = hyp(nx, ny);
  return l < 0.001 ? null : { x: nx / l, y: ny / l };
}
function circleSolid(x, y, r) {
  if (solid(x, y)) return true;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (solid(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true; }
  return false;
}
// 足元 feet（空気の最下段）に立ったときに体がめり込まないか
function bodyFree(x, feet) {
  for (const dx of [-7, 0, 7]) for (const dy of [1, 8, 15, 22]) if (solid(x + dx, feet - dy)) return false;
  return true;
}
const standing = (x, feet) => solid(x, feet + 1) || solid(x - 6, feet + 1) || solid(x + 6, feet + 1);
function groundBelow(x, y, maxd) { for (let d = 0; d < maxd; d += 4) { if (y + d >= WATER) return false; if (solid(x, y + d)) return true; } return false; }
function los(a, b) {
  const dx = b.x - a.x, dy = (b.y - 6) - (a.y - 6), L = hyp(dx, dy), n = Math.ceil(L / 6);
  for (let i = 2; i < n - 1; i++) if (solid(a.x + dx * i / n, a.y - 6 + dy * i / n)) return false;
  return true;
}

// ---------------------------------------------------------------- 状態
const BOTS = [
  { name: 'あなた',   color: '#FF7A1A', eye: '#FFD58A', hat: 'ant' },
  { name: 'ポンコツ', color: '#2FB3A3', eye: '#A5FFF2', hat: 'cone' },
  { name: 'ネジマル', color: '#8C6CF0', eye: '#E4D8FF', hat: 'prop' },
  { name: 'ガラクタ', color: '#3D8BF0', eye: '#CDE4FF', hat: 'bolt' },
];
const S = {
  phase: 'boot', bots: [], proj: [], parts: [], flames: [], gases: [], crates: [], floats: [],
  time: 0, tick: 0, paused: false, manual: false, silent: false,
  cam: { x: 1200, y: 760, s: 1, sx: 0, sy: 0, shake: 0, over: false, zoom: 1 },
  rnd: Math.random, turnIdx: -1, active: null, turnTime: 0, matchTime: 0, phaseT: 0, fired: false, charge: null, gun: null, ai: null,
};
const view = { w: 800, h: 600, dpr: 1 };
const I = { move: 0, moveKey: 0, aimKey: 0, jump: false, jumpHeld: false, stickJump: false, stick: null, fireReq: null };
const keys = {};

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function cpuLoadout(i) {
  // CPU はプレイヤーのレベルと強さ設定に合わせてパーツを持つ
  // 自分が強くなった分が試合で返ってくるよう、CPU はレベルを下げ、強化段階にも上限をかける
  const bias = { easy: -3, normal: -1, hard: 0 }[S.diff] ?? -1;
  const cap = { easy: 0, normal: 1, hard: 2 }[S.diff] ?? 1;
  const lv = clamp(P.lv + bias, 1, 30);
  const eq = {}, lvs = {};
  for (const slot of ['head', 'body', 'legs']) {
    const opts = PARTS.filter(p => p.slot === slot && TIER_LV[p.tier] <= lv);
    const p = opts[Math.floor(S.rnd() * opts.length)];
    eq[slot] = p.id; lvs[p.id] = clamp(Math.floor((lv - TIER_LV[p.tier]) / 2), 0, cap);
  }
  return { eq, lvs };
}

function newBot(d, i, human) {
  const lo = human ? { eq: { ...P.eq }, lvs: { ...P.owned } } : cpuLoadout(i);
  const st = loadoutStats(lo.eq, lo.lvs);
  const ammo = {};
  const lv = human ? P.lv : clamp(P.lv + ({ easy: -3, normal: -1, hard: 0 }[S.diff] ?? -1), 1, 30);
  for (const k of WORDER) ammo[k] = WP[k].lv <= lv ? WP[k].ammo + (human && WP[k].ammo !== Infinity ? ((P.stock && P.stock[k]) || 0) : 0) : 0;
  return {
    id: i, ...d, human, eq: lo.eq, lvs: lo.lvs, st, maxHp: 100 + st.hp,
    light: shadeHex(d.color, 0.45), dark: shadeHex(d.color, -0.35),
    x: 0, y: 0, vx: 0, vy: 0, hp: 100 + st.hp, alive: true, grounded: false, facing: i % 2 ? -1 : 1,
    elev: 0.6, aim: -0.6, power: 0, weapon: 'rocket', ammo,
    score: 0, kills: 0, deaths: 0, dealt: 0, poison: 0, poisonBy: null, lastHit: null,
    hurtT: 0, walk: 0, blink: 2 + Math.random() * 3, boost: 2 + (human ? Math.min(2, P.kits || 0) : 0), swingT: 0, fireT: 0, blocked: false, crates: 0,
  };
}
function syncAim(b) { b.aim = b.facing > 0 ? -b.elev : Math.PI + b.elev; }
function elevOf(b) {
  if (b.facing > 0) return -b.aim;
  let e = b.aim - Math.PI; while (e <= -Math.PI) e += Math.PI * 2; while (e > Math.PI) e -= Math.PI * 2; return e;
}

function findSpot(minDist, others) {
  for (let k = 0; k < 400; k++) {
    const x = 80 + S.rnd() * (W - 160);
    let feet = -1;
    for (let y = 30; y < WATER - 30; y++) { if (solid(x, y)) { feet = y - 1; break; } }
    if (feet < 0 || !bodyFree(x, feet) || !standing(x - 10, feet) && !standing(x + 10, feet)) continue;
    if (!standing(x, feet)) continue;
    if (others.some(o => hyp(o.x - x, o.y - feet) < minDist)) continue;
    return { x, feet };
  }
  return { x: W / 2, feet: 500 };
}
function placeBot(b, drop) {
  const others = S.bots.filter(o => o !== b && o.alive);
  const sp = findSpot(drop ? 160 : 320, others);
  b.x = sp.x; b.y = sp.feet - R - (drop ? 150 : 0);
  b.vx = 0; b.vy = 0; b.grounded = !drop;
}

// ---------------------------------------------------------------- 試合の流れ
function startMatch(o = {}) {
  const seed = o.seed ?? ((Math.random() * 1e9) | 0);
  S.seed = seed; S.rnd = mulberry(seed);
  S.stageKey = o.stage || 'canyon'; S.diff = o.diff || 'normal'; S.allCpu = !!o.allCpu; S.chapter = o.chapter ?? null; S.afterTalk = false; S.tutorial = null; S.npc = null;
  T = buildStage(S.stageKey, seed); paintTerrain(T); T.decos = buildDecos(T, seed); T.bd = buildBackdrop(S.stageKey, seed);
  S.proj = []; S.parts = []; S.flames = []; S.gases = []; S.crates = []; S.floats = [];
  S.bots = [];
  BOTS.forEach((d, i) => { const b = newBot(d, i, !S.allCpu && i === 0); S.bots.push(b); });
  S.bots.forEach(b => placeBot(b, false));
  S.bots.forEach(b => { b.facing = b.x < W / 2 ? 1 : -1; syncAim(b); });
  S.turnIdx = -1; S.active = null; S.matchTime = MATCH_TIME; S.gun = null; S.charge = null; S.fired = false;
  S.cam.over = false; S.cam.zoom = 1; S.cam.x = W / 2; S.cam.y = 760; mini.dirty = true;
  S.result = null; S.resultShown = false; S.paused = false;
  I.stick = null; I.fireReq = null; I.move = 0;
  S.hintShown = false;
  buildCards(); buildTray();
  if (o.tutorial) { tutSetup(); S.hintShown = true; }
  if (o.skipLobby) { S.phase = 'lobby'; S.phaseT = 0; } else { S.phase = 'lobby'; S.phaseT = 3.4; showLobby(); }
  showScreen(null);
  $('#hud').hidden = false;
  playSong('match'); resetClock();
  if (!o.skipLobby) $('#lobby').hidden = false;
  if (o.tutorial) {
    S.phase = 'talk'; $('#lobby').hidden = true; $('#hud').hidden = true; $('#hud').classList.add('tut');
    const intro = [
      ['doc', 'happy', 'おう、目が覚めたか。わしはドック。この島の修理屋じゃ。'],
      ['doc', 'idle', '浜で止まっとったおまえを拾って、直しておいた。腕にロケットが付いとるな。'],
      ['doc', 'ready', '動かし方を思い出していけ。ここはわしの工場。いくら壊しても構わん。'],
    ];
    const go = () => { $('#hud').hidden = false; S.phase = 'lobby'; S.phaseT = 0; beginTurn(); tutStart(); };
    if (o.skipTalk) go(); else showTalk(intro, go);
    return;
  }
  $('#hud').classList.remove('tut');
  if (S.chapter != null && !o.skipLobby) {
    // 試合前の掛け合い。終わったらロビーのカウントダウンへ
    S.phase = 'talk'; $('#hud').hidden = true; $('#lobby').hidden = true;
    showTalk(STORY[S.chapter].intro, () => { S.phase = 'lobby'; S.phaseT = 3.4; $('#hud').hidden = false; $('#lobby').hidden = false; });
  }
}

function beginTurn() {
  if (S.matchTime <= 0) { finish(); return; }
  S.turnIdx = (S.turnIdx + 1) % S.bots.length;
  const b = S.bots[S.turnIdx];
  S.active = b;
  if (!b.alive) respawn(b);
  else if (b.poison > 0) {
    b.poison--;
    const dmg = Math.min(7, b.hp - 1);
    if (dmg > 0) damage(b, dmg, b.poisonBy, 0, 0, true);
  }
  if (!(b.ammo[b.weapon] > 0)) b.weapon = 'rocket';
  for (const o of S.bots) { o.jet = null; o.hook = null; o.jetOn = false; }
  if (!S.tutorial && S.rnd() < 0.4 && S.crates.length < 3) spawnCrate();
  S.phase = 'banner'; S.phaseT = 1.4; S.turnTime = TURN_TIME; S.turnKO = false; S.quietT = 0; S.focusT = 0; S.fired = false; S.charge = null; S.gun = null;
  S.ai = { st: 'think', t: 0.45 + S.rnd() * 0.4, moved: false, jumpCd: 0, flee: 0, fleeT: 0 };
  b.power = 0; I.stick = null; I.fireReq = null;
  if (!S.tutorial) showBanner(b.human ? 'あなたの番' : `${b.name}の番`, b.color);
  sfx(b.human ? 'myturn' : 'turn');
  if (Math.random() < 0.6) speak(b, 'turn');
  if (b.human && !S.hintShown) { S.hintShown = true; showHint(true); }
}
function respawn(b) {
  placeBot(b, true);
  b.alive = true; b.hp = b.maxHp; b.poison = 0; b.lastHit = null; b.hurtT = 0;
  for (let i = 0; i < 16; i++) part({ t: 'spark', x: b.x, y: b.y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 0.4, c: b.color });
}
function finish() {
  if (S.phase === 'over') return;
  S.phase = 'over'; S.phaseT = 1.4; S.charge = null; I.stick = null;
  const rank = [...S.bots].sort((a, b) => b.score - a.score || b.kills - a.kills);
  S.result = { rank };
  stopSong();
  const me = S.bots.find(b => b.human);
  if (me) S.result.reward = grantRewards(me, rank.indexOf(me) + 1);
  if (me && S.chapter != null) {
    const ch = STORY[S.chapter], success = goalMet(ch.goal, me, rank.indexOf(me) + 1);
    const first = success && (P.story || 0) === S.chapter;
    if (first) { P.story = S.chapter + 1; P.rivets += ch.reward.rivets; P.gears += ch.reward.gears; saveProfile(); }
    S.result.story = { success, first, ch, idx: S.chapter };
  }
  const meB = S.bots.find(b => b.human);
  sfx(!meB || rank[0] === meB ? 'win' : 'lose');
}
function grantRewards(me, place) {
  const before = { lv: P.lv, xp: P.xp };
  const placeRiv = [0, 150, 90, 50, 20][place];
  const rivets = Math.round(me.dealt / 2) + me.kills * 30 + placeRiv + (me.rivetBonus || 0);
  let xp = Math.round(me.score / 10) + [0, 120, 70, 40, 20][place];
  if (P.xp2 > 0) { xp *= 2; P.xp2--; }
  let gears = place === 1 ? 1 : 0;
  let rivets2 = rivets; if (P.riv2 > 0) { rivets2 = rivets * 2; P.riv2--; }
  P.rivets += rivets2; P.xp += xp; P.matches++;
  if (place === 1) P.wins++;
  const newBest = me.score > P.best;
  if (newBest) P.best = me.score;
  const unlocked = [];
  while (P.xp >= xpNeed(P.lv)) {
    P.xp -= xpNeed(P.lv); P.lv++; gears += 2;
    for (const k of WORDER) if (WP[k].lv === P.lv) unlocked.push(WP[k].name);
    for (const p of PARTS) if (TIER_LV[p.tier] === P.lv && p.cost > 0) unlocked.push(p.name);
  }
  P.gears += gears;
  saveProfile();
  const stars = place === 1 ? 3 : place === 2 ? 2 : 1;
  return { place, rivets: rivets2, xp, gears, stars, levelUp: P.lv > before.lv, unlocked, newBest };
}

function quiet() {
  if (S.gun) return false;
  if (S.proj.some(p => !p.dead && (!p.stuck || p.trig > 0))) return false;
  if (S.bots.some(b => b.alive && !b.grounded)) return false;
  return true;
}

// ---------------------------------------------------------------- 更新（固定60Hz）
function update(dt) {
  S.tick++; S.time += dt;
  if (S.phase === 'title' || S.phase === 'boot') { worldStep(dt); titleCam(dt); return; }
  if (S.paused) return;
  if (S.phase === 'talk') { worldStep(dt); camStep(dt); return; }
  if (S.phase === 'lobby') {
    S.phaseT -= dt;
    lobbyTick();
    if (S.phaseT <= 0) { $('#lobby').hidden = true; beginTurn(); }
    worldStep(dt); camStep(dt); return;
  }
  if (S.phase === 'over') {
    worldStep(dt); camStep(dt);
    S.phaseT -= dt;
    if (S.phaseT <= 0 && !S.resultShown && !S.afterTalk) {
      const st = S.result && S.result.story;
      if (st) {
        S.afterTalk = true; $('#hud').hidden = true;
        showTalk(st.success ? STORY[S.chapter].win : STORY[S.chapter].lose, () => { S.resultShown = true; showResult(); });
      } else { S.resultShown = true; showResult(); }
    }
    return;
  }
  if (S.tutorial && S.tutorial.step >= 0) {
    // チュートリアル: 時間切れなし。自分の番がずっと続く
    const me = S.bots[0];
    S.matchTime = MATCH_TIME; S.turnTime = TURN_TIME;
    if (!me.alive) { me.alive = true; me.hp = me.maxHp; me.x = 230; me.y = 600; me.grounded = false; me.vx = me.vy = 0; }
    if (S.phase === 'settle' || S.phase === 'retreat') { S.phase = 'turn'; S.fired = false; S.active = me; S.turnIdx = 0; }
    tutCheck();
  }
  S.matchTime = Math.max(0, S.matchTime - dt);
  const b = S.active;
  if (S.phase === 'banner') { S.phaseT -= dt; if (S.phaseT <= 0) S.phase = 'turn'; }
  else if (S.phase === 'turn' || S.phase === 'retreat') {
    const before = Math.ceil(S.turnTime);
    S.turnTime -= dt;
    if (S.turnTime <= 5 && Math.ceil(S.turnTime) !== before && S.turnTime > 0) sfx('tick');
    if (b.alive) { if (b.human) playerControl(b, dt); else aiControl(b, dt); }
    // CPU は逃げる用事がなく、弾も落ち着いたら残りの逃げ時間を待たない
    if (S.phase === 'retreat' && !b.human && S.ai.fleeT <= 0 && RETREAT - S.turnTime > 1.5 && quiet()) S.turnTime = 0;
    if (S.turnTime <= 0 || S.matchTime <= 0 || !b.alive) { S.phase = 'settle'; S.phaseT = 0; S.charge = null; I.stick = null; }
  } else if (S.phase === 'settle') {
    // 余韻: 落ち着いてからも少し映す。撃破があった番は長めに
    S.phaseT += dt;
    S.quietT = quiet() ? (S.quietT || 0) + dt : 0;
    if (S.quietT >= (S.turnKO ? 2.0 : 1.2) || S.phaseT > 11) { if (S.matchTime <= 0) finish(); else beginTurn(); }
  }
  let wdt = dt;
  if (S.slowT > 0) { S.slowT -= dt; wdt = dt * 0.35; }
  worldStep(wdt); camStep(dt);
}

function worldStep(dt) {
  if (!T) return;
  for (const b of S.bots) {
    if (!b.alive) continue;
    b.hurtT = Math.max(0, b.hurtT - dt); b.swingT = Math.max(0, b.swingT - dt); b.fireT = Math.max(0, b.fireT - dt);
    b.blink -= dt; if (b.blink < -0.12) b.blink = 2 + Math.random() * 3;
    b.moodT = Math.max(0, (b.moodT || 0) - dt); b.danger = Math.max(0, (b.danger || 0) - dt);
    for (const p of S.proj) if (!p.dead && !p.stuck && p.owner !== b && hyp(p.x - b.x, p.y - b.y) < 140 && (p.vx * (b.x - p.x) + p.vy * (b.y - p.y)) > 0) b.danger = 0.35;
    if (b.grounded) {
      if (!standing(b.x, b.y + R)) {
        let k = 0; while (k < 3 && !standing(b.x, b.y + R)) { b.y++; k++; }
        if (!standing(b.x, b.y + R)) { b.grounded = false; b.vx = 0; b.vy = 0; }
      }
    } else botAir(b, dt);
    if (b.y > WATER + 4 || b.x < -80 || b.x > W + 80) { drown(b); continue; }
    for (const c of S.crates) if (!c.dead && hyp(b.x - c.x, b.y - c.y) < 24) pickCrate(b, c);
  }
  separateBots();
  if (S.gun) gunStep(dt);
  for (const p of S.proj) if (!p.dead) advance(p, dt);
  S.proj = S.proj.filter(p => !p.dead);
  flameStep(dt); gasStep(dt); crateStep(dt); decoStep(dt); sayStep(dt);
  S.focusT = Math.max(0, (S.focusT || 0) - dt);
  for (const p of S.parts) {
    p.life -= dt;
    p.vy += (p.g ?? 0) * dt; p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
    if (p.t === 'smoke') { p.r += 18 * dt; p.vx *= 0.98; }
    if (p.t === 'debris' && p.y > WATER) p.life = 0;
  }
  S.parts = S.parts.filter(p => p.life > 0);
  for (const f of S.floats) { f.life -= dt; f.y -= 34 * dt; }
  S.floats = S.floats.filter(f => f.life > 0);
}

// 重なったロボを横に押し分ける。地形にめり込む側には押さない
function separateBots() {
  const L = S.bots.filter(b => b.alive);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dy) >= 30 || Math.abs(dx) >= BODY_W) continue;
    const dir = dx === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dx);
    const push = (BODY_W - Math.abs(dx)) / 2 + 0.01;
    const move = (o, d) => { const nx = o.x + d; if (bodyFree(nx, o.y + R - 2)) { o.x = nx; return true; } return false; };
    const okA = move(a, -dir * push), okB = move(b, dir * push);
    if (!okA && !okB) continue;
    if (!okA) move(b, dir * push); else if (!okB) move(a, -dir * push);
    // 上から落ちてきて頭に乗りかけた方は、横へ滑らせる
    if (!a.grounded && a.vy > 0 && dy > 0) a.vx = -dir * 60;
    if (!b.grounded && b.vy > 0 && dy < 0) b.vx = dir * 60;
  }
}
function botAir(b, dt) {
  b.vy = Math.min(900, b.vy + G * dt);
  if (b.chute && b.vy > 0 && !b.hook) {
    // 開いたパラシュート: ゆっくり降りる。左右は操作で流せる
    b.vy = Math.min(b.vy, 85); b.chuteOpen = true;
    const mv = b.human && S.active === b ? (I.move || I.moveKey) : 0;
    b.vx += (mv * 110 - b.vx) * Math.min(1, dt * 3);
  }
  const sp = hyp(b.vx, b.vy), n = Math.max(1, Math.ceil(sp * dt / 3));
  for (let i = 0; i < n; i++) {
    const nx = b.x + b.vx * dt / n, ny = b.y + b.vy * dt / n;
    if (circleSolid(nx, ny, R - 3)) {
      const nr = normalAt(nx, ny, R + 2) || { x: 0, y: -1 };
      const vn = b.vx * nr.x + b.vy * nr.y;
      // 壁から離れる向きに動いているなら止めない（斜面や角に触れたまま飛ばされたとき）
      if (vn >= -1) { b.x = nx; b.y = ny; continue; }
      {
        if (-vn > 560 && !b.chuteOpen) {
          const by = recentHitter(b);
          damage(b, Math.round((-vn - 560) * 0.06), by, 0, 0, true);
        }
        b.vx -= 1.3 * vn * nr.x; b.vy -= 1.3 * vn * nr.y; b.vx *= 0.7; b.vy *= 0.7;
      }
      let k = 0, px = b.x, py = b.y;
      while (circleSolid(px, py, R - 2) && k < 24) { px += nr.x; py += nr.y; k++; }
      b.x = px; b.y = py;
      if (nr.y < -0.55 && hyp(b.vx, b.vy) < 130) { land(b); return; }
      break;
    }
    b.x = nx; b.y = ny;
  }
  if (b.vy >= 0 && standing(b.x, b.y + R) && hyp(b.vx, b.vy) < 130) land(b);
}
function land(b) {
  if (b.chuteOpen) { b.chute = false; b.chuteOpen = false; }
  b.hook = null;
  if (b.vy > 220 || hyp(b.vx, b.vy) > 220) sfx('land');
  b.grounded = true; b.vx = 0; b.vy = 0; b.selfJump = false;
  let k = 0; while (k < 12 && !bodyFree(b.x, b.y + R)) { b.y--; k++; }
  k = 0; while (k < 6 && !standing(b.x, b.y + R)) { b.y++; k++; }
}
const BODY_W = 24;
function walk(b, dir, dt) {
  const spd = 88 * (1 + b.st.speed / 100);
  const nx = b.x + dir * spd * dt;
  // 他のロボにぶつかったら止まる（体はすり抜けない）
  for (const o of S.bots) if (o !== b && o.alive && Math.abs(o.y - b.y) < 30 && Math.abs(o.x - nx) < BODY_W && Math.sign(o.x - b.x) === dir) { b.blocked = true; return false; }
  let feet = b.y + R, ok = false;
  for (let up = 0; up <= 10; up++) if (bodyFree(nx, feet - up)) { feet -= up; ok = true; break; }
  b.blocked = !ok;
  if (!ok) return false;
  let dn = 0; while (dn < 12 && !standing(nx, feet)) { feet++; dn++; }
  b.x = nx; b.y = feet - R;
  if (!standing(nx, feet)) { b.grounded = false; b.selfJump = true; b.cut = true; b.vx = dir * 60; b.vy = 0; }
  return true;
}
// dir: -1/0/1。0 なら真上。押している間は高く、早く離すと小ジャンプ（離した時点で上昇を切る）
const JUMP_V = 400, AIR_SPD = 150;
function jump(b, dir = 0) {
  if (!b.grounded) return;
  b.grounded = false; b.selfJump = true; b.cut = false;
  b.vy = -JUMP_V * (1 + b.st.jump / 100); b.vx = dir * AIR_SPD * (1 + b.st.speed / 200);
  if (dir) b.facing = dir;
  b.y -= 2; sfx('jump');
}
const recentHitter = b => (b.lastHit && S.time - b.lastHit.t < 12) ? b.lastHit.by : null;

function damage(o, amt, by, px, py, silentPts) {
  if (!o.alive) return;
  if (amt > 0) {
    if (by && by !== o) amt *= 1 + by.st.atk / 100;
    amt *= 1 - o.st.armor / 100;
    amt = Math.max(1, Math.round(amt));
    o.hp -= amt; o.hurtT = 0.45;
    floater(o.x, o.y - 40, '-' + amt, '#FF5A4E');
    if (by && by !== o) { by.score += amt * 10; by.dealt += amt; setMood(by, 'happy', 1.6); speak(by, 'hit'); }
    sfx('hurt');
    if (o.hp > 0) speak(o, 'hurt');
  }
  if (by && by !== o) o.lastHit = { by, t: S.time };
  if (px || py) { o.grounded = false; o.selfJump = false; o.vx += px; o.vy += py; if (hyp(px, py) > 320) speak(o, 'fly', true); }
  if (o.hp <= 0) kill(o, by && by !== o ? by : recentHitter(o), 'boom');
}
function kill(b, by, how) {
  if (!b.alive) return;
  b.alive = false; b.hp = 0; b.deaths++; b.poison = 0;
  if (how === 'water') splashFx(b.x, WATER);
  else boomFx(b.x, b.y, 0.55, b.color);
  if (by && by !== b) {
    by.kills++; by.score += KILL_PTS;
    floater(b.x, b.y - 60, `撃破 +${KILL_PTS}`, '#FFC531', 1.8);
    setMood(by, 'smug', 2.6); speak(by, 'ko', true);
  }
  // 余韻: 少しスローにして、やられた場所を映す
  S.turnKO = true; S.slowT = 0.75; S.focus = { x: b.x, y: Math.min(b.y, WATER - 40) }; S.focusT = 2.6;
  sfx('ko');
}
function drown(b) { if (b.alive) { kill(b, recentHitter(b), 'water'); sfx('splash'); } }

// ---------------------------------------------------------------- 弾
function makeProj(b, k, a, pw) {
  const w = WP[k], spd = (w.speed || 600) * pw, ca = Math.cos(a), sa = Math.sin(a);
  return {
    k, w, owner: b, x: b.x + ca * (R + 8), y: b.y - 3 + sa * (R + 8), vx: ca * spd, vy: sa * spd,
    t: 0, left: false, fuse: w.fuse || 0, fuseOn: !!w.fuse && !w.roll, stuck: false, armT: 1, trig: 0, dead: false, sim: null, hitSet: null,
  };
}
function advance(p, dt) {
  const w = p.w;
  p.t += dt;
  if (p.stuck) { if (!p.sim) mineTick(p, dt); else p.dead = true; return; }
  p.vy += G * (w.grav || 1) * dt;
  const sp = hyp(p.vx, p.vy), n = Math.max(1, Math.ceil(sp * dt / 3));
  for (let i = 0; i < n; i++) {
    const nx = p.x + p.vx * dt / n, ny = p.y + p.vy * dt / n;
    for (const o of S.bots) {
      if (!o.alive) continue;
      const d = hyp(nx - o.x, ny - o.y), dh = hyp(nx - o.x, ny - (o.y - 24));
      if (o === p.owner && !p.left) { if (d > R + 7 && dh > 17) p.left = true; else continue; }
      if ((d < R + 3 || dh < 14) && !(p.hitSet && p.hitSet.has(o))) { if (hitBot(p, o, nx, ny)) return; }
    }
    if (solid(nx, ny)) { if (hitGround(p, nx, ny)) return; break; }
    p.x = nx; p.y = ny;
  }
  if (p.y > WATER) { endProj(p, 'water'); return; }
  if (p.x < -300 || p.x > W + 300 || p.y < -2500) { endProj(p, 'gone'); return; }
  if (p.fuseOn) { p.fuse -= dt; if (p.fuse <= 0) { blast(p, p.x, p.y); return; } }
  if (p.t > 10) { blast(p, p.x, p.y); return; }
  if (!p.sim && (p.k === 'rocket' || p.k === 'fire' || p.k === 'gas') && S.tick % 2 === 0) part({ t: 'smoke', x: p.x, y: p.y, r: 3, vx: 0, vy: -10, life: 0.5, a: 0.35 });
  if (!p.sim && p.k === 'tele' && S.tick % 2 === 0) part({ t: 'spark', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.3, c: '#4FE3F0' });
}
function hitBot(p, o, nx, ny) {
  const w = p.w;
  if (w.impact) { blast(p, nx, ny); return true; }
  if (w.roll) {
    (p.hitSet || (p.hitSet = new Set())).add(o);
    if (p.sim) p.sim.contacts.push(o);
    else damage(o, w.contact, p.owner, p.vx * 0.45, p.vy * 0.45 - 120);
    p.vx *= 0.5; p.vy *= 0.5;
    if (!p.fuseOn) { p.fuseOn = true; p.fuse = w.fuse; }
    return false;
  }
  const dx = nx - o.x, dy = ny - (o.y - 6), L = hyp(dx, dy) || 1, nrx = dx / L, nry = dy / L;
  const vn = p.vx * nrx + p.vy * nry;
  if (vn < 0) { const e = 1 + (w.rest ?? 0.3); p.vx -= e * vn * nrx; p.vy -= e * vn * nry; }
  return false;
}
function hitGround(p, nx, ny) {
  const w = p.w;
  if (w.impact) { blast(p, nx, ny); return true; }
  if (w.stick) {
    p.vx = 0; p.vy = 0; p.stuck = true; p.armT = 1;
    if (p.sim) { p.sim.x = p.x; p.sim.y = p.y; p.dead = true; }
    return true;
  }
  const nr = normalAt(nx, ny, 6) || { x: -Math.sign(p.vx) || 0, y: -Math.sign(p.vy) || -1 };
  const vn = p.vx * nr.x + p.vy * nr.y;
  if (vn < 0) {
    const e = 1 + (w.rest ?? 0.3);
    p.vx -= e * vn * nr.x; p.vy -= e * vn * nr.y;
    const f = w.roll ? 0.985 : 0.82; p.vx *= f; p.vy *= f;
    if (!p.sim && -vn > 120) sfx('bounce');
  }
  if (w.roll && !p.fuseOn) { p.fuseOn = true; p.fuse = w.fuse; }
  return false;
}
function endProj(p, why) {
  if (p.sim) { p.sim.x = p.x; p.sim.y = p.y; p.sim.water = why === 'water'; p.dead = true; return; }
  if (why === 'water') { splashFx(p.x, WATER); sfx('splash'); }
  p.dead = true;
}
function blast(p, x, y) {
  p.dead = true;
  if (p.sim) { p.sim.x = x; p.sim.y = y; return; }
  const w = p.w, o = p.owner;
  if (w.tele) { teleport(o, x, y); return; }
  if (w.fireBomb) {
    explosion(x, y, w, o, 0.4);
    for (let i = 0; i < 14; i++) S.flames.push({ x, y: y - 4, vx: (Math.random() - 0.5) * 320, vy: -80 - Math.random() * 220, stuck: false, life: 4.5 + Math.random(), owner: o, cd: 0 });
    sfx('fire'); return;
  }
  if (w.gas) {
    explosion(x, y, w, o, 0.4);
    S.gases.push({ x, y, r: 10, life: 3.4, owner: o, hit: new Set() }); sfx('gas');
    return;
  }
  explosion(x, y, w, o, 1);
}
function explosion(x, y, w, owner, fx) {
  carve(x, y, w.R * 0.8);
  for (const o of S.bots) {
    if (!o.alive) continue;
    const d = hyp(o.x - x, (o.y - 6) - y), reach = w.R + R * 0.6;
    if (d < reach) {
      const f = 1 - d / reach, dmg = w.dmg * (0.3 + 0.7 * f);
      let nx = (o.x - x) / (d || 1), ny = (o.y - 6 - y) / (d || 1) - 0.6;
      const L = hyp(nx, ny) || 1, push = w.push * (0.4 + 0.6 * f);
      damage(o, dmg, owner, nx / L * push, ny / L * push);
    } else if (d < reach + 50) { setMood(o, 'scared', 0.9); if (Math.random() < 0.7) speak(o, 'scared'); }
  }
  S.focus = { x, y }; S.focusT = 2;
  for (const c of S.crates) if (!c.dead && hyp(c.x - x, c.y - y) < w.R + 10) { c.dead = true; boomFx(c.x, c.y, 0.3, '#C8913F'); }
  for (const p of S.proj) if (!p.dead && p.k === 'mine' && p.stuck && p.trig <= 0 && hyp(p.x - x, p.y - y) < w.R + 12) p.trig = 0.25;
  boomFx(x, y, fx * w.R / 50, null);
  sfx('boom', w.R / 50 * fx);
}
function mineTick(p, dt) {
  if (!solid(p.x, p.y + 2) && !solid(p.x, p.y + 4)) { p.stuck = false; return; }
  p.armT -= dt;
  if (p.trig > 0) { p.trig -= dt; if (p.trig <= 0) blast(p, p.x, p.y); return; }
  if (p.armT <= 0 && S.bots.some(o => o.alive && hyp(o.x - p.x, o.y - p.y) < 36)) { p.trig = 0.7; sfx('beep'); }
}
function teleport(b, x, y) {
  if (!b.alive) return;
  let feet = y, k = 0;
  while (k < 80 && !bodyFree(x, feet)) { feet--; k++; }
  if (!bodyFree(x, feet)) return;
  for (let i = 0; i < 18; i++) part({ t: 'spark', x: b.x, y: b.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.4, c: '#4FE3F0' });
  b.x = x; b.y = feet - R; b.vx = 0; b.vy = 0; b.grounded = false;
  for (let i = 0; i < 18; i++) part({ t: 'spark', x, y: b.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.4, c: '#4FE3F0' });
  sfx('warp');
}
function gunStep(dt) {
  const g = S.gun, b = g.b;
  g.t -= dt;
  if (g.t > 0) return;
  g.t = 0.11; g.n--;
  if (!b.alive) { S.gun = null; return; }
  const a = g.a + (S.rnd() - 0.5) * 0.035, ca = Math.cos(a), sa = Math.sin(a);
  let x = b.x + ca * 18, y = b.y - 3 + sa * 18, hit = null;
  const sx = x, sy = y;
  for (let d = 0; d < WP.revolver.range; d += 4) {
    x += ca * 4; y += sa * 4;
    for (const o of S.bots) if (o !== b && o.alive && (hyp(x - o.x, y - o.y) < R + 1 || hyp(x - o.x, y - (o.y - 24)) < 13)) { hit = o; break; }
    if (hit || solid(x, y) || y > WATER) break;
  }
  part({ t: 'tracer', x: sx, y: sy, x2: x, y2: y, life: 0.08 });
  if (hit) {
    damage(hit, WP.revolver.dmg, b, ca * WP.revolver.push, sa * WP.revolver.push - 40);
    for (let i = 0; i < 6; i++) part({ t: 'spark', x, y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.25, c: '#FFE08A' });
  } else if (solid(x, y)) {
    carve(x, y, 7);
    for (let i = 0; i < 5; i++) part({ t: 'debris', x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 160, g: G, life: 0.6, c: T.st.debris, s: 2 });
  }
  b.fireT = 0.1; sfx('shot');
  if (g.n <= 0) S.gun = null;
}
function swing(b, a) {
  b.swingT = 0.3;
  const ca = Math.cos(a), sa = Math.sin(a), hx = b.x + ca * 22, hy = b.y - 4 + sa * 22;
  let any = false;
  for (const o of S.bots) {
    if (o === b || !o.alive) continue;
    if (hyp(o.x - hx, o.y - 6 - hy) < 30) { damage(o, WP.hammer.dmg, b, ca * WP.hammer.push, sa * WP.hammer.push - 220); any = true; }
  }
  for (let i = 0; i < 8; i++) part({ t: 'spark', x: hx, y: hy, vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, life: 0.25, c: '#FFFFFF' });
  sfx(any ? 'clang' : 'whoosh');
  S.cam.shake += any ? 8 : 2;
}
function flameStep(dt) {
  for (const o of S.bots) o.burnT = Math.max(0, (o.burnT || 0) - dt);
  for (const f of S.flames) {
    f.life -= dt;
    if (!f.stuck) {
      f.vy += G * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (solid(f.x, f.y + 2)) { f.stuck = true; f.vx = 0; f.vy = 0; }
      if (f.y > WATER) f.life = 0;
    } else if (!solid(f.x, f.y + 3)) f.stuck = false;
    for (const o of S.bots) if (o.alive && o.burnT <= 0 && hyp(o.x - f.x, o.y + 6 - f.y) < 17) { damage(o, 4, f.owner, 0, -20); o.burnT = 0.5; }
  }
  S.flames = S.flames.filter(f => f.life > 0);
}
function gasStep(dt) {
  for (const g of S.gases) {
    g.life -= dt; g.r = Math.min(78, g.r + 140 * dt);
    for (const o of S.bots) if (o.alive && !g.hit.has(o) && hyp(o.x - g.x, o.y - g.y) < g.r) {
      g.hit.add(o); o.poison = 3; o.poisonBy = g.owner !== o ? g.owner : null; floater(o.x, o.y - 54, '毒', '#C9A8FF');
    }
  }
  S.gases = S.gases.filter(g => g.life > 0);
}

// ---------------------------------------------------------------- 補給箱
function spawnCrate() {
  const sp = findSpot(0, []);
  const r = S.rnd();
  S.crates.push({ x: sp.x, y: -40, vy: 0, kind: r < 0.35 ? 'heal' : r < 0.75 ? 'ammo' : 'rivet', landed: false, dead: false });
}
function crateStep(dt) {
  for (const c of S.crates) {
    if (c.dead) continue;
    if (!c.landed) {
      c.vy = Math.min(c.vy + G * dt, 150); c.y += c.vy * dt;
      if (solid(c.x, c.y + 11)) { c.landed = true; sfx('crate'); let k = 0; while (k < 10 && solid(c.x, c.y + 10)) { c.y--; k++; } }
      if (c.y > WATER) { c.dead = true; splashFx(c.x, WATER); }
    } else if (!solid(c.x, c.y + 11) && !solid(c.x - 8, c.y + 11) && !solid(c.x + 8, c.y + 11)) { c.landed = false; c.vy = 0; }
  }
  S.crates = S.crates.filter(c => !c.dead);
}
function pickCrate(b, c) {
  c.dead = true; sfx('pick'); b.crates++;
  if (c.kind === 'heal') { const v = Math.min(30, b.maxHp - b.hp); b.hp += v; floater(b.x, b.y - 54, `修理 +${v}`, '#7BE38B'); }
  else if (c.kind === 'ammo') {
    const opts = WORDER.filter(k => WP[k].ammo !== Infinity && WP[k].lv <= (b.human ? P.lv : 99) && (b.ammo[k] > 0 || WP[k].lv <= (b.human ? P.lv : 5)));
    const k = opts[Math.floor(S.rnd() * opts.length)] || 'grenade';
    const n = 1 + Math.floor(S.rnd() * 2); b.ammo[k] = (b.ammo[k] || 0) + n;
    floater(b.x, b.y - 54, `${WP[k].name} +${n}`, '#FFE08A');
  } else { b.rivetBonus = (b.rivetBonus || 0) + 50; floater(b.x, b.y - 54, 'リベット +50', '#FFC531'); }
}

// ---------------------------------------------------------------- 操作
function canFire(b) {
  if (S.tutorial && S.proj.some(p => !p.dead && p.owner === b && !p.stuck)) return false;
  return S.phase === 'turn' && !S.fired && !S.gun && b.ammo[b.weapon] > 0 && !S.proj.some(p => !p.dead && p.owner === b && p.k === 'tele');
}
function fireWeapon(b, a, pw) {
  const k = b.weapon, w = WP[k];
  if (!(b.ammo[k] > 0)) return false;
  if (w.move) return useMove(b, k, a);
  if (w.ammo !== Infinity && !S.tutorial) {
    // 持ち越しの弾は、試合の基本の弾を使い切ってから減る
    const fromStock = b.human && P.stock && (P.stock[k] || 0) > 0 && b.ammo[k] <= P.stock[k];
    b.ammo[k]--;
    if (fromStock) { P.stock[k]--; saveProfile(); }
    if (b.human && b.ammo[k] <= 0) offerAmmo(k);
  }
  pw = clamp(pw, 0.12, 1);
  b.aim = a; b.facing = Math.cos(a) >= 0 ? 1 : -1; b.elev = elevOf(b); b.fireT = 0.25;
  if (Math.random() < 0.55) speak(b, 'fire');
  if (w.gun) S.gun = { b, a, n: 6, t: 0 };
  else if (w.melee) swing(b, a);
  else { S.proj.push(makeProj(b, k, a, pw)); sfx(k === 'rocket' ? 'launch' : 'throw'); }
  if (!w.tele && !S.tutorial) { S.fired = true; S.phase = 'retreat'; S.turnTime = Math.min(S.turnTime, RETREAT); }
  b.power = 0; S.charge = null;
  if (b.human) showHint(false);
  if (b.ammo[k] <= 0 && !w.tele && !S.tutorial) b.weapon = 'rocket';
  if (w.tele && b.ammo[k] <= 0) b.weapon = 'rocket';
  return true;
}
function useMove(b, k, a) {
  if (k === 'jet') { if (b.jet) return false; b.jet = { fuel: 3, max: 3 }; sfx('jetOn'); }
  else if (k === 'chute') { if (b.chute) return false; b.chute = true; sfx('whoosh'); }
  else if (k === 'hook') {
    const ca = Math.cos(a), sa = Math.sin(a);
    let x = b.x + ca * 16, y = b.y - 3 + sa * 16, hit = false;
    for (let d = 0; d < WP.hook.range; d += 4) { x += ca * 4; y += sa * 4; if (solid(x, y)) { hit = true; break; } if (y > WATER) break; }
    part({ t: 'tracer', x: b.x, y: b.y - 3, x2: x, y2: y, life: 0.12 });
    if (!hit) { sfx('whoosh'); b.ammo[k]--; return true; }
    b.hook = { x: x - ca * 3, y: y - sa * 3, t: 0 }; b.grounded = false; b.selfJump = true; b.cut = true;
    sfx('clang');
  }
  b.ammo[k]--; b.aim = a; b.power = 0; S.charge = null;
  if (b.ammo[k] <= 0) b.weapon = 'rocket';
  if (b.human) showHint(false);
  return true;
}
// 移動アイテムの効き目（毎ステップ）
function moveStep(b, dt, mv, hold) {
  if (b.jet) {
    if (hold && b.jet.fuel > 0) {
      b.grounded = false; b.selfJump = true; b.cut = true;
      b.vy = Math.max(-250, b.vy - 1600 * dt);
      b.jet.fuel -= dt; b.jetOn = true;
      if (S.tick % 2 === 0) part({ t: 'smoke', x: b.x - b.facing * 8, y: b.y + 14, r: 3, vx: 0, vy: 60, life: 0.4, a: 0.35, warm: true });
      if (S.tick % 6 === 0) sfx('jet');
    } else b.jetOn = false;
    if (!b.grounded) b.vx += (mv * 175 - b.vx) * Math.min(1, dt * 5);
    if (b.jet.fuel <= 0 && b.grounded) b.jet = null;
  }
  if (b.hook) {
    const h = b.hook, dx = h.x - b.x, dy = h.y - (b.y - 4), d = hyp(dx, dy);
    h.t += dt;
    if (d < 22 || h.t > 1.3) { b.hook = null; b.vy = Math.min(b.vy, -120); }
    else { b.grounded = false; b.vx = dx / d * 560; b.vy = dy / d * 560; }
  }
}
function playerControl(b, dt) {
  const mv = I.move || I.moveKey;
  if (b.grounded && Math.abs(mv) > 0.2 && S.charge == null && !I.stick) {
    b.facing = mv > 0 ? 1 : -1; syncAim(b);
    walk(b, b.facing, dt * Math.min(1, Math.abs(mv) * 1.25)); b.walk += dt * 13;
    if (Math.floor(b.walk / Math.PI) !== Math.floor((b.walk - dt * 13) / Math.PI)) sfx('step');
  }
  if (I.jump) { I.jump = false; if (!b.jet) jump(b, Math.abs(mv) > 0.2 ? Math.sign(mv) : 0); }
  moveStep(b, dt, Math.abs(mv) > 0.2 ? mv : 0, I.jumpHeld);
  // 空中: 自分で跳んだ／足を踏み外したときだけ左右に操作できる（爆風で飛ばされている間は効かない）
  if (!b.grounded && b.selfJump) {
    if (Math.abs(mv) > 0.2) {
      const tgt = mv * AIR_SPD * (1 + b.st.speed / 200);
      b.vx += (tgt - b.vx) * Math.min(1, dt * 8);
      b.facing = mv > 0 ? 1 : -1; syncAim(b);
    }
    if (!I.jumpHeld && !b.cut && b.vy < -60) { b.vy *= 0.4; b.cut = true; }
  }
  if (I.aimKey && !I.stick) { b.elev = clamp(b.elev + I.aimKey * 1.6 * dt, -1.45, 1.55); syncAim(b); }
  if (I.stick) { b.aim = I.stick.a; b.power = I.stick.p; b.facing = Math.cos(b.aim) >= 0 ? 1 : -1; b.elev = elevOf(b); }
  if (S.charge != null) {
    S.charge += dt / 1.3; b.power = Math.min(1, S.charge);
    if (S.charge >= 1) I.fireReq = { a: b.aim, p: 1 };
  }
  if (I.fireReq) {
    const r = I.fireReq; I.fireReq = null;
    if (canFire(b)) fireWeapon(b, r.a, r.p);
    S.charge = null;
  }
}
function useBoost() {
  const b = S.active;
  if (!b || !b.human || !b.alive || b.boost <= 0 || !(S.phase === 'turn' || S.phase === 'retreat')) return;
  if (b.hp >= b.maxHp) { floater(b.x, b.y - 54, 'HP満タン', '#CFD8DC'); return; }
  if (b.boost <= Math.min(2, P.kits || 0)) { P.kits = Math.max(0, (P.kits || 0) - 1); saveProfile(); }
  b.boost--; const v = Math.min(35, b.maxHp - b.hp); b.hp += v;
  floater(b.x, b.y - 54, `修理 +${v}`, '#7BE38B'); sfx('pick');
}

// ---------------------------------------------------------------- CPU
const DIFF = { easy: { a: 0.1, p: 0.1, top: 6 }, normal: { a: 0.04, p: 0.045, top: 3 }, hard: { a: 0.012, p: 0.015, top: 1 } };
function gauss() { const u = Math.max(1e-6, S.rnd()), v = S.rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function simShot(b, k, a, pw) {
  const p = makeProj(b, k, a, pw), res = { x: p.x, y: p.y, water: false, contacts: [] };
  p.sim = res;
  for (let i = 0; i < 270 && !p.dead; i++) advance(p, STEP);
  if (!p.dead) { res.x = p.x; res.y = p.y; }
  return res;
}
function scoreBlast(b, k, r) {
  if (r.water) return 0;
  const w = WP[k];
  let s = 0, near = 1e9;
  const reach0 = k === 'fire' ? 50 : k === 'gas' ? 70 : w.R + R * 0.6;
  const dmg0 = k === 'fire' ? 18 : k === 'gas' ? 30 : w.dmg;
  for (const o of S.bots) {
    if (!o.alive) continue;
    const d = hyp(o.x - r.x, o.y - 6 - r.y);
    if (o !== b) near = Math.min(near, d);
    if (d >= reach0) continue;
    const f = 1 - d / reach0, dmg = dmg0 * (0.3 + 0.7 * f);
    if (o === b) { s -= dmg * 30 + (dmg >= o.hp ? 3000 : 0); continue; }
    s += dmg * 10 + (dmg >= o.hp ? 500 : 0);
    const side = Math.sign(o.x - r.x) || 1;
    if (!groundBelow(o.x + side * 70, o.y, 500)) s += 260 * f;
  }
  for (const o of r.contacts) if (o !== b) s += 140;
  s += Math.max(0, 150 - near) * 0.5;
  return s;
}
function* aiSearch(b) {
  const enemies = S.bots.filter(o => o !== b && o.alive);
  const out = [];
  for (const e of enemies) {
    const d = hyp(e.x - b.x, e.y - b.y), a = Math.atan2(e.y - 6 - (b.y - 4), e.x - b.x);
    if (b.ammo.hammer > 0 && d < 46) out.push({ k: 'hammer', aim: a, power: 1, score: 330 + (groundBelow(e.x + Math.sign(e.x - b.x) * 80, e.y, 500) ? 0 : 400) });
    if (b.ammo.revolver > 0 && d < 820 && los(b, e)) out.push({ k: 'revolver', aim: a, power: 1, score: 280 });
  }
  const ws = ['rocket'];
  if (b.ammo.grenade > 0) ws.push('grenade');
  const extra = ['cannon', 'bouncer', 'gas', 'fire'].filter(k => b.ammo[k] > 0);
  if (extra.length) ws.push(extra[Math.floor(S.rnd() * extra.length)]);
  for (const k of ws) {
    for (let a = -Math.PI; a <= 0.3; a += Math.PI / 45) {
      for (let pw = 0.3; pw <= 1.0001; pw += 0.07) {
        const r = simShot(b, k, a, pw), sc = scoreBlast(b, k, r);
        if (sc > 0) out.push({ k, aim: a, power: pw, score: sc, x: r.x, y: r.y });
      }
      yield;
    }
  }
  out.sort((p, q) => q.score - p.score);
  return out;
}
function nearestEnemy(b) {
  let best = null, bd = 1e9;
  for (const o of S.bots) if (o !== b && o.alive) { const d = hyp(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; best = o; } }
  return best;
}
function aiDecide(b, c) {
  const A = S.ai, good = c.filter(q => q.score >= 120);
  if (!good.length && !A.moved && S.turnTime > 9) {
    const e = nearestEnemy(b);
    if (e) { A.st = 'walk'; A.dir = Math.sign(e.x - b.x) || 1; A.t = 1 + S.rnd() * 1.5; A.moved = true; return; }
  }
  const N = DIFF[S.diff] || DIFF.normal;
  const pool = good.length ? good.slice(0, N.top) : c.slice(0, 1);
  const pick = pool.length ? pool[Math.floor(S.rnd() * pool.length)] : { k: 'rocket', aim: b.facing > 0 ? -0.7 : Math.PI + 0.7, power: 0.6, score: 0 };
  const fixed = WP[pick.k].fixed;
  A.plan = { ...pick, aim: pick.aim + gauss() * N.a * (fixed ? 0.3 : 1), power: clamp(pick.power * (1 + gauss() * N.p), 0.15, 1) };
  b.weapon = pick.k;
  A.a0 = b.aim; A.st = 'aim'; A.dur = A.t = 0.7 + S.rnd() * 0.3;
}
function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function aiControl(b, dt) {
  const A = S.ai;
  A.jumpCd -= dt;
  if (S.phase === 'retreat') {
    if (A.fleeT > 0 && b.grounded) {
      A.fleeT -= dt; b.facing = A.flee;
      if (!groundBelow(b.x + A.flee * 24, b.y, 220)) { A.fleeT = 0; return; }
      const ok = walk(b, A.flee, dt); b.walk += dt * 13;
      if (!ok && A.jumpCd <= 0) { jump(b, A.flee); A.jumpCd = 0.9; }
    }
    return;
  }
  if (S.phase !== 'turn') return;
  A.t -= dt;
  if (A.st === 'think') { if (A.t <= 0) { A.gen = aiSearch(b); A.st = 'search'; } }
  else if (A.st === 'search') {
    const lim = (S.turnTime < 4 || S.manual) ? 1e9 : 6, t0 = performance.now();
    let r;
    do { r = A.gen.next(); } while (!r.done && performance.now() - t0 < lim);
    if (r.done) aiDecide(b, r.value);
  } else if (A.st === 'walk') {
    if (b.grounded) {
      b.facing = A.dir; syncAim(b);
      if (!groundBelow(b.x + A.dir * 24, b.y, 220)) A.t = 0;
      else {
        const ok = walk(b, A.dir, dt); b.walk += dt * 13;
        if (!ok && A.jumpCd <= 0) { jump(b, A.dir); A.jumpCd = 0.9; }
      }
    }
    if ((A.t <= 0 || S.turnTime < 8) && b.grounded) { A.st = 'think'; A.t = 0.15; }
  } else if (A.st === 'aim') {
    const k = 1 - Math.max(0, A.t) / A.dur, e = k * k * (3 - 2 * k);
    b.aim = lerpAng(A.a0, A.plan.aim, e); b.power = A.plan.power * e; b.facing = Math.cos(b.aim) >= 0 ? 1 : -1;
    if (A.t <= 0) {
      fireWeapon(b, A.plan.aim, A.plan.power); A.st = 'done';
      if (A.plan.x != null && hyp(A.plan.x - b.x, A.plan.y - b.y) < 170) { A.flee = Math.sign(b.x - A.plan.x) || 1; A.fleeT = 1.6; }
    }
  }
  if (S.turnTime < 1.2 && A.st !== 'done' && A.st !== 'aim') {
    // 時間切れ前に必ず撃つ
    if (A.st === 'search') { let r; do { r = A.gen.next(); } while (!r.done); aiDecide(b, r.value); }
    else { A.moved = true; A.gen = aiSearch(b); let r; do { r = A.gen.next(); } while (!r.done); aiDecide(b, r.value); }
    if (A.st === 'aim') { A.t = 0; A.dur = 0.01; }
  }
}

// ---------------------------------------------------------------- 演出
function part(p) { if (S.parts.length < 700) S.parts.push(p); }
function floater(x, y, text, color, life = 1.1) { S.floats.push({ x, y, text, color, life, max: life }); }
function boomFx(x, y, size, color) {
  part({ t: 'flash', x, y, r: 30 + size * 50, life: 0.22, max: 0.22 });
  part({ t: 'ring', x, y, r: 10, vr: 260 * size + 80, life: 0.4, max: 0.4 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.random() * 0.3; part({ t: 'ray', x, y, a, L: (40 + Math.random() * 30) * Math.max(0.5, size), life: 0.12, max: 0.12 }); }
  for (let i = 0; i < 7 + size * 6; i++) part({ t: 'smoke', x: x + (Math.random() - 0.5) * 30 * size, y: y + (Math.random() - 0.5) * 30 * size, r: 6 + Math.random() * 10 * size, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 50, life: 0.65 + Math.random() * 0.45, a: 0.42, warm: true });
  for (let i = 0; i < 14 + size * 14; i++) {
    const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 360 * size;
    part({ t: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, g: G, life: 0.7 + Math.random() * 0.6, c: color || T.st.debris, s: 2 + Math.random() * 3 });
  }
  for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, s = 200 + Math.random() * 300; part({ t: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25, c: '#FFD36B' }); }
  S.cam.shake += size * 9;
}
function splashFx(x, y) {
  for (let i = 0; i < 18; i++) part({ t: 'debris', x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 160, vy: -150 - Math.random() * 260, g: G, life: 0.9, c: '#CDEBF2', s: 3 });
}

// ---------------------------------------------------------------- カメラ
function baseScale() { return view.h < 500 ? Math.min(view.w / 880, view.h / 460) : Math.min(view.w / 1000, view.h / 560); }
function camTarget() {
  const live = S.proj.find(p => !p.dead && !p.stuck);
  if (live) return { x: live.x, y: live.y, fast: true };
  if (S.phase === 'settle' || S.phase === 'retreat' || S.phase === 'over') {
    const fl = S.bots.find(b => b.alive && !b.grounded && hyp(b.vx, b.vy) > 150);
    if (fl) return { x: fl.x, y: fl.y, fast: true };
    if (S.focusT > 0 && S.focus) return { x: S.focus.x, y: S.focus.y };
  }
  if (S.talkFocus) return { x: S.talkFocus.x, y: S.talkFocus.y };
  if (S.active) return { x: S.active.x, y: S.active.y };
  return { x: W / 2, y: 760 };
}
function camStep(dt) {
  const c = S.cam;
  const fit = Math.min(view.w / W, view.h / (WATER + 160));
  const ts = c.over ? fit : Math.max(fit, baseScale() * c.zoom);
  c.s += (ts - c.s) * Math.min(1, dt * 5);
  const t = camTarget();
  let tx = t.x, ty = t.y - 40;
  if (c.over) { tx = W / 2; ty = (WATER + 120) / 2; }
  else if (S.active && S.active.human && (I.stick || S.charge != null)) { tx += Math.cos(S.active.aim) * 140; ty += Math.sin(S.active.aim) * 100; }
  const k = Math.min(1, dt * (t.fast ? 7 : 3.5));
  c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
  clampCam();
  c.shake *= Math.pow(0.015, dt);
  c.sx = (Math.random() - 0.5) * c.shake; c.sy = (Math.random() - 0.5) * c.shake;
}
function clampCam() {
  const c = S.cam, hw = view.w / 2 / c.s, hh = view.h / 2 / c.s;
  c.x = W > 2 * hw ? clamp(c.x, hw, W - hw) : W / 2;
  const top = -150, bot = WATER + 140;
  c.y = (bot - top) > 2 * hh ? clamp(c.y, top + hh, bot - hh) : (top + bot) / 2;
}
function titleCam() {
  const c = S.cam; c.s = baseScale() * 0.92;
  c.x = W / 2 + Math.sin(S.time * 0.08) * 700; c.y = 760; c.sx = c.sy = 0;
  clampCam();
}

// ---------------------------------------------------------------- 描画
const cv = $('#cv'), ctx = cv.getContext('2d');
function resize() {
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth; view.h = window.innerHeight;
  cv.width = Math.round(view.w * view.dpr); cv.height = Math.round(view.h * view.dpr);
  cv.style.width = view.w + 'px'; cv.style.height = view.h + 'px';
  // 大きい画面では画面まわりの部品を拡大する（最大1.8倍）
  document.documentElement.style.setProperty('--ui', clamp(Math.min(view.w / 1280, view.h / 760), 1, 1.8).toFixed(3));
  const portrait = view.h > view.w && matchMedia('(pointer:coarse)').matches;
  $('#rotate').hidden = !portrait;
  layoutSticks();
}
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
const ell = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fill(); };

// ---------------------------------------------------------------- ミニマップと画面外の矢印
const mini = { base: null, dirty: true, t: -99 };
function miniBuild() {
  const w = 220, h = Math.round(w * (WATER + 60) / W), sc = W / w;
  const c = mini.base && mini.base.width === w ? mini.base : document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data, st = T.st;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const wx = Math.floor((px + 0.5) * sc), wy = Math.floor((py + 0.5) * sc), o = (py * w + px) * 4;
    if (wy >= WATER) { d[o] = 26; d[o + 1] = 58; d[o + 2] = 70; d[o + 3] = 255; continue; }
    if (T.m[wy * W + wx]) {
      const top = wy > 12 && !T.m[(wy - 12) * W + wx];
      const col = top ? st.top : st.rock;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  mini.base = c; mini.dirty = false; mini.t = S.tick;
}
function miniDraw() {
  const el = $('#mini');
  if (!T || $('#hud').hidden) return;
  if (!mini.base || (mini.dirty && S.tick - mini.t > 12)) miniBuild();
  const dpr = view.dpr, cw = el.clientWidth, ch = el.clientHeight;
  if (el.width !== Math.round(cw * dpr)) { el.width = Math.round(cw * dpr); el.height = Math.round(ch * dpr); }
  const c = el.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, cw, ch);
  c.fillStyle = 'rgba(17,24,29,.55)'; c.fillRect(0, 0, cw, ch);
  c.drawImage(mini.base, 0, 0, cw, ch);
  const k = cw / W;
  // 今見えている範囲
  const s = S.cam.s, vw = view.w / s, vh = view.h / s;
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.2;
  c.strokeRect((S.cam.x - vw / 2) * k, (S.cam.y - vh / 2) * k, vw * k, vh * k);
  for (const p of S.proj) if (!p.dead) { c.fillStyle = '#FFFFFF'; c.fillRect(p.x * k - 1, p.y * k - 1, 2, 2); }
  for (const b of S.bots) {
    if (!b.alive) continue;
    const on = b === S.active && (S.tick % 30 < 18);
    c.fillStyle = '#11181D'; c.beginPath(); c.arc(b.x * k, (b.y - 6) * k, on ? 4.6 : 3.8, 0, 7); c.fill();
    c.fillStyle = b.color; c.beginPath(); c.arc(b.x * k, (b.y - 6) * k, on ? 3.4 : 2.6, 0, 7); c.fill();
  }
}
function drawTutMarks(c, t) {
  const key = (TUT_STEPS[S.tutorial.step] || {}).key, bob = Math.sin(t * 5) * 4;
  const arrow = (x, y) => { c.fillStyle = '#FFC531'; c.strokeStyle = OL; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 9, y - 14 + bob); c.lineTo(x + 9, y - 14 + bob); c.lineTo(x, y + bob); c.closePath(); c.fill(); c.stroke(); };
  if (key === 'walk') {
    let f = 300; while (f < WATER && !solid(TUT_FLAG, f + 1)) f++;
    c.strokeStyle = OL; c.lineWidth = 2.4; c.beginPath(); c.moveTo(TUT_FLAG, f + 1); c.lineTo(TUT_FLAG, f - 42); c.stroke();
    c.fillStyle = '#FFC531'; c.beginPath(); c.moveTo(TUT_FLAG, f - 42); c.quadraticCurveTo(TUT_FLAG + 12, f - 40 + Math.sin(t * 6) * 3, TUT_FLAG + 22, f - 36); c.lineTo(TUT_FLAG, f - 30); c.closePath(); c.fill(); c.stroke();
    arrow(TUT_FLAG, f - 52);
  } else if (key === 'jump') arrow((TUT_LEDGE[0] + TUT_LEDGE[1]) / 2, 700);
  else if (key === 'fire' || key === 'drop') { const d = S.bots[1]; if (d.alive) arrow(d.x, d.y - 74); }
}
function drawOffscreen(ox, oy, s) {
  const cw = view.w, ch = view.h, top = 74, bot = ch - 86, side = 22;
  for (const b of S.bots) {
    if (!b.alive) continue;
    const sx = ox + b.x * s, sy = oy + (b.y - 10) * s;
    if (sx > -10 && sx < cw + 10 && sy > -10 && sy < ch + 30) continue;
    const cx = clamp(sx, side + 14, cw - side - 14), cy = clamp(sy, top + 14, bot - 14);
    const a = Math.atan2(sy - cy, sx - cx);
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(17,24,29,.8)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.rotate(a);
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(14, -6); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#11181D'; ctx.font = '10px "Dela Gothic One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(hyp(b.x - S.cam.x, b.y - S.cam.y) / 10)), cx, cy + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
}

const vig = { g: null, w: 0, h: 0 };
function render() {
  const dpr = view.dpr, cw = view.w, ch = view.h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!T) { ctx.fillStyle = '#1B262E'; ctx.fillRect(0, 0, cw, ch); return; }
  const st = T.st, c = S.cam, s = c.s, t = S.time;
  const ox = cw / 2 - c.x * s + c.sx, oy = ch / 2 - c.y * s + c.sy;
  drawBackdrop(cw, ch, s, oy);
  // 世界
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  for (const d of T.decos) if (d.hang) drawDeco(ctx, d, t);
  ctx.drawImage(T.cv, 0, 0);
  for (const d of T.decos) if (!d.hang) drawDeco(ctx, d, t);
  for (const cr of S.crates) drawCrate(ctx, cr);
  for (const g of S.gases) {
    ctx.fillStyle = `rgba(150,100,230,${0.22 * Math.min(1, g.life)})`;
    for (let i = 0; i < 5; i++) circ(ctx, g.x + Math.cos(t * 1.3 + i * 1.3) * g.r * 0.35, g.y + Math.sin(t * 1.1 + i * 2) * g.r * 0.25, g.r * 0.6);
  }
  for (const p of S.proj) if (p.stuck) drawProj(ctx, p, t);
  const hideBots = S.resultShown;
  if (S.npc) { DOC.x = S.npc.x; DOC.y = S.npc.y; DOC.facing = S.npc.facing; DOC.blink -= 1 / 60; if (DOC.blink < -0.12) DOC.blink = 2 + Math.random() * 3; drawDoc(ctx, DOC, t, false); }
  if (S.tutorial && S.tutorial.step >= 0) drawTutMarks(ctx, t);
  if (!hideBots) for (const b of S.bots) if (b.alive) drawBot(ctx, b, t, false);
  for (const p of S.proj) if (!p.stuck) drawProj(ctx, p, t);
  for (const f of S.flames) {
    const fl = 0.7 + Math.sin(t * 30 + f.x) * 0.3;
    ctx.fillStyle = '#FF8A2A'; ctx.beginPath(); ctx.moveTo(f.x - 5, f.y + 2); ctx.quadraticCurveTo(f.x, f.y - 16 * fl, f.x + 5, f.y + 2); ctx.fill();
    ctx.fillStyle = '#FFE08A'; ctx.beginPath(); ctx.moveTo(f.x - 2.5, f.y + 2); ctx.quadraticCurveTo(f.x, f.y - 8 * fl, f.x + 2.5, f.y + 2); ctx.fill();
  }
  drawParts(ctx);
  // 水
  const x0 = c.x - cw / 2 / s - 40, x1 = c.x + cw / 2 / s + 40;
  drawWater(ctx, x0, x1, t);
  // 狙い
  const b = S.active;
  if (b && b.alive && (S.phase === 'turn') && (b.human || S.ai && S.ai.st === 'aim')) drawAim(ctx, b, t);
  // 名札とHP
  if (!hideBots) for (const o of S.bots) if (o.alive) drawTag(ctx, o, t);
  // 試合中の吹き出しは出さない（声だけ鳴らす）
  for (const o of S.bots) {
    if (!o.alive) continue;
    if (o.hook) { ctx.strokeStyle = '#2A3036'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x, o.y - 4); ctx.lineTo(o.hook.x, o.hook.y); ctx.stroke(); ctx.fillStyle = '#9AA3AB'; circ(ctx, o.hook.x, o.hook.y, 3.5); }
    if (o.jet) {
      const y = o.y + 24; ctx.fillStyle = 'rgba(17,24,29,.85)'; rr(ctx, o.x - 16, y, 32, 5, 2); ctx.fill();
      ctx.fillStyle = '#FF9330'; rr(ctx, o.x - 15, y + 1, 30 * clamp(o.jet.fuel / o.jet.max, 0, 1), 3, 1.5); ctx.fill();
    }
  }
  // 数字
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const f of S.floats) {
    const a = Math.min(1, f.life / f.max * 3);
    ctx.globalAlpha = a; ctx.font = '16px "Dela Gothic One", sans-serif';
    ctx.strokeStyle = '#151B20'; ctx.lineWidth = 4; ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMotes(cw, ch);
  // 四隅を落として全体を暗めに
  if (!vig.g || vig.w !== cw || vig.h !== ch) { vig.w = cw; vig.h = ch; vig.g = ctx.createRadialGradient(cw / 2, ch * 0.45, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); vig.g.addColorStop(0, 'rgba(8,10,14,0)'); vig.g.addColorStop(1, 'rgba(8,10,14,.55)'); }
  ctx.fillStyle = vig.g; ctx.fillRect(0, 0, cw, ch);
  if (inMatch() && S.phase !== 'over' && !c.over) drawOffscreen(ox, oy, s);
  miniDraw();
}
// ---------------------------------------------------------------- 景色（背景・地形の質感・置物・水）
function vnoise(seed) {
  const N = 256, g = new Float32Array(N * N), r = mulberry(seed);
  for (let i = 0; i < N * N; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) * N, y1 = ((yi + 1) & 255) * N;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;

function paintTerrain(t) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const img = c.createImageData(W, H), d = img.data, m = t.m, st = t.st;
  const vn = vnoise(77 + t.key.length * 13);
  const below = new Int16Array(H);
  const grassD = new Uint8Array(W);
  for (let x = 0; x < W; x++) grassD[x] = 5 + Math.floor(vn(x / 7, 3.3) * 5) + ((((x * 2654435761) >>> 0) % 19 === 0) ? 4 : 0);
  const topL = st.topLight, top = st.top, topD = st.topDark, r1 = st.rock, r2 = st.rock2;
  for (let x = 0; x < W; x++) {
    let k = 0;
    for (let y = H - 1; y >= 0; y--) { if (m[y * W + x]) k++; else k = 0; below[y] = k; }
    let a = 0;
    for (let y = 0; y < H; y++) {
      const i = y * W + x, v = m[i];
      if (!v) { a = 0; continue; }
      a++;
      const hs = ((x * 73856093) ^ (y * 19349663)) >>> 0, nz = (hs % 13) - 6;
      let col, sh = 1;
      if (v === 2) {
        const grain = Math.sin(x * 0.7 + vn(x / 30, y / 2) * 7) * 9;
        col = [128 + grain + nz, 84 + grain + nz, 48 + grain * 0.6];
        if (a <= 2) col = mixc(col, [214, 170, 110], 0.5);
        if (x % 46 < 2) sh *= 0.7;
        if (x % 46 === 6 && a === 4) col = [200, 200, 205];
      } else {
        const gd = grassD[x];
        if (a <= gd) {
          const tt = a / gd;
          col = a <= 2 ? topL : mixc(top, topD, Math.max(0, tt - 0.35) / 0.65);
          col = [col[0] + nz * 1.2, col[1] + nz * 1.2, col[2] + nz];
        } else {
          const n = vn(x / 70, y / 70) * 0.5 + vn(x / 20, y / 20) * 0.32 + vn(x / 6, y / 6) * 0.18;
          const strata = Math.sin(y * 0.05 + vn(x / 140, y / 260) * 5);
          col = strata > 0.3 ? r2 : r1;
          let kk = 0.78 + n * 0.44;
          if (a > 14 && below[y] > 10 && vn(x / 90 + 7, y / 90 + 3) > 0.62 && Math.abs(vn(x / 34 + 50, y / 34 + 50) - 0.5) < 0.0075) kk *= 0.7;
          if (vn(x / 3.4 + 9, y / 3.4) > 0.84) kk *= 1.12;
          kk *= 1 - Math.min(a, 320) / 320 * 0.22;
          col = [col[0] * kk + nz, col[1] * kk + nz, col[2] * kk + nz];
          // 上から差す光
          if (y > 4 && x > 4 && !m[i - 4 * W - 4]) sh *= 1.16;
          if (a <= gd + 3) sh *= 0.8;
        }
        if (y < H - 4 && x < W - 4 && !m[i + 4 * W + 4]) sh *= 0.82;
      }
      // 縁取り
      if ((x > 0 && !m[i - 1]) || (x < W - 1 && !m[i + 1]) || (y < H - 1 && !m[i + W])) sh *= 0.5;
      else if (a === 1) sh *= 0.62;
      if (below[y] <= 12) sh *= 0.52 + 0.04 * below[y];
      const o = i * 4;
      d[o] = col[0] * sh; d[o + 1] = col[1] * sh; d[o + 2] = col[2] * sh; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  // 地表の草・小石
  const r = mulberry(5150 + t.key.length);
  for (let x = 2; x < W - 2; x += 2) {
    for (let y = 1; y < H - 1; y++) {
      if (m[y * W + x] !== 1 || m[(y - 1) * W + x]) continue;
      if (st.grass) {
        if (r() < 0.55) {
          const h = 3 + r() * 6, lean = (r() - 0.5) * 4;
          c.strokeStyle = r() < 0.5 ? rgb(st.topLight) : rgb(st.top);
          c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y + 1); c.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); c.stroke();
        }
      } else if (r() < 0.06) {
        c.fillStyle = rgb(mixc(st.rock2, [40, 30, 25], 0.3)); c.beginPath(); c.ellipse(x, y, 2 + r() * 2, 1.4, 0, Math.PI, 0); c.fill();
      }
      y += 6;
    }
  }
  t.cv = cv; t.c = c;
}

// ---------------------------------------------------------------- 置物（地形が崩れると落ちる）
function buildDecos(t, seed) {
  const r = mulberry(seed ^ 0x51ed), m = t.m, list = [], st = t.st;
  const kinds = st.grass ? ['palm', 'fern', 'fern', 'mush', 'flower', 'flower', 'rock'] : ['cactus', 'cactus', 'bush', 'skull', 'barrel', 'pipe', 'sign'];
  let lastX = -999;
  for (let x = 40; x < W - 40; x += 6) {
    if (x - lastX < 55 || r() > 0.32) continue;
    let y = 0; while (y < WATER - 20 && !m[y * W + x]) y++;
    if (y >= WATER - 20 || m[y * W + x] !== 1) continue;
    // 平らな所だけ
    let yl = 0, yr = 0; while (yl < WATER && !m[yl * W + x - 6]) yl++; while (yr < WATER && !m[yr * W + x + 6]) yr++;
    if (Math.abs(yl - y) > 5 || Math.abs(yr - y) > 5) continue;
    const k = kinds[Math.floor(r() * kinds.length)];
    list.push({ k, x, y: y + 1, h: 0.75 + r() * 0.5, f: r() < 0.5 ? -1 : 1, ph: r() * 6.28, hang: false, vy: 0, falling: false, dead: false });
    lastX = x;
  }
  if (st.grass) {
    // 浮島の裏から垂れるツタ
    for (let x = 60; x < W - 60; x += 9) {
      if (r() > 0.07) continue;
      for (let y = 200; y < WATER - 60; y++) {
        if (m[y * W + x] && !m[(y + 1) * W + x] && !m[(y + 40) * W + x]) { list.push({ k: 'vine', x, y, h: 0.6 + r() * 0.9, f: 1, ph: r() * 6.28, hang: true, vy: 0, falling: false, dead: false }); break; }
      }
    }
  }
  return list;
}
function decoCarve(x, y, r) {
  if (!T || !T.decos) return;
  for (const d of T.decos) {
    if (d.dead || Math.abs(d.x - x) > r + 70 || Math.abs(d.y - y) > r + 120) continue;
    if (hyp(d.x - x, d.y - y) < r + 4) {
      d.dead = true;
      for (let i = 0; i < 8; i++) part({ t: 'debris', x: d.x, y: d.y - 8, vx: (Math.random() - 0.5) * 260, vy: -100 - Math.random() * 200, g: G, life: 0.8, c: T.st.grass ? '#5E9E3E' : '#4E9A4A', s: 3 });
      continue;
    }
    const held = d.hang ? solid(d.x, d.y - 1) : (solid(d.x, d.y + 1) || solid(d.x - 4, d.y + 1) || solid(d.x + 4, d.y + 1));
    if (!held) d.falling = true;
  }
}
function decoStep(dt) {
  if (!T || !T.decos) return;
  for (const d of T.decos) {
    if (!d.falling || d.dead) continue;
    d.vy = Math.min(700, d.vy + G * dt); d.y += d.vy * dt;
    if (!d.hang && solid(d.x, d.y + 1)) { d.falling = false; d.vy = 0; }
    if (d.y > WATER) { d.dead = true; splashFx(d.x, WATER); }
  }
}
function drawDeco(c, d, t) {
  if (d.dead) return;
  c.save(); c.translate(d.x, d.y); c.scale(d.f * d.h, d.h);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const sway = Math.sin(t * 1.6 + d.ph) * 0.06;
  switch (d.k) {
    case 'cactus': {
      const g = gradH(c, -6, 6, ['#2F6B33', '#5DAA52', '#3E8540']);
      c.beginPath(); rr(c, -5.5, -40, 11, 41, 5.5); fillStroke(c, g, 1.6);
      c.beginPath(); rr(c, -15, -24, 9, 6, 3); fillStroke(c, g, 1.4); c.beginPath(); rr(c, -15, -36, 6, 15, 3); fillStroke(c, g, 1.4);
      c.beginPath(); rr(c, 5, -18, 8, 5.5, 2.7); fillStroke(c, g, 1.4); c.beginPath(); rr(c, 8, -29, 5.5, 14, 2.7); fillStroke(c, g, 1.4);
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1.5, -36); c.lineTo(-1.5, -2); c.stroke();
      c.fillStyle = '#FFE6A8'; for (let i = 0; i < 6; i++) circ(c, (i % 2 ? 4 : -4), -34 + i * 5.5, 0.6);
      if (d.ph > 4) { c.fillStyle = '#FF6FA8'; circ(c, 0, -41, 2.6); c.fillStyle = '#FFD1E3'; circ(c, -0.7, -41.8, 0.9); }
      break;
    }
    case 'bush': {
      c.strokeStyle = '#7A5634'; c.lineWidth = 1.4;
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.3 + sway; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(a) * 6, Math.sin(a) * 6 - 3, Math.cos(a) * 12, Math.sin(a) * 12); c.stroke(); }
      break;
    }
    case 'skull': {
      c.beginPath(); c.ellipse(0, -4, 6.5, 5.5, 0, Math.PI, 0); c.lineTo(4, 0); c.lineTo(-4, 0); c.closePath(); fillStroke(c, '#EFE6D2', 1.3);
      c.fillStyle = '#2A2420'; ell(c, -2.4, -4.2, 1.6, 1.8); ell(c, 2.4, -4.2, 1.6, 1.8);
      c.strokeStyle = '#EFE6D2'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(7, -1); c.lineTo(15, -3); c.stroke();
      break;
    }
    case 'barrel': {
      c.save(); c.rotate(d.ph > 3 ? 0.08 : -0.05);
      c.beginPath(); rr(c, -7, -19, 14, 19, 2); fillStroke(c, gradH(c, -7, 7, ['#7A3A1E', '#C2652F', '#8A4220']), 1.5);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(-7, -15, 14, 1.6); c.fillRect(-7, -5, 14, 1.6);
      c.fillStyle = 'rgba(90,50,30,.6)'; ell(c, 2, -11, 2.5, 1.6); ell(c, -3, -7, 1.6, 2.4);
      c.fillStyle = '#FFC531'; c.beginPath(); c.moveTo(-2.5, -9); c.lineTo(0, -13); c.lineTo(2.5, -9); c.closePath(); c.fill();
      c.restore(); break;
    }
    case 'pipe': {
      c.beginPath(); c.moveTo(-3, 0); c.lineTo(-3, -16); c.quadraticCurveTo(-3, -22, 3, -22); c.lineTo(10, -22); c.lineTo(10, -16); c.lineTo(3, -16); c.lineTo(3, 0); c.closePath();
      fillStroke(c, gradV(c, -22, 0, ['#B76A3A', '#6E3B22']), 1.4);
      c.beginPath(); rr(c, 9, -24, 3.5, 10, 1); fillStroke(c, '#8A4C2A', 1.2);
      if (Math.floor(t * 2 + d.ph) % 3 === 0) { c.fillStyle = 'rgba(220,220,220,.35)'; circ(c, 14 + (t * 10) % 8, -19 - (t * 14) % 10, 2.4); }
      break;
    }
    case 'sign': {
      c.beginPath(); rr(c, -1.4, -26, 2.8, 26, 1); fillStroke(c, '#7A5634', 1.2);
      c.save(); c.rotate(-0.08);
      c.beginPath(); rr(c, -11, -28, 22, 11, 1.5); fillStroke(c, '#FFC531', 1.4);
      c.fillStyle = '#1A1F25'; for (let i = -10; i < 10; i += 5) { c.beginPath(); c.moveTo(i, -18); c.lineTo(i + 2.5, -18); c.lineTo(i + 5.5, -27); c.lineTo(i + 3, -27); c.fill(); }
      c.restore(); break;
    }
    case 'palm': {
      c.rotate(sway * 0.4);
      c.strokeStyle = OL; c.lineWidth = 7.5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-6, -40, 6, -78); c.stroke();
      c.strokeStyle = '#9A7046'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-6, -40, 6, -78); c.stroke();
      c.strokeStyle = '#6E4C2C'; c.lineWidth = 1;
      for (let i = 1; i < 10; i++) { const tt = i / 10, px = (1 - tt) * (1 - tt) * 0 + 2 * (1 - tt) * tt * -6 + tt * tt * 6, py = 2 * (1 - tt) * tt * -40 + tt * tt * -78; c.beginPath(); c.moveTo(px - 2.4, py); c.lineTo(px + 2.4, py + 1); c.stroke(); }
      c.translate(6, -78);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.55 + Math.sin(t * 1.4 + d.ph + i) * 0.06, L = 30 + (i % 2) * 6;
        const ex = Math.cos(a) * L, ey = Math.sin(a) * L + L * 0.45;
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(a) * L * 0.5 - Math.sin(a) * 6, Math.sin(a) * L * 0.5 - 6, ex, ey);
        c.quadraticCurveTo(Math.cos(a) * L * 0.5 + Math.sin(a) * 4, Math.sin(a) * L * 0.5 + 2, 0, 0);
        fillStroke(c, i % 2 ? '#3E8C3A' : '#5DB04A', 1.3);
      }
      c.fillStyle = '#7A5634'; circ(c, -2, 3, 3); circ(c, 3, 4, 3);
      break;
    }
    case 'fern': {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.42 + sway, L = 15 + (i % 3) * 3;
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(a) * L * 0.6 - 3, Math.sin(a) * L * 0.6, Math.cos(a) * L, Math.sin(a) * L + 4);
        c.quadraticCurveTo(Math.cos(a) * L * 0.6 + 3, Math.sin(a) * L * 0.6 + 2, 0, 0);
        fillStroke(c, i % 2 ? '#3F8F45' : '#62B356', 1.1);
      }
      break;
    }
    case 'mush': {
      c.beginPath(); rr(c, -2.4, -9, 4.8, 9, 2); fillStroke(c, '#F2E8D6', 1.2);
      c.beginPath(); c.ellipse(0, -9, 9, 6.5, 0, Math.PI, 0); c.closePath(); fillStroke(c, gradV(c, -16, -9, ['#FF5A4E', '#C9302A']), 1.4);
      c.fillStyle = '#FFF4E6'; circ(c, -4, -12, 1.5); circ(c, 2, -14, 1.8); circ(c, 5, -10.5, 1.2);
      break;
    }
    case 'flower': {
      c.strokeStyle = '#3F8F45'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(2, -7, sway * 20, -13); c.stroke();
      const cols = ['#FF7AB0', '#FFD84A', '#8CC8FF'], col = cols[Math.floor(d.ph) % 3];
      c.save(); c.translate(sway * 20, -13); c.rotate(t * 0.3 + d.ph);
      c.fillStyle = col; for (let i = 0; i < 5; i++) { c.rotate(Math.PI * 2 / 5); ell(c, 0, -3, 1.9, 2.8); }
      c.fillStyle = '#FFF4C2'; circ(c, 0, 0, 1.7); c.restore();
      break;
    }
    case 'rock': {
      c.beginPath(); c.moveTo(-10, 0); c.lineTo(-8, -7); c.lineTo(-2, -11); c.lineTo(6, -9); c.lineTo(10, 0); c.closePath();
      fillStroke(c, gradV(c, -11, 0, ['#A8A39A', '#6B665E']), 1.4);
      c.fillStyle = '#5DB04A'; ell(c, -3, -10, 4, 1.6);
      break;
    }
    case 'vine': {
      const L = 26 + d.h * 34;
      c.strokeStyle = '#3F7A3A'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(0, 0);
      for (let y = 0; y <= L; y += 6) c.lineTo(Math.sin(y * 0.12 + t * 1.2 + d.ph) * 3 * (y / L), y);
      c.stroke();
      c.fillStyle = '#5DB04A';
      for (let y = 8; y <= L; y += 11) { const x = Math.sin(y * 0.12 + t * 1.2 + d.ph) * 3 * (y / L); ell(c, x + (y % 22 ? 3 : -3), y, 3, 1.8); }
      break;
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- 背景
// 横に繋がる絵を層ごとに一度だけ描いておき、毎フレームは貼るだけにする
const BG_W = 2048;
function layerCanvas(h) { const c = document.createElement('canvas'); c.width = BG_W; c.height = h; return c; }
function wrapDraw(fn) { for (const off of [-BG_W, 0, BG_W]) fn(off); }
function buildBackdrop(key, seed) {
  const r = mulberry(seed ^ 0xbac4), st = STAGES[key], layers = [], smokes = [], falls = [];
  if (key === 'canyon') {
    // 遠くの台地
    let cv = layerCanvas(420), c = cv.getContext('2d');
    c.fillStyle = gradV(c, 120, 420, ['#7A4248', '#5E3A36']);
    c.beginPath(); c.moveTo(0, 420);
    for (let x = 0; x <= BG_W; x += 4) {
      const n = Math.sin(x / BG_W * Math.PI * 2 * 3 + 1) * 0.5 + Math.sin(x / BG_W * Math.PI * 2 * 7 + 2) * 0.3;
      c.lineTo(x, 300 - Math.round(n * 3) * 40);
    }
    c.lineTo(BG_W, 420); c.fill();
    layers.push({ cv, f: 0.1, lift: 30, fill: '#5E3A36' });
    // サビた工場と鉄塔
    cv = layerCanvas(460); c = cv.getContext('2d');
    const col = '#3E2628';
    c.fillStyle = col; c.strokeStyle = col;
    for (let i = 0; i < 7; i++) {
      const x = i * (BG_W / 7) + r() * 120;
      wrapDraw(off => {
        const X = x + off;
        if (i % 3 === 0) { // 煙突のある工場
          c.fillRect(X, 300, 160, 160); c.fillRect(X + 20, 150, 18, 160); c.fillRect(X + 60, 190, 14, 120);
          c.beginPath(); c.moveTo(X, 300); for (let k = 0; k < 4; k++) { c.lineTo(X + k * 40 + 20, 270); c.lineTo(X + k * 40 + 40, 300); } c.fill();
        } else if (i % 3 === 1) { // クレーン
          c.lineWidth = 4; c.beginPath(); c.moveTo(X, 460); c.lineTo(X + 10, 140); c.lineTo(X + 20, 460); c.stroke();
          c.lineWidth = 2; for (let y = 160; y < 460; y += 26) { c.beginPath(); c.moveTo(X + 2, y); c.lineTo(X + 18, y + 26); c.stroke(); }
          c.lineWidth = 4; c.beginPath(); c.moveTo(X - 40, 150); c.lineTo(X + 140, 150); c.stroke();
          c.lineWidth = 1.5; c.beginPath(); c.moveTo(X + 110, 150); c.lineTo(X + 110, 230); c.stroke(); c.fillRect(X + 102, 230, 16, 12);
        } else { // タンク
          c.beginPath(); c.ellipse(X + 60, 360, 60, 40, 0, Math.PI, 0); c.fill(); c.fillRect(X, 360, 120, 100);
          c.lineWidth = 3; c.beginPath(); c.moveTo(X + 120, 380); c.lineTo(X + 200, 380); c.lineTo(X + 200, 460); c.stroke();
        }
      });
      if (i % 3 === 0) { smokes.push({ x: x + 29, y: 150 }); smokes.push({ x: x + 67, y: 190 }); }
    }
    layers.push({ cv, f: 0.22, lift: 10, smokes, smokeCol: 'rgba(120,96,96,', fill: '#3E2628' });
    // 手前の岩柱とアーチ
    cv = layerCanvas(520); c = cv.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const x = i * (BG_W / 5) + r() * 150, w = 70 + r() * 70, h = 230 + r() * 200;
      wrapDraw(off => {
        const X = x + off;
        c.fillStyle = gradH(c, X, X + w, ['#2E1A18', '#4A2A22', '#26150F']);
        c.beginPath(); c.moveTo(X, 520); c.lineTo(X + 8, 520 - h); c.lineTo(X + w - 6, 520 - h - 10); c.lineTo(X + w, 520); c.fill();
        c.fillStyle = 'rgba(255,130,80,.28)'; c.fillRect(X + 8, 520 - h - 2, w - 14, 3);
        if (i % 2) { c.fillStyle = '#3A2018'; c.beginPath(); c.moveTo(X + w, 520 - h * 0.7); c.quadraticCurveTo(X + w + 90, 520 - h * 0.95, X + w + 180, 520 - h * 0.6); c.lineTo(X + w + 180, 520 - h * 0.6 + 26); c.quadraticCurveTo(X + w + 90, 520 - h * 0.8, X + w, 520 - h * 0.55); c.fill(); }
      });
    }
    layers.push({ cv, f: 0.42, lift: -10, fill: '#2A1814' });
  } else {
    // 霧の山並み（2段）
    let cv = layerCanvas(460), c = cv.getContext('2d');
    for (const [base, amp, colA, colB, fr] of [[220, 120, '#3E5E5C', '#52726C', 2], [300, 90, '#30504C', '#46665E', 4]]) {
      c.fillStyle = gradV(c, base - amp, 460, [colA, colB]);
      c.beginPath(); c.moveTo(0, 460);
      for (let x = 0; x <= BG_W; x += 6) c.lineTo(x, base - (Math.sin(x / BG_W * Math.PI * 2 * fr + base) * 0.6 + Math.sin(x / BG_W * Math.PI * 2 * fr * 3) * 0.25 + 0.4) * amp);
      c.lineTo(BG_W, 460); c.fill();
    }
    layers.push({ cv, f: 0.1, lift: 40, fill: '#46665E' });
    // 遠くの浮島と滝
    cv = layerCanvas(460); c = cv.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const x = i * (BG_W / 5) + r() * 160, y = 120 + r() * 140, w = 110 + r() * 90;
      wrapDraw(off => {
        const X = x + off;
        c.fillStyle = '#2E4C44'; c.beginPath(); c.moveTo(X, y); c.quadraticCurveTo(X + w / 2, y - 14, X + w, y); c.quadraticCurveTo(X + w * 0.6, y + 70, X + w / 2, y + 90); c.quadraticCurveTo(X + w * 0.35, y + 60, X, y); c.fill();
        c.fillStyle = '#28443C'; for (let k = 0; k < 4; k++) circ(c, X + 14 + k * (w - 28) / 3, y - 8, 12 + (k % 2) * 5);
      });
      if (i % 2 === 0) falls.push({ x: x + w * 0.6, y: y + 20, h: 460 - y });
    }
    layers.push({ cv, f: 0.22, lift: 0, falls });
    // 手前のジャングル
    cv = layerCanvas(420); c = cv.getContext('2d');
    c.fillStyle = '#1C3329';
    c.beginPath(); c.moveTo(0, 420); for (let x = 0; x <= BG_W; x += 8) c.lineTo(x, 300 - Math.abs(Math.sin(x * 0.011)) * 40 - Math.abs(Math.sin(x * 0.037)) * 20); c.lineTo(BG_W, 420); c.fill();
    for (let i = 0; i < 26; i++) {
      const x = r() * BG_W, h = 120 + r() * 140;
      wrapDraw(off => {
        const X = x + off;
        c.strokeStyle = '#18291F'; c.lineWidth = 5; c.beginPath(); c.moveTo(X, 420); c.quadraticCurveTo(X - 10, 420 - h / 2, X + 6, 420 - h); c.stroke();
        c.fillStyle = '#18291F';
        for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.6; c.beginPath(); c.moveTo(X + 6, 420 - h); c.quadraticCurveTo(X + 6 + Math.cos(a) * 22, 420 - h + Math.sin(a) * 22 - 8, X + 6 + Math.cos(a) * 40, 420 - h + Math.sin(a) * 30 + 18); c.quadraticCurveTo(X + 6 + Math.cos(a) * 20, 420 - h + Math.sin(a) * 18, X + 6, 420 - h); c.fill(); }
      });
    }
    layers.push({ cv, f: 0.42, lift: -20, fill: '#1C3329' });
  }
  const clouds = [];
  for (let i = 0; i < 9; i++) clouds.push({ x: r() * 4000, y: 60 + r() * 260, s: 0.6 + r() * 0.9, sp: 4 + r() * 8 });
  const cloudImg = makeCloud(key === 'canyon' ? [150, 92, 96] : [120, 140, 140], key === 'canyon' ? [70, 40, 52] : [52, 68, 72]);
  return { layers, clouds, cloudImg, key };
}
function makeCloud(top, bottom) {
  const c = document.createElement('canvas'); c.width = 260; c.height = 110; const x = c.getContext('2d');
  x.fillStyle = gradV(x, 20, 100, [rgb(top), rgb(bottom)]);
  for (const [cx, cy, r] of [[60, 70, 32], [100, 52, 40], [150, 58, 36], [195, 72, 28], [125, 78, 34]]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
  x.fillRect(40, 70, 180, 30);
  x.globalCompositeOperation = 'destination-in'; x.fillStyle = gradV(x, 0, 110, ['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']); x.fillRect(0, 0, 260, 110);
  return c;
}
function drawBackdrop(cw, ch, s, oy) {
  const st = T.st, bd = T.bd, t = S.time, cam = S.cam;
  // 空
  const sg = ctx.createLinearGradient(0, 0, 0, ch);
  sg.addColorStop(0, st.sky[0]); sg.addColorStop(0.65, st.sky[1]); sg.addColorStop(1, st.sky[2] || st.sky[1]);
  ctx.fillStyle = sg; ctx.fillRect(0, 0, cw, ch);
  const waterY = oy + WATER * s;
  // 太陽と光
  const sunX = cw * 0.7 - cam.x * s * 0.03, sunY = Math.min(ch * 0.3, waterY - 330 * s);
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 260 * Math.max(0.6, s));
  glow.addColorStop(0, st.sunGlow + '0.75)'); glow.addColorStop(0.3, st.sunGlow + '0.25)'); glow.addColorStop(1, st.sunGlow + '0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = st.sun; circ(ctx, sunX, sunY, 46 * Math.max(0.6, s));
  if (bd.key === 'jungle') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = 0.025 + 0.015 * Math.sin(t * 0.4 + i);
      ctx.fillStyle = `rgba(255,255,230,${a})`;
      const x0 = sunX - 200 + i * 120;
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + 60, 0); ctx.lineTo(x0 - 160 + i * 40, ch); ctx.lineTo(x0 - 300 + i * 40, ch); ctx.fill();
    }
    ctx.restore();
  }
  // 雲
  for (const cl of bd.clouds) {
    const k = s * 0.55 * cl.s, span = 4000;
    let wx = ((cl.x + t * cl.sp) % span + span) % span - span / 2;
    const sx = cw / 2 + (wx - cam.x * 0.08) * s * 0.5, sy = waterY - (900 - cl.y) * s * 0.55 - 80;
    if (sx < -300 || sx > cw + 300) continue;
    ctx.globalAlpha = 0.9; ctx.drawImage(bd.cloudImg, sx - 130 * k, sy - 55 * k, 260 * k, 110 * k); ctx.globalAlpha = 1;
  }
  // 遠景の層
  for (const L of bd.layers) {
    const k = s * (0.55 + 0.45 * L.f) * 1.05, w = BG_W * k, h = L.cv.height * k;
    const base = ch / 2 + (WATER - cam.y) * s * (0.25 + 0.75 * L.f) - L.lift * k + 6;
    let x0 = -((cam.x * s * L.f) % w); if (x0 > 0) x0 -= w;
    for (let x = x0; x < cw; x += w) ctx.drawImage(L.cv, x, base - h, w, h);
    if (L.fill && base < ch) { ctx.fillStyle = L.fill; ctx.fillRect(0, base - 1, cw, ch - base + 1); }
    if (L.smokes) {
      for (const sm of L.smokes) for (let i = 0; i < 5; i++) {
        const age = (t * 0.25 + i / 5 + sm.x * 0.001) % 1;
        for (let rep = -1; rep <= 1; rep++) {
          const px = x0 + (sm.x + rep * BG_W) * k + age * 50 * k, py = base - h + (sm.y - age * 120) * k;
          if (px < -50 || px > cw + 50) continue;
          ctx.fillStyle = L.smokeCol + (0.35 * (1 - age)) + ')'; circ(ctx, px, py, (6 + age * 22) * k);
        }
      }
    }
    if (L.falls) {
      for (const fa of L.falls) for (let rep = -1; rep <= 2; rep++) {
        const px = x0 + (fa.x + rep * BG_W) * k, py = base - h + fa.y * k;
        if (px < -40 || px > cw + 40) continue;
        ctx.fillStyle = 'rgba(160,190,196,.4)'; ctx.fillRect(px - 3 * k, py, 6 * k, fa.h * k);
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        for (let j = 0; j < 4; j++) { const yy = ((t * 120 + j * 40) % fa.h); ctx.fillRect(px - 2 * k, py + yy * k, 4 * k, 10 * k); }
      }
    }
  }
  // 地平の霞
  const hz = ctx.createLinearGradient(0, waterY - 260 * s, 0, waterY);
  hz.addColorStop(0, st.haze + '0)'); hz.addColorStop(1, st.haze + '0.55)');
  ctx.fillStyle = hz; ctx.fillRect(0, waterY - 260 * s, cw, 260 * s + 2);
  // 鳥
  if (bd.key === 'jungle') {
    ctx.strokeStyle = 'rgba(40,70,60,.7)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const bx = ((t * (30 + i * 7) + i * 500) % (cw + 200)) - 100, by = ch * 0.18 + i * 26 + Math.sin(t * 2 + i) * 8, w = Math.sin(t * 9 + i) * 4;
      ctx.beginPath(); ctx.moveTo(bx - 6, by - w); ctx.lineTo(bx, by); ctx.lineTo(bx + 6, by - w); ctx.stroke();
    }
  }
}
// 画面の前を漂う粒（砂ぼこり・光の粒）
function drawMotes(cw, ch) {
  const t = S.time, jungle = T.bd.key === 'jungle';
  ctx.save(); if (jungle) ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const seed = i * 97.13;
    const x = ((Math.sin(seed) * 0.5 + 0.5) * cw + t * (jungle ? 8 : 26) * (0.5 + (i % 3) * 0.3) - S.cam.x * 0.15) % (cw + 40);
    const y = ((Math.cos(seed * 1.7) * 0.5 + 0.5) * ch + Math.sin(t * 0.8 + i) * 14 + (jungle ? -t * 6 : 0)) % ch;
    const px = x < 0 ? x + cw + 40 : x, py = y < 0 ? y + ch : y;
    const a = jungle ? 0.35 + 0.35 * Math.sin(t * 3 + i) : 0.25;
    ctx.fillStyle = jungle ? `rgba(255,250,190,${a})` : `rgba(255,230,190,${a})`;
    circ(ctx, px, py, jungle ? 1.6 : 1.2 + (i % 3) * 0.6);
  }
  ctx.restore();
}
function drawWater(c, x0, x1, t) {
  const st = T.st;
  const surf = x => WATER + Math.sin(x * 0.018 + t * 1.6) * 4 + Math.sin(x * 0.041 - t * 2.3) * 2;
  c.fillStyle = gradV(c, WATER - 6, WATER + 220, [st.water[0], st.water[1]]);
  c.globalAlpha = 0.93;
  c.beginPath(); c.moveTo(x0, H + 800);
  for (let x = x0; x <= x1 + 24; x += 24) c.lineTo(x, surf(x));
  c.lineTo(x1 + 24, H + 800); c.fill(); c.globalAlpha = 1;
  c.strokeStyle = 'rgba(200,220,225,.35)'; c.lineWidth = 2.5; c.beginPath();
  for (let x = x0; x <= x1 + 24; x += 24) { const y = surf(x); x === x0 ? c.moveTo(x, y) : c.lineTo(x, y); }
  c.stroke();
  // きらめき
  c.fillStyle = 'rgba(255,255,255,.55)';
  for (let x = Math.floor(x0 / 70) * 70; x < x1; x += 70) {
    const h = ((x * 2654435761) >>> 0) % 1000 / 1000, ph = (t * 0.7 + h) % 1;
    if (ph > 0.5) continue;
    const y = WATER + 14 + h * 60, w = 10 + h * 16;
    c.globalAlpha = Math.sin(ph * Math.PI * 2) * 0.6; c.fillRect(x + h * 40, y, w, 1.6);
  }
  c.globalAlpha = 1;
}

// ---- ロボの絵 ----------------------------------------------------------
const OL = '#161B21';
function gradV(c, y0, y1, stops) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  return g;
}
function gradH(c, x0, x1, stops) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  return g;
}
function fillStroke(c, fill, lw = 1.5) { c.fillStyle = fill; c.fill(); c.strokeStyle = OL; c.lineWidth = lw; c.stroke(); }

// 表情を決める。強いものから順に見る
function moodOf(b, portrait) {
  if (portrait) return b.mood || 'idle';
  if (b.hurtT > 0) return 'hurt';
  if (!b.grounded && !b.selfJump && hyp(b.vx, b.vy) > 160) return 'scared';
  if (b.moodT > 0 && b.mood) return b.mood;
  if (b.fireT > 0) return 'shout';
  if (S.active === b && S.phase === 'turn' && b.power > 0.02) return b.power > 0.8 ? 'strain' : 'focus';
  if (b.danger > 0) return 'scared';
  if (b.poison > 0) return 'sick';
  if (b.hp < b.maxHp * 0.3) return 'worried';
  if (S.active === b && (S.phase === 'turn' || S.phase === 'banner')) return 'ready';
  return 'idle';
}
function setMood(b, m, t) { if (!b) return; b.mood = m; b.moodT = t; }

function drawFace(c, b, cx, cy, sw, sh, t, mood) {
  const eye = b.eye, k = Math.min(1, sh / 15);
  const lx = Math.cos(b.aim) * 1.4 * k, ly = Math.sin(b.aim) * 1.1 * k;
  const ex = 3.6 * k, ey = cy - 1.2 * k;
  c.save();
  // 画面のにじみ
  c.fillStyle = eye; c.globalAlpha = 0.12; ell(c, cx, cy, sw * 0.42, sh * 0.38); c.globalAlpha = 1;
  c.strokeStyle = eye; c.fillStyle = eye; c.lineCap = 'round'; c.lineJoin = 'round';
  const glowEll = (x, y, rx, ry) => { c.globalAlpha = 0.3; ell(c, x, y, rx * 1.7, ry * 1.5); c.globalAlpha = 1; ell(c, x, y, rx, ry); };
  const line = (pts, w = 1.3) => { c.lineWidth = w * k; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); };
  const L = cx - ex, Rr = cx + ex;
  const blink = b.blink < 0 && !b.portrait;
  switch (mood) {
    case 'hurt':
      for (const x of [L, Rr]) { line([[x - 1.8 * k, ey - 1.8 * k], [x + 1.8 * k, ey + 1.8 * k]], 1.5); line([[x + 1.8 * k, ey - 1.8 * k], [x - 1.8 * k, ey + 1.8 * k]], 1.5); }
      line([[cx - 3 * k, cy + 4.6 * k], [cx - 1.5 * k, cy + 3.6 * k], [cx, cy + 4.6 * k], [cx + 1.5 * k, cy + 3.6 * k], [cx + 3 * k, cy + 4.6 * k]], 1.1);
      break;
    case 'scared':
      for (const x of [L, Rr]) { c.lineWidth = 1.2 * k; c.beginPath(); c.arc(x, ey, 2.4 * k, 0, 7); c.stroke(); circ(c, x + lx * 0.4, ey + ly * 0.4, 0.9 * k); }
      glowEll(cx, cy + 4.4 * k, 1.6 * k, 1.9 * k);
      break;
    case 'happy':
      for (const x of [L, Rr]) { c.lineWidth = 1.5 * k; c.beginPath(); c.arc(x, ey + 1 * k, 2 * k, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      c.beginPath(); c.moveTo(cx - 3.4 * k, cy + 3 * k); c.quadraticCurveTo(cx, cy + 7.4 * k, cx + 3.4 * k, cy + 3 * k); c.closePath(); c.fill();
      break;
    case 'smug':
      line([[L - 2 * k, ey], [L + 2 * k, ey]], 1.6); line([[Rr - 2 * k, ey], [Rr + 2 * k, ey]], 1.6);
      line([[L - 2.2 * k, ey - 2.6 * k], [L + 1.8 * k, ey - 1.8 * k]], 1.1); line([[Rr - 1.8 * k, ey - 1.8 * k], [Rr + 2.2 * k, ey - 2.6 * k]], 1.1);
      c.lineWidth = 1.3 * k; c.beginPath(); c.moveTo(cx - 2.6 * k, cy + 4 * k); c.quadraticCurveTo(cx + 0.5 * k, cy + 5.4 * k, cx + 3.2 * k, cy + 3 * k); c.stroke();
      break;
    case 'focus': case 'ready':
      glowEll(L + lx, ey + ly + 0.3 * k, 1.8 * k, (blink ? 0.3 : 2.1) * k); glowEll(Rr + lx, ey + ly + 0.3 * k, 1.8 * k, (blink ? 0.3 : 2.1) * k);
      line([[L - 2.2 * k, ey - 3.4 * k], [L + 2 * k, ey - 2.4 * k]], 1.2); line([[Rr - 2 * k, ey - 2.4 * k], [Rr + 2.2 * k, ey - 3.4 * k]], 1.2);
      line([[cx - 2.4 * k, cy + 4.2 * k], [cx + 2.4 * k, cy + 4.2 * k]], 1.2);
      break;
    case 'strain':
      line([[L - 2 * k, ey - 1 * k], [L + 1.8 * k, ey + 0.6 * k], [L - 2 * k, ey + 1.8 * k]], 1.4);
      line([[Rr + 2 * k, ey - 1 * k], [Rr - 1.8 * k, ey + 0.6 * k], [Rr + 2 * k, ey + 1.8 * k]], 1.4);
      c.fillRect(cx - 3 * k, cy + 3.2 * k, 6 * k, 2.4 * k);
      c.fillStyle = '#12201F'; for (let i = -2; i <= 2; i += 2) c.fillRect(cx + i * k - 0.3 * k, cy + 3.2 * k, 0.6 * k, 2.4 * k);
      break;
    case 'shout':
      glowEll(L, ey, 1.6 * k, 2.4 * k); glowEll(Rr, ey, 1.6 * k, 2.4 * k);
      line([[L - 2.2 * k, ey - 3.6 * k], [L + 2 * k, ey - 2.4 * k]], 1.2); line([[Rr - 2 * k, ey - 2.4 * k], [Rr + 2.2 * k, ey - 3.6 * k]], 1.2);
      glowEll(cx, cy + 4.4 * k, 2.6 * k, 1.8 * k);
      break;
    case 'worried':
      glowEll(L + lx * 0.5, ey + 0.4 * k, 1.6 * k, (blink ? 0.3 : 1.9) * k); glowEll(Rr + lx * 0.5, ey + 0.4 * k, 1.6 * k, (blink ? 0.3 : 1.9) * k);
      line([[L - 2 * k, ey - 2.2 * k], [L + 1.8 * k, ey - 3.4 * k]], 1.1); line([[Rr - 1.8 * k, ey - 3.4 * k], [Rr + 2 * k, ey - 2.2 * k]], 1.1);
      c.lineWidth = 1.1 * k; c.beginPath(); c.moveTo(cx - 2.6 * k, cy + 5 * k); c.quadraticCurveTo(cx, cy + 3.2 * k, cx + 2.6 * k, cy + 5 * k); c.stroke();
      break;
    case 'sick':
      for (const x of [L, Rr]) { c.lineWidth = 1 * k; c.beginPath(); for (let a = 0; a < 9; a += 0.4) { const r = a * 0.26 * k; const px = x + Math.cos(a + t * 6) * r, py = ey + Math.sin(a + t * 6) * r; a ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
      line([[cx - 3 * k, cy + 4.4 * k], [cx - 1 * k, cy + 3.6 * k], [cx + 1 * k, cy + 4.6 * k], [cx + 3 * k, cy + 3.8 * k]], 1.1);
      break;
    case 'sad':
      line([[L - 2 * k, ey + 1 * k], [L + 2 * k, ey]], 1.4); line([[Rr - 2 * k, ey], [Rr + 2 * k, ey + 1 * k]], 1.4);
      c.lineWidth = 1.2 * k; c.beginPath(); c.moveTo(cx - 2.6 * k, cy + 5 * k); c.quadraticCurveTo(cx, cy + 3 * k, cx + 2.6 * k, cy + 5 * k); c.stroke();
      c.fillStyle = '#7FD3FF'; ell(c, L - 0.4 * k, ey + 3.6 * k, 0.8 * k, 1.3 * k);
      break;
    default: // idle
      glowEll(L + lx, ey + ly, 1.8 * k, (blink ? 0.3 : 2.3) * k); glowEll(Rr + lx, ey + ly, 1.8 * k, (blink ? 0.3 : 2.3) * k);
      c.lineWidth = 1.1 * k; c.beginPath(); c.moveTo(cx - 2.6 * k, cy + 3.8 * k); c.quadraticCurveTo(cx, cy + 5 * k, cx + 2.6 * k, cy + 3.8 * k); c.stroke();
  }
  c.restore();
  // 汗（不安・力み）
  if ((mood === 'worried' || mood === 'strain' || mood === 'scared') && !b.portrait) {
    const sy = cy - sh * 0.5 - 1 + ((t * 18) % 6);
    c.fillStyle = '#9FE3FF'; c.strokeStyle = OL; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(cx + sw * 0.62, sy - 2.4); c.quadraticCurveTo(cx + sw * 0.62 + 2, sy + 1, cx + sw * 0.62, sy + 1.6); c.quadraticCurveTo(cx + sw * 0.62 - 2, sy + 1, cx + sw * 0.62, sy - 2.4); c.fill(); c.stroke();
  }
}

function drawLegs(c, b, legs, air, ph, t) {
  const l1 = air ? -2.5 : Math.sin(ph) * 2.4, l2 = air ? 1.5 : -Math.sin(ph) * 2.4;
  if (legs === 'roller') {
    c.beginPath(); rr(c, -3, 3.5, 6, 6, 2); fillStroke(c, '#4A535C', 1.3);
    c.beginPath(); c.arc(0, 9.8, 5.4, 0, 7); fillStroke(c, '#22282E', 1.4);
    c.beginPath(); c.arc(0, 9.8, 2.4, 0, 7); c.fillStyle = gradV(c, 7.4, 12.2, ['#C9D0D6', '#7D868F']); c.fill();
    c.strokeStyle = '#9AA3AB'; c.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) { const a = ph + i * 2.09; c.beginPath(); c.moveTo(Math.cos(a) * 2.4, 9.8 + Math.sin(a) * 2.4); c.lineTo(Math.cos(a) * 4.6, 9.8 + Math.sin(a) * 4.6); c.stroke(); }
    return;
  }
  [[-4.6, l1, 0.8], [4.6, l2, 1]].forEach(([lx, lo, shade]) => {
    const lift = Math.min(0, lo);
    if (legs === 'spring') {
      c.strokeStyle = OL; c.lineWidth = 2.6; c.beginPath();
      for (let i = 0; i <= 6; i++) c.lineTo(lx + (i % 2 ? 2.4 : -2.4), 4 + lift + i * 1.25); c.stroke();
      c.strokeStyle = shade < 1 ? '#8D969E' : '#C9D0D6'; c.lineWidth = 1.3; c.beginPath();
      for (let i = 0; i <= 6; i++) c.lineTo(lx + (i % 2 ? 2.4 : -2.4), 4 + lift + i * 1.25); c.stroke();
    } else if (legs === 'jet') {
      c.beginPath(); rr(c, lx - 3, 3.5 + lift, 6, 8, 2); fillStroke(c, gradH(c, lx - 3, lx + 3, ['#6A747E', '#2E353C']), 1.3);
      c.fillStyle = b.color; c.fillRect(lx - 2.3, 6.4 + lift, 4.6, 1.8);
      if (air) {
        const fl = 6 + Math.sin(t * 50 + lx) * 2;
        c.fillStyle = '#FF9330'; c.beginPath(); c.moveTo(lx - 2.6, 12); c.quadraticCurveTo(lx, 12 + fl * 2, lx + 2.6, 12); c.fill();
        c.fillStyle = '#FFE08A'; c.beginPath(); c.moveTo(lx - 1.3, 12); c.quadraticCurveTo(lx, 12 + fl, lx + 1.3, 12); c.fill();
      }
    } else {
      c.beginPath(); rr(c, lx - 2.2, 4 + lift, 4.4, 7, 2); fillStroke(c, shade < 1 ? '#3D454D' : '#525C66', 1.2);
      c.beginPath(); c.arc(lx, 7 + lift, 1.4, 0, 7); c.fillStyle = '#8D969E'; c.fill();
    }
    // ブーツ
    c.beginPath(); rr(c, lx - 3.4, 10.2 + lift, 8.4, 4.3, 2.1);
    fillStroke(c, gradV(c, 10 + lift, 14.5 + lift, [shade < 1 ? '#3A4148' : '#4B545D', '#1E2328']), 1.3);
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(lx - 1.8, 11.3 + lift); c.lineTo(lx + 2.6, 11.3 + lift); c.stroke();
  });
}

function drawBody(c, b, body, t) {
  if (body === 'drum') {
    c.beginPath(); rr(c, -12, -9, 24, 17, 3);
    fillStroke(c, gradH(c, -12, 12, [b.dark, b.color, b.light, b.color, b.dark]), 1.6);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.3;
    for (const y of [-4.5, 3]) { c.beginPath(); c.moveTo(-12, y); c.lineTo(12, y); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '700 5px sans-serif'; c.textAlign = 'center'; c.fillText(String(b.id + 1).padStart(2, '0'), 0, 1);
  } else if (body === 'boiler') {
    c.beginPath(); c.ellipse(0, -1, 12, 9.5, 0, 0, 7);
    const g = c.createRadialGradient(-4, -5, 1, 0, -1, 13); g.addColorStop(0, b.light); g.addColorStop(0.5, b.color); g.addColorStop(1, b.dark);
    fillStroke(c, g, 1.6);
    c.beginPath(); c.arc(-1.5, -1, 4.2, 0, 7); fillStroke(c, '#F4EEDF', 1.2);
    c.strokeStyle = '#E8473A'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1.5, -1); c.lineTo(-1.5 + Math.cos(-2.2 + Math.sin(t * 2) * 0.6) * 3.2, -1 + Math.sin(-2.2 + Math.sin(t * 2) * 0.6) * 3.2); c.stroke();
    c.beginPath(); rr(c, -15, -9, 4.5, 8, 1.5); fillStroke(c, '#5C6670', 1.2);
    if (Math.floor(t * 3) % 2 === 0) { c.fillStyle = 'rgba(255,255,255,.35)'; circ(c, -13, -12 - (t * 20) % 6, 2); }
  } else if (body === 'tank') {
    c.beginPath(); c.moveTo(-13, -8); c.lineTo(13, -8); c.lineTo(11.5, 8); c.lineTo(-11.5, 8); c.closePath();
    fillStroke(c, gradV(c, -8, 8, [b.color, b.dark]), 1.6);
    c.beginPath(); c.moveTo(-9.5, -5.5); c.lineTo(9.5, -5.5); c.lineTo(8, 4); c.lineTo(-8, 4); c.closePath();
    c.fillStyle = gradV(c, -5, 4, [b.light, b.color]); c.fill(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = '#F4EEDF'; for (const [x, y] of [[-10.5, -6], [10.5, -6], [-9.5, 5.6], [9.5, 5.6]]) circ(c, x, y, 0.9);
    c.fillStyle = '#FFC531'; for (let i = -6; i < 6; i += 4) { c.beginPath(); c.moveTo(i, 6); c.lineTo(i + 2, 6); c.lineTo(i + 3.5, 8); c.lineTo(i + 1.5, 8); c.fill(); }
  } else {
    c.beginPath(); rr(c, -10.5, -8, 21, 15.5, 4.5);
    fillStroke(c, gradV(c, -8, 7.5, [b.light, b.color, b.dark]), 1.6);
    c.beginPath(); rr(c, -6.4, -5.2, 9.5, 6.6, 1.8); c.fillStyle = 'rgba(255,255,255,.28)'; c.fill(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = S.tick % 60 < 40 ? '#B8FF8A' : '#4A7A3A'; circ(c, 5.6, -3.4, 1.1);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-10.5, 3, 21, 1.8);
    c.fillStyle = 'rgba(255,248,232,.85)'; for (const [x, y] of [[-8.3, -5.9], [8.3, -5.9], [-8.3, 5.2], [8.3, 5.2]]) circ(c, x, y, 0.75);
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-8.5, -3); c.quadraticCurveTo(-8.5, -6.6, -5, -6.6); c.stroke();
  }
}

// 頭を描いて、顔を描く画面の中心と大きさを返す（反転座標）
function drawHead(c, b, head, t) {
  if (head === 'bulb') {
    c.beginPath(); rr(c, -6.5, -11.5, 13, 5, 1.6); fillStroke(c, gradV(c, -11.5, -6.5, ['#A7B0B8', '#5C6670']), 1.3);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.8; for (const y of [-10, -8.4]) { c.beginPath(); c.moveTo(-6, y); c.lineTo(6, y); c.stroke(); }
    c.beginPath(); c.arc(0, -22, 11.5, 0, 7);
    const g = c.createRadialGradient(-4, -27, 1, 0, -22, 12); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.5, 'rgba(206,232,246,.8)'); g.addColorStop(1, 'rgba(150,190,214,.85)');
    fillStroke(c, g, 1.7);
    c.beginPath(); c.arc(0, -21.5, 8.2, 0, 7); c.fillStyle = gradV(c, -30, -13, ['#24453F', '#0B1716']); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.3; c.beginPath(); c.arc(0, -22, 9.6, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    return { x: 0, y: -21.5, w: 13, h: 13 };
  }
  if (head === 'bucket') {
    c.beginPath(); c.moveTo(-12.5, -8); c.lineTo(12.5, -8); c.lineTo(10.5, -32); c.lineTo(-10.5, -32); c.closePath();
    fillStroke(c, gradH(c, -12, 12, ['#7D868F', '#D4DADF', '#A7B0B8', '#6A737C']), 1.8);
    c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(-11.8, -14.5, 23.6, 2.2); c.fillRect(-10.8, -29, 21.6, 1.6);
    c.fillStyle = '#EEF2F4'; for (const x of [-9, 9]) circ(c, x, -13.4, 0.8);
    c.beginPath(); rr(c, -9.5, -25, 17, 8.5, 2.2); c.fillStyle = gradV(c, -25, -16.5, ['#1C3532', '#0B1716']); c.fill(); c.strokeStyle = OL; c.lineWidth = 1.2; c.stroke();
    return { x: -1, y: -20.8, w: 16, h: 9 };
  }
  if (head === 'turret') {
    c.beginPath(); rr(c, 3, -36.5, 14, 4.4, 1.5); fillStroke(c, gradV(c, -36.5, -32, ['#6A747E', '#2E353C']), 1.3);
    c.beginPath(); rr(c, -13.5, -32, 27, 24, 3.5); fillStroke(c, gradV(c, -32, -8, [b.color, b.dark]), 1.8);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-12, -30.5, 24, 3);
    c.beginPath(); rr(c, -10.5, -25, 20, 10, 2); c.fillStyle = gradV(c, -25, -15, ['#1C3532', '#0B1716']); c.fill(); c.strokeStyle = OL; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#F4EEDF'; for (const [x, y] of [[-11, -10.5], [11, -10.5], [-11, -29], [11, -29]]) circ(c, x, y, 0.85);
    return { x: -0.5, y: -20, w: 19, h: 10 };
  }
  // ブラウン管
  c.beginPath(); rr(c, -13.5, -32.5, 27, 24.5, 5.5); fillStroke(c, gradV(c, -32.5, -8, ['#FFFBF0', '#E9E1CF', '#C4B9A2']), 1.8);
  c.beginPath(); rr(c, -11.3, -30, 19.2, 19.4, 4); c.fillStyle = '#2A3036'; c.fill();
  c.beginPath(); rr(c, -10.3, -29, 17.2, 17.4, 3.4);
  const g = c.createRadialGradient(-1.7, -21.5, 1, -1.7, -20.3, 12); g.addColorStop(0, '#2B514A'); g.addColorStop(1, '#0A1514');
  c.fillStyle = g; c.fill();
  // つまみとスピーカー
  for (const y of [-25.5, -19.5]) { c.beginPath(); c.arc(10.3, y, 1.8, 0, 7); fillStroke(c, gradV(c, y - 2, y + 2, ['#B9C1C8', '#5C6670']), 1); }
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.8; for (let y = -15; y <= -11.5; y += 1.6) { c.beginPath(); c.moveTo(8.8, y); c.lineTo(11.8, y); c.stroke(); }
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-11.5, -26); c.quadraticCurveTo(-11.5, -31, -6.5, -31); c.stroke();
  return { x: -1.7, y: -20.3, w: 16, h: 16 };
}
function drawScreenGlare(c, sc) {
  c.save(); c.globalAlpha = 0.13; c.fillStyle = '#FFFFFF';
  c.beginPath(); c.moveTo(sc.x - sc.w * 0.48, sc.y - sc.h * 0.48); c.lineTo(sc.x + sc.w * 0.05, sc.y - sc.h * 0.48); c.lineTo(sc.x - sc.w * 0.48, sc.y + sc.h * 0.1); c.closePath(); c.fill();
  c.globalAlpha = 0.07; for (let y = sc.y - sc.h / 2 + 1; y < sc.y + sc.h / 2; y += 2.2) c.fillRect(sc.x - sc.w / 2, y, sc.w, 0.8);
  c.restore();
}

function drawBot(c, b, t, portrait) {
  if (b.doc) { drawDoc(c, b, t, portrait); return; }
  const head = PART[b.eq.head].shape, body = PART[b.eq.body].shape, legs = PART[b.eq.legs].shape;
  c.save(); c.translate(b.x, b.y);
  if (!portrait) {
    if (b.grounded) { c.fillStyle = 'rgba(0,0,0,.22)'; ell(c, 0, 14.6, 12.5, 2.6); }
    c.translate(0, 14); c.scale(1.22, 1.22); c.translate(0, -14);
    if (b.hurtT > 0) c.translate(Math.sin(t * 70) * 1.3, 0);
  }
  const f = b.facing, air = !b.grounded && !portrait, ph = b.walk;
  c.lineJoin = 'round'; c.lineCap = 'round';
  // 着地や被弾で少しつぶれる
  const squash = !portrait && b.hurtT > 0.3 ? 0.06 : 0;
  if (squash) { c.translate(0, 14); c.scale(1 + squash, 1 - squash); c.translate(0, -14); }
  if (b.chuteOpen && !b.grounded && !portrait) {
    c.strokeStyle = 'rgba(22,27,33,.7)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(-10, -2); c.lineTo(-20, -48); c.moveTo(10, -2); c.lineTo(20, -48); c.moveTo(0, -30); c.lineTo(0, -52); c.stroke();
    c.beginPath(); c.moveTo(-26, -46); c.quadraticCurveTo(0, -78, 26, -46); c.quadraticCurveTo(13, -52, 0, -48); c.quadraticCurveTo(-13, -52, -26, -46); c.closePath();
    fillStroke(c, gradV(c, -70, -46, [b.light, b.color]), 1.4);
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-9, -62); c.lineTo(-6, -48); c.moveTo(9, -62); c.lineTo(6, -48); c.stroke();
  }
  c.save(); c.scale(f, 1);
  if (b.jet && !portrait) {
    c.beginPath(); rr(c, -17, -9, 7, 15, 2.5); fillStroke(c, gradH(c, -17, -10, ['#9AA3AB', '#4A535C']), 1.3);
    c.fillStyle = '#E8473A'; c.fillRect(-16.5, -6, 6, 2);
    if (b.jetOn) {
      const fl = 8 + Math.sin(t * 60) * 3;
      c.fillStyle = '#FF9330'; c.beginPath(); c.moveTo(-16.5, 6); c.quadraticCurveTo(-13.5, 6 + fl * 2, -10.5, 6); c.fill();
      c.fillStyle = '#FFE08A'; c.beginPath(); c.moveTo(-15, 6); c.quadraticCurveTo(-13.5, 6 + fl, -12, 6); c.fill();
    }
  }
  drawLegs(c, b, legs, air, ph, t);
  drawBody(c, b, body, t);
  drawHat(c, b, t, head);
  const sc = drawHead(c, b, head, t);
  c.restore();
  const mood = moodOf(b, portrait);
  const scx = sc.x * f;
  b.portrait = portrait;
  drawFace(c, b, scx, sc.y, sc.w, sc.h, t, mood);
  drawScreenGlare(c, { ...sc, x: scx });
  // 腕と武器
  c.save(); c.translate(f * -1.5, -1.5);
  let a = b.aim;
  if (b.swingT > 0) a += f * (-1.4 + (1 - b.swingT / 0.3) * 2.2);
  const recoil = b.fireT > 0 ? -2.2 * (b.fireT / 0.25) : 0;
  c.rotate(a); if (Math.cos(a) < 0) c.scale(1, -1);
  c.translate(recoil, 0);
  drawGun(c, b.weapon, b);
  c.restore();
  c.restore();
}
function drawHat(c, b, t, head) {
  const top = head === 'bulb' ? -33 : head === 'bucket' ? -32 : -32.5;
  if (b.hat === 'ant') {
    c.strokeStyle = OL; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-3, top); c.lineTo(-7, top - 9); c.moveTo(3, top); c.lineTo(6.5, top - 8); c.stroke();
    for (const [x, y] of [[-7, top - 9], [6.5, top - 8]]) { c.beginPath(); c.arc(x, y, 2.4, 0, 7); fillStroke(c, b.color, 1.2); c.fillStyle = 'rgba(255,255,255,.7)'; circ(c, x - 0.7, y - 0.8, 0.8); }
  } else if (b.hat === 'cone') {
    c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(8, top + 1); c.lineTo(0.8, top - 15); c.lineTo(-0.8, top - 15); c.closePath();
    fillStroke(c, gradH(c, -8, 8, ['#E2661C', '#FF9A3D', '#D45A16']), 1.5);
    c.fillStyle = '#FFF4E6'; c.beginPath(); c.moveTo(-4.6, top - 5); c.lineTo(4.6, top - 5); c.lineTo(3.2, top - 8.4); c.lineTo(-3.2, top - 8.4); c.closePath(); c.fill();
    c.beginPath(); rr(c, -10.5, top - 1, 21, 3.4, 1.2); fillStroke(c, '#B9531A', 1.3);
  } else if (b.hat === 'prop') {
    c.beginPath(); c.arc(0, top + 1.5, 8.5, Math.PI, 0); c.closePath(); fillStroke(c, gradV(c, top - 7, top + 1.5, [b.light, b.color]), 1.5);
    c.fillStyle = '#FFC531'; c.beginPath(); c.moveTo(-1.5, top - 6.5); c.lineTo(1.5, top - 6.5); c.lineTo(1, top + 1.5); c.lineTo(-1, top + 1.5); c.fill();
    c.strokeStyle = OL; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, top - 7); c.lineTo(0, top - 11); c.stroke();
    const w = Math.cos(t * 22) * 11;
    c.beginPath(); c.ellipse(0, top - 11.5, Math.max(0.5, Math.abs(w)), 1.8, 0, 0, 7); fillStroke(c, '#E8473A', 1.1);
  } else if (b.hat === 'bolt') {
    c.beginPath(); rr(c, -2.2, top - 5, 4.4, 6, 1); fillStroke(c, '#8D969E', 1.2);
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.lineTo(Math.cos(a) * 7, top - 9 + Math.sin(a) * 7); }
    c.closePath(); fillStroke(c, gradV(c, top - 16, top - 2, ['#E3E8EC', '#8D969E']), 1.5);
    c.beginPath(); c.arc(0, top - 9, 2.6, 0, 7); fillStroke(c, '#3A4048', 1);
  }
}
function drawGun(c, k, b) {
  // 肩と腕
  c.beginPath(); c.arc(0, 0, 3.4, 0, 7); fillStroke(c, '#4A535C', 1.3);
  c.beginPath(); rr(c, 0, -2.1, 9, 4.2, 2); fillStroke(c, '#525C66', 1.2);
  if (k === 'hammer') {
    c.beginPath(); rr(c, 5, -1.6, 19, 3.2, 1.5); fillStroke(c, gradV(c, -1.6, 1.6, ['#B07A48', '#7A4E2A']), 1.1);
    c.beginPath(); rr(c, 19.5, -8, 10, 16, 2.4); fillStroke(c, gradH(c, 19.5, 29.5, ['#7D868F', '#E3E8EC', '#9AA3AB']), 1.5);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(19.5, -2, 10, 1.2);
  } else if (k === 'revolver') {
    c.beginPath(); rr(c, 13, -2.6, 11, 3.4, 1); fillStroke(c, gradV(c, -2.6, 0.8, ['#C9D0D6', '#6A737C']), 1.1);
    c.beginPath(); rr(c, 5.5, -3.6, 9.5, 6.4, 1.6); fillStroke(c, gradV(c, -3.6, 2.8, ['#9AA3AB', '#4A535C']), 1.2);
    c.beginPath(); c.arc(10, -0.4, 2.4, 0, 7); fillStroke(c, '#5C6670', 0.9);
    c.beginPath(); rr(c, 6, 1.8, 4.2, 6.5, 1.4); fillStroke(c, gradH(c, 6, 10, ['#8A5A33', '#5E3B1F']), 1.1);
  } else if (k === 'cannon') {
    c.beginPath(); rr(c, 3, -6.6, 20, 13.2, 5.5); fillStroke(c, gradV(c, -6.6, 6.6, ['#5C6670', '#2A2F35', '#1A1E22']), 1.6);
    c.fillStyle = b.color; c.fillRect(8, -6.4, 3, 12.8);
    c.beginPath(); c.ellipse(23, 0, 2, 5.2, 0, 0, 7); c.fillStyle = '#0E1012'; c.fill();
  } else {
    c.beginPath(); rr(c, 3, -4.8, 21.5, 9.6, 3); fillStroke(c, gradV(c, -4.8, 4.8, ['#7D8892', '#46505A', '#2A3036']), 1.5);
    c.fillStyle = b.color; c.fillRect(9, -4.5, 3.6, 9); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 0.8; c.strokeRect(9, -4.5, 3.6, 9);
    c.beginPath(); rr(c, 13.5, -7.2, 5, 2.6, 1); fillStroke(c, '#3A4048', 1);
    c.beginPath(); rr(c, 22, -6, 4.6, 12, 1.6); fillStroke(c, WCOLOR[k] || '#D9DDE1', 1.3);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(5, -3.2); c.lineTo(20, -3.2); c.stroke();
  }
  // 手
  c.beginPath(); c.arc(8.6, 1.4, 2.7, 0, 7); fillStroke(c, b.color, 1.2);
}

function drawTag(c, o, t) {
  const y = o.y - 58 - (o.hat === 'cone' ? 6 : o.hat === 'ant' || o.hat === 'bolt' ? 3 : 0);
  c.textAlign = 'center'; c.font = '700 10px "M PLUS Rounded 1c", sans-serif';
  c.lineWidth = 3; c.strokeStyle = 'rgba(17,24,29,.85)'; c.strokeText(o.name, o.x, y - 6);
  c.fillStyle = '#F4EFE3'; c.fillText(o.name, o.x, y - 6);
  c.fillStyle = 'rgba(17,24,29,.85)'; rr(c, o.x - 16, y - 2, 32, 5, 2); c.fill();
  c.fillStyle = o.hp / o.maxHp < 0.3 ? '#F2453D' : o.color; rr(c, o.x - 15, y - 1, 30 * clamp(o.hp / o.maxHp, 0, 1), 3, 1.5); c.fill();
  if (o.poison > 0) { c.fillStyle = '#C9A8FF'; circ(c, o.x + 20, y + 0.5, 2.5); }
  if (o === S.active && (S.phase === 'banner' || S.phase === 'turn')) {
    const by = y - 20 + Math.sin(t * 6) * 2.5;
    c.fillStyle = '#FFC531'; c.beginPath(); c.moveTo(o.x - 6, by - 6); c.lineTo(o.x + 6, by - 6); c.lineTo(o.x, by + 1); c.closePath(); c.fill();
  }
}
const POWER_COL = ['#3D8BF0', '#35C46A', '#F4D03F', '#FF9330', '#F2453D'];
function drawAim(c, b, t) {
  const w = WP[b.weapon], a = b.aim, ca = Math.cos(a), sa = Math.sin(a), cx = b.x, cy = b.y - 3;
  if (w.move && w.move !== 'hook') return;
  if (w.fixed) {
    const x = cx + ca * w.fixed, y = cy + sa * w.fixed;
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 14, y); c.moveTo(x, y - 14); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 14); c.stroke();
    return;
  }
  if (b.power < 0.02) {
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.setLineDash([4, 5]);
    c.beginPath(); c.moveTo(cx + ca * 22, cy + sa * 22); c.lineTo(cx + ca * 60, cy + sa * 60); c.stroke(); c.setLineDash([]);
    return;
  }
  const L = 34 + b.power * 110, col = POWER_COL[Math.min(4, Math.floor(b.power * 5))];
  const tw = 2 + b.power * 3, hw = 6 + b.power * 3;
  c.save(); c.translate(cx, cy); c.rotate(a);
  c.fillStyle = 'rgba(17,24,29,.55)'; c.beginPath(); c.moveTo(20, -tw - 2); c.lineTo(L - 10, -tw - 2); c.lineTo(L - 10, -hw - 2.5); c.lineTo(L + 6, 0); c.lineTo(L - 10, hw + 2.5); c.lineTo(L - 10, tw + 2); c.lineTo(20, tw + 2); c.closePath(); c.fill();
  c.fillStyle = col; c.beginPath(); c.moveTo(20, -tw); c.lineTo(L - 10, -tw); c.lineTo(L - 10, -hw); c.lineTo(L + 3, 0); c.lineTo(L - 10, hw); c.lineTo(L - 10, tw); c.lineTo(20, tw); c.closePath(); c.fill();
  // 最大の目盛り（どこまで引けば最大かが色に頼らず分かる）
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.setLineDash([3, 4]);
  c.beginPath(); c.moveTo(L + 6, 0); c.lineTo(150, 0); c.stroke(); c.setLineDash([]);
  c.beginPath(); c.moveTo(150, -6); c.lineTo(150, 6); c.stroke();
  c.restore();
}
function drawProj(c, p, t) {
  c.save(); c.translate(p.x, p.y);
  const k = p.k;
  if (k === 'rocket') {
    c.rotate(Math.atan2(p.vy, p.vx));
    c.fillStyle = '#D9DDE1'; rr(c, -8, -3, 14, 6, 3); c.fill();
    c.fillStyle = '#E8473A'; c.beginPath(); c.moveTo(5, -3); c.lineTo(10, 0); c.lineTo(5, 3); c.fill();
    c.fillStyle = '#3A4048'; c.beginPath(); c.moveTo(-8, -3); c.lineTo(-11, -6); c.lineTo(-5, -3); c.moveTo(-8, 3); c.lineTo(-11, 6); c.lineTo(-5, 3); c.fill();
    c.fillStyle = '#FFB347'; c.beginPath(); c.moveTo(-8, -2); c.lineTo(-14 - Math.random() * 5, 0); c.lineTo(-8, 2); c.fill();
  } else if (k === 'mine') {
    c.fillStyle = '#3A4048'; c.beginPath(); c.arc(0, 2, 7, Math.PI, 0); c.fill();
    c.fillStyle = (p.trig > 0 ? S.tick % 8 < 4 : S.tick % 40 < 8) ? '#FF4040' : '#5A1A1A'; circ(c, 0, -3, 2);
  } else if (k === 'fire' || k === 'gas') {
    c.rotate(p.t * 9);
    c.fillStyle = k === 'fire' ? '#7BA05B' : '#6A4BB0'; rr(c, -3.5, -6, 7, 11, 2); c.fill();
    c.fillStyle = k === 'fire' ? '#FF8A2A' : '#C9A8FF'; c.fillRect(-1.5, -9, 3, 4);
  } else if (k === 'tele') {
    c.fillStyle = 'rgba(79,227,240,.35)'; circ(c, 0, 0, 9);
    c.fillStyle = '#4FE3F0'; circ(c, 0, 0, 4.5); c.fillStyle = '#FFFFFF'; circ(c, -1.2, -1.2, 1.6);
  } else {
    const r = k === 'cannon' ? 7 : 5;
    c.fillStyle = WCOLOR[k]; circ(c, 0, 0, r);
    c.fillStyle = 'rgba(255,255,255,.45)'; circ(c, -r * 0.35, -r * 0.35, r * 0.35);
    if (k === 'grenade') { c.fillStyle = '#3A4048'; c.fillRect(-1.5, -r - 3, 3, 3); }
  }
  c.restore();
  if (p.fuseOn && p.fuse > 0 && (k === 'grenade' || k === 'bouncer' || k === 'cannon')) {
    c.font = '11px "Dela Gothic One", sans-serif'; c.textAlign = 'center';
    c.lineWidth = 3; c.strokeStyle = '#151B20'; c.strokeText(Math.ceil(p.fuse), p.x, p.y - 12);
    c.fillStyle = '#FFFFFF'; c.fillText(Math.ceil(p.fuse), p.x, p.y - 12);
  }
}
function drawCrate(c, cr) {
  c.save(); c.translate(cr.x, cr.y);
  if (!cr.landed) {
    c.strokeStyle = 'rgba(30,36,43,.7)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-9, -8); c.lineTo(-14, -30); c.moveTo(9, -8); c.lineTo(14, -30); c.stroke();
    c.fillStyle = '#F4EFE3'; c.beginPath(); c.arc(0, -30, 16, Math.PI, 0); c.fill();
    c.fillStyle = '#E8473A'; c.beginPath(); c.arc(0, -30, 16, Math.PI * 1.33, Math.PI * 1.66); c.lineTo(0, -30); c.fill();
  }
  c.fillStyle = '#B9803C'; rr(c, -10, -9, 20, 19, 2); c.fill();
  c.strokeStyle = '#6E4620'; c.lineWidth = 2; c.strokeRect(-10, -9, 20, 19);
  c.beginPath(); c.moveTo(-10, -9); c.lineTo(10, 10); c.stroke();
  c.fillStyle = cr.kind === 'heal' ? '#7BE38B' : cr.kind === 'ammo' ? '#FFE08A' : '#FFC531';
  if (cr.kind === 'heal') { c.fillRect(-2, -6, 4, 12); c.fillRect(-6, -2, 12, 4); } else circ(c, 0, 0, 4);
  c.restore();
}
function drawParts(c) {
  for (const p of S.parts) {
    const k = clamp(p.life / (p.max || 1), 0, 1);
    if (p.t === 'smoke') { const k2 = Math.min(1, p.life); c.fillStyle = p.warm ? `rgba(${120 + 60 * k2 | 0},${104 + 30 * k2 | 0},92,${(p.a || 0.4) * k2})` : `rgba(90,84,80,${(p.a || 0.4) * k2})`; circ(c, p.x, p.y, p.r); }
    else if (p.t === 'debris') { c.fillStyle = p.c; c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  }
  c.globalCompositeOperation = 'lighter';
  for (const p of S.parts) {
    const k = clamp(p.life / (p.max || 0.3), 0, 1);
    if (p.t === 'flash') {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255,250,220,${k})`); g.addColorStop(0.4, `rgba(255,190,80,${k * 0.8})`); g.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = g; circ(c, p.x, p.y, p.r);
    } else if (p.t === 'ray') {
      c.strokeStyle = `rgba(255,170,60,${k})`; c.lineWidth = 4 * k + 1;
      const L0 = p.L * (1 - k) * 0.5, L1 = p.L * (1.1 - k * 0.3);
      c.beginPath(); c.moveTo(p.x + Math.cos(p.a) * L0, p.y + Math.sin(p.a) * L0); c.lineTo(p.x + Math.cos(p.a) * L1, p.y + Math.sin(p.a) * L1); c.stroke();
    } else if (p.t === 'ring') {
      c.strokeStyle = `rgba(255,230,180,${k * 0.8})`; c.lineWidth = 1 + 5 * k; c.beginPath(); c.arc(p.x, p.y, p.r + (1 - k) * p.vr * 0.3, 0, 7); c.stroke();
    } else if (p.t === 'spark') {
      c.strokeStyle = p.c; c.globalAlpha = clamp(p.life * 4, 0, 1); c.lineWidth = 2;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke(); c.globalAlpha = 1;
    } else if (p.t === 'tracer') {
      c.strokeStyle = 'rgba(255,240,190,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x2, p.y2); c.stroke();
    }
  }
  c.globalCompositeOperation = 'source-over';
}

// 単体のロボを小さなキャンバスに描く（カード・ガレージ・表彰台）
function paintPortrait(canvas, bot, scale, cy) {
  const c = canvas.getContext('2d');
  const d = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
  c.setTransform(d * scale, 0, 0, d * scale, d * w / 2, d * h * cy);
  const b = { ...bot, x: 0, y: 0, hurtT: 0, fireT: 0, swingT: 0, walk: 0, blink: 1, grounded: true, aim: bot.facing > 0 ? -0.35 : Math.PI + 0.35 };
  drawBot(c, b, 0, true);
}

// ---------------------------------------------------------------- 音（すべて WebAudio で合成。音源ファイルなし）
const AU = { ctx: null, muted: false, noise: null, last: {}, master: null, sfxBus: null, musBus: null, verb: null, dist: null, song: null, timer: 0, step: 0, nextT: 0 };
try { AU.muted = localStorage.getItem('boombolts.mute') === '1'; } catch (e) {}
function auInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = AU.ctx = new C();
    const n = c.sampleRate, buf = c.createBuffer(1, n * 2, n), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = buf;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    AU.master = c.createGain(); AU.master.gain.value = AU.muted ? 0 : 0.9;
    AU.master.connect(comp).connect(c.destination);
    AU.sfxBus = c.createGain(); AU.sfxBus.gain.value = 0.95; AU.sfxBus.connect(AU.master);
    AU.musBus = c.createGain(); AU.musBus.gain.value = 0.32; AU.musBus.connect(AU.master);
    // 残響（自前のインパルス）
    const len = Math.floor(n * 1.6), ir = c.createBuffer(2, len, n);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    AU.verb = c.createConvolver(); AU.verb.buffer = ir;
    const vg = c.createGain(); vg.gain.value = 0.35; AU.verb.connect(vg).connect(AU.master);
    // 歪み（爆発の芯）
    AU.dist = c.createWaveShaper();
    const cur = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cur[i] = Math.tanh(x * 3.2); }
    AU.dist.curve = cur; AU.dist.connect(AU.sfxBus);
    AU.timer = setInterval(musicTick, 25);
    if (AU.want) playSong(AU.want, true);
  } catch (e) { AU.ctx = null; }
}
function env(g, t, a, peak, dur, curve = 'exp') {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  else g.gain.linearRampToValueAtTime(0, t + a + dur);
}
function nz(t, dur, { type = 'lowpass', f0 = 1000, f1 = f0, q = 0.8, vol = 0.3, a = 0.002, out = AU.sfxBus, verb = 0, rate = 1 } = {}) {
  const c = AU.ctx, src = c.createBufferSource(); src.buffer = AU.noise; src.playbackRate.value = rate;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain(); env(g, t, a, vol, dur);
  src.connect(fl).connect(g).connect(out);
  if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s).connect(AU.verb); }
  src.start(t, Math.random() * 0.8); src.stop(t + a + dur + 0.05);
}
function tn(t, dur, { type = 'sine', f0 = 440, f1 = f0, vol = 0.2, a = 0.004, out = AU.sfxBus, verb = 0, vib = 0, curve = 'exp', detune = 0 } = {}) {
  const c = AU.ctx, o = c.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + dur);
  if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 7; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + a + dur + 0.05); }
  const g = c.createGain(); env(g, t, a, vol, dur, curve);
  o.connect(g).connect(out);
  if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s).connect(AU.verb); }
  o.start(t); o.stop(t + a + dur + 0.05);
}
const rnd = (a, b) => a + Math.random() * (b - a);
function sfx(name, v = 1) {
  if (!AU.ctx || AU.muted || S.silent) return;
  const now = performance.now();
  if (AU.last[name] && now - AU.last[name] < 35) return;
  AU.last[name] = now;
  const t = AU.ctx.currentTime + 0.005;
  try {
    switch (name) {
      case 'boom': {
        const s = Math.min(1.4, v);
        tn(t, 0.5 + s * 0.3, { f0: 140, f1: 32, vol: 0.9 * s + 0.2, a: 0.002, out: AU.dist });
        nz(t, 0.18, { type: 'bandpass', f0: 2600, f1: 900, q: 0.6, vol: 0.7 * s, out: AU.dist });
        nz(t + 0.02, 0.9 + s * 0.6, { f0: 1800, f1: 70, vol: 0.55 * s + 0.15, verb: 0.6 });
        for (let i = 0; i < 6; i++) nz(t + 0.08 + Math.random() * 0.5, 0.03, { type: 'highpass', f0: 3000, f1: 2000, vol: 0.09 * s });
        break;
      }
      case 'launch': nz(t, 0.08, { type: 'bandpass', f0: 600, f1: 1200, q: 2, vol: 0.35 }); nz(t + 0.04, 0.5, { type: 'bandpass', f0: 400, f1: 2400, q: 1.4, vol: 0.22 }); tn(t, 0.12, { type: 'square', f0: 120, f1: 60, vol: 0.12 }); break;
      case 'throw': nz(t, 0.16, { type: 'bandpass', f0: 700, f1: 2200, q: 2.2, vol: 0.16 }); tn(t, 0.06, { type: 'triangle', f0: 300, f1: 200, vol: 0.08 }); break;
      case 'shot': nz(t, 0.05, { type: 'highpass', f0: 6000, f1: 1500, vol: 0.45 }); tn(t, 0.09, { f0: 180, f1: 60, vol: 0.35, out: AU.dist }); nz(t + 0.03, 0.25, { f0: 3000, f1: 400, vol: 0.12, verb: 0.5 }); break;
      case 'jump': tn(t, 0.16, { type: 'square', f0: 260, f1: 620, vol: 0.06 }); tn(t, 0.18, { type: 'sine', f0: 200, f1: 520, vol: 0.12, vib: 18 }); break;
      case 'land': tn(t, 0.08, { f0: 110, f1: 60, vol: 0.18 }); nz(t, 0.06, { f0: 800, f1: 200, vol: 0.08 }); break;
      case 'step': tn(t, 0.03, { type: 'square', f0: rnd(900, 1200), f1: 700, vol: 0.015 }); break;
      case 'bounce': tn(t, 0.12, { f0: rnd(1500, 1800), vol: 0.06 }); tn(t, 0.12, { f0: rnd(2300, 2500), vol: 0.04 }); tn(t, 0.04, { f0: 200, f1: 120, vol: 0.06 }); break;
      case 'splash': nz(t, 0.7, { type: 'bandpass', f0: 2500, f1: 300, q: 0.7, vol: 0.35, verb: 0.3 }); for (let i = 0; i < 5; i++) tn(t + 0.1 + i * rnd(0.05, 0.12), 0.06, { f0: rnd(500, 900), f1: rnd(1200, 1800), vol: 0.05 }); break;
      case 'beep': tn(t, 0.07, { type: 'square', f0: 1760, vol: 0.06 }); tn(t + 0.18, 0.07, { type: 'square', f0: 1760, vol: 0.06 }); break;
      case 'pick': [784, 988, 1175, 1568].forEach((f, i) => tn(t + i * 0.055, 0.14, { type: 'triangle', f0: f, vol: 0.08, verb: 0.3 })); break;
      case 'turn': tn(t, 0.12, { type: 'triangle', f0: 659, vol: 0.09, verb: 0.3 }); tn(t + 0.1, 0.22, { type: 'triangle', f0: 988, vol: 0.09, verb: 0.3 }); break;
      case 'myturn': [523, 659, 784].forEach((f, i) => tn(t + i * 0.07, 0.18, { type: 'square', f0: f, vol: 0.05, verb: 0.3 })); tn(t + 0.21, 0.35, { type: 'triangle', f0: 1046, vol: 0.09, verb: 0.4 }); break;
      case 'tick': tn(t, 0.04, { type: 'triangle', f0: 1400, f1: 1100, vol: 0.07 }); nz(t, 0.02, { type: 'highpass', f0: 5000, vol: 0.04 }); break;
      case 'clang': [523, 1187, 1830, 2650].forEach((f, i) => tn(t, 0.5 - i * 0.08, { f0: f, vol: 0.12 / (i + 1), verb: 0.5 })); nz(t, 0.06, { type: 'highpass', f0: 4000, vol: 0.25 }); tn(t, 0.1, { f0: 150, f1: 70, vol: 0.25 }); break;
      case 'whoosh': nz(t, 0.22, { type: 'bandpass', f0: 500, f1: 2500, q: 2, vol: 0.12 }); break;
      case 'warp': tn(t, 0.35, { type: 'sine', f0: 200, f1: 1800, vol: 0.09, vib: 40, verb: 0.5 }); tn(t + 0.05, 0.3, { type: 'triangle', f0: 1800, f1: 300, vol: 0.05 }); break;
      case 'fire': nz(t, 0.9, { type: 'bandpass', f0: 600, f1: 1400, q: 0.8, vol: 0.2 }); for (let i = 0; i < 8; i++) nz(t + Math.random() * 0.8, 0.02, { type: 'highpass', f0: 4000, vol: 0.06 }); break;
      case 'gas': nz(t, 1.0, { type: 'highpass', f0: 3000, f1: 6000, vol: 0.12 }); break;
      case 'hurt': { const f = rnd(380, 520); tn(t, 0.08, { type: 'square', f0: f, f1: f * 0.7, vol: 0.06 }); tn(t + 0.08, 0.12, { type: 'square', f0: f * 0.8, f1: f * 0.45, vol: 0.06 }); break; }
      case 'yay': { const f = rnd(700, 900); tn(t, 0.07, { type: 'square', f0: f, f1: f * 1.3, vol: 0.05 }); tn(t + 0.08, 0.12, { type: 'square', f0: f * 1.3, f1: f * 1.8, vol: 0.05 }); break; }
      case 'scream': tn(t, 0.4, { type: 'sawtooth', f0: 900, f1: 1500, vol: 0.04, vib: 60 }); break;
      case 'ko': [392, 494, 587, 784].forEach((f, i) => tn(t + i * 0.08, 0.2, { type: 'square', f0: f, vol: 0.06, verb: 0.4 })); tn(t + 0.32, 0.5, { type: 'triangle', f0: 1175, vol: 0.08, verb: 0.5 }); break;
      case 'crate': tn(t, 0.08, { f0: 160, f1: 80, vol: 0.2 }); nz(t, 0.08, { type: 'bandpass', f0: 900, q: 2, vol: 0.12 }); break;
      case 'blip': tn(t, 0.035, { type: 'square', f0: rnd(520, 760), vol: 0.025 }); break;
      case 'jet': nz(t, 0.14, { type: 'bandpass', f0: 500, f1: 700, q: 0.8, vol: 0.12 }); break;
      case 'jetOn': tn(t, 0.2, { type: 'sawtooth', f0: 120, f1: 300, vol: 0.06 }); nz(t, 0.3, { type: 'bandpass', f0: 300, f1: 900, q: 1, vol: 0.15 }); break;
      case 'click': tn(t, 0.03, { type: 'triangle', f0: 1200, f1: 900, vol: 0.05 }); break;
      case 'buy': [1046, 1318, 1568].forEach((f, i) => tn(t + i * 0.06, 0.12, { type: 'square', f0: f, vol: 0.045 })); nz(t + 0.18, 0.12, { type: 'highpass', f0: 6000, vol: 0.05 }); break;
      case 'win': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tn(t + i * 0.12, i === 5 ? 0.6 : 0.14, { type: 'square', f0: f, vol: 0.06, verb: 0.4 })); break;
      case 'lose': [523, 466, 415, 392].forEach((f, i) => tn(t + i * 0.18, i === 3 ? 0.6 : 0.16, { type: 'triangle', f0: f, vol: 0.09, verb: 0.4 })); break;
    }
  } catch (e) {}
}

// BGM: 16ステップの自前シーケンサ
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
const SONGS = {
  title: { bpm: 96, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bassOct: -24, drums: 'x...h...x.x.h...', lead: [0, null, 4, null, 7, null, 4, 2, 0, null, null, null, -3, null, 0, null], leadOct: 12, swing: 0.1, pad: true },
  match: { bpm: 122, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]], bassOct: -24, drums: 'x.h.s.hxx.h.s.hh', lead: [7, null, 9, 7, 4, null, 2, null, 4, 7, null, 12, 9, null, 7, null], leadOct: 12, swing: 0.06, pad: false },
};
function playSong(name, force) {
  AU.want = name;
  if (!AU.ctx) return;
  if (AU.song === name && !force) return;
  AU.song = name; AU.step = 0; AU.nextT = AU.ctx.currentTime + 0.1;
}
function stopSong() { AU.want = null; AU.song = null; }
function musicTick() {
  const c = AU.ctx; if (!c || !AU.song || AU.muted || document.hidden) { if (c) AU.nextT = c.currentTime + 0.1; return; }
  const song = SONGS[AU.song], sp = 60 / song.bpm / 4;
  if (AU.nextT < c.currentTime - 0.2) AU.nextT = c.currentTime + 0.05;
  while (AU.nextT < c.currentTime + 0.15) {
    const st = AU.step % 16, bar = Math.floor(AU.step / 16), ch = song.chords[bar % song.chords.length];
    const t = AU.nextT + (st % 2 ? song.swing * sp : 0), out = AU.musBus;
    const d = song.drums[st];
    const urgent = AU.song === 'match' && (S.phase === 'turn' || S.phase === 'retreat') && S.turnTime <= 5;
    if (d === 'x') { tn(t, 0.22, { f0: 150, f1: 42, vol: 0.9, out }); }
    if (d === 's') { nz(t, 0.16, { type: 'bandpass', f0: 1800, f1: 900, q: 0.7, vol: 0.45, out }); tn(t, 0.08, { type: 'triangle', f0: 220, f1: 160, vol: 0.25, out }); }
    if (d === 'h' || urgent && st % 2 === 1) nz(t, 0.04, { type: 'highpass', f0: 8000, vol: 0.16, out });
    // ベース
    const bpat = AU.song === 'title' ? [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0] : [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0];
    if (bpat[st]) {
      const n = ch[0] + song.bassOct + (st === 14 ? 7 : st === 7 ? 12 : 0);
      tn(t, sp * 1.6, { type: 'square', f0: NOTE(n), vol: 0.22, out, a: 0.005 });
      tn(t, sp * 1.6, { type: 'sine', f0: NOTE(n - 12), vol: 0.35, out, a: 0.005 });
    }
    // 和音
    if (song.pad && st === 0) ch.forEach(n => tn(t, sp * 15, { type: 'triangle', f0: NOTE(n), vol: 0.07, out, a: 0.3, curve: 'lin' }));
    if (!song.pad && (st === 2 || st === 6 || st === 10 || st === 14)) ch.forEach(n => tn(t, sp * 0.9, { type: 'square', f0: NOTE(n), vol: 0.035, out }));
    // 主旋律（4小節目は休む）
    const ln = song.lead[st];
    if (ln != null && bar % 4 !== 3) tn(t, sp * 1.7, { type: 'square', f0: NOTE(ch[0] + song.leadOct + ln), vol: 0.06, out, vib: 3, a: 0.01, verb: 0.2 });
    AU.nextT += sp; AU.step++;
  }
}

// ---------------------------------------------------------------- 声と吹き出し
// 各ロボの声色。f=基本の高さ、type=波形、q=こもり具合
const VOICE = [
  { f: 560, type: 'square', fc: 2600, q: 1.2, rate: 0.065 },   // あなた（ビープだけ）
  { f: 700, type: 'triangle', fc: 3200, q: 2.5, rate: 0.055 }, // ポンコツ
  { f: 330, type: 'sawtooth', fc: 1400, q: 6, rate: 0.07 },    // ネジマル
  { f: 150, type: 'square', fc: 700, q: 3, rate: 0.11 },       // ガラクタ
  { f: 230, type: 'sawtooth', fc: 1100, q: 4, rate: 0.085 },   // ドック
];
const LINES = [
  { hit: ['！'], hurt: ['！？'], fly: ['！！'], ko: ['！'], scared: ['？！'], fire: ['！'], turn: ['……'], low: ['……'] },
  { hit: ['よっしゃ！', '当たり！', 'いえーい'], hurt: ['いてっ', 'わわっ', 'ひどーい'], fly: ['うわああ', 'とんでるー'], ko: ['やったね！', 'ばいばーい'], scared: ['ひえっ', 'あぶなっ'], fire: ['それっ！', 'いっけー'], turn: ['わたしの番！', 'まかせて'], low: ['やばいかも', 'ネジ取れそう'] },
  { hit: ['ふん、当然だ', '見たか'], hurt: ['ぐぬっ', 'おのれ'], fly: ['なにぃ！'], ko: ['格の違いだ', '沈め'], scared: ['む！'], fire: ['くらえ！', 'そこだ'], turn: ['見ていろ'], low: ['まだだ……'] },
  { hit: ['……'], hurt: ['……っ'], fly: ['……！'], ko: ['終わりだ'], scared: ['……'], fire: ['……'], turn: ['……'], low: ['……まだ映る'] },
];
// 声の抑揚: 喜び=上がる、痛い=下がる、叫び=伸びて上がる
const CONTOUR = { hit: [1, 1.15, 1.3], hurt: [1.3, 0.9, 0.7], fly: [1, 1.4, 1.8], ko: [1, 1.2, 1.1, 1.35], scared: [1.4, 1.6], fire: [1.1, 1.3], turn: [1, 1.1, 1], low: [0.9, 0.8, 0.75], talk: [1] };
const PRIO = { fly: 5, hurt: 4, ko: 4, hit: 3, scared: 2, fire: 2, low: 2, turn: 1 };
function speak(b, kind, force) {
  if (!b || !b.alive && kind !== 'fly') return;
  const now = S.time;
  if (!force && b.say && b.say.life > 0.3 && PRIO[b.say.kind] > PRIO[kind]) return;
  const outranks = b.say && b.say.life > 0 && PRIO[kind] > PRIO[b.say.kind];
  if (!force && !outranks && b.sayCd > 0 && PRIO[kind] < 4) return;
  const pool = LINES[b.id] && LINES[b.id][kind]; if (!pool) return;
  const text = pool[Math.floor(Math.random() * pool.length)];
  b.say = { text, kind, life: kind === 'fly' ? 1.2 : 1.5, max: kind === 'fly' ? 1.2 : 1.5 };
  b.sayCd = 1.1;
  voice(b, kind, Math.max(2, Math.min(6, Math.ceil(text.replace(/[……！？、]/g, '').length * 0.8) || 2)));
}
function voice(b, kind, syl) {
  if (!AU.ctx || AU.muted || S.silent) return;
  const v = VOICE[b.id] || VOICE[0], c = AU.ctx, con = CONTOUR[kind] || [1];
  let t = c.currentTime + 0.01;
  for (let i = 0; i < syl; i++) {
    const k = con[Math.min(con.length - 1, Math.floor(i / syl * con.length))];
    const f = v.f * k * (0.9 + Math.random() * 0.25), dur = v.rate * (kind === 'fly' && i === syl - 1 ? 4 : 1) * (0.8 + Math.random() * 0.5);
    const o = c.createOscillator(); o.type = v.type;
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (kind === 'hurt' ? 0.8 : kind === 'fly' ? 1.3 : 1.05), t + dur);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 30 + Math.random() * 20; lg.gain.value = f * 0.06; lfo.connect(lg).connect(o.frequency);
    const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = v.fc * (0.8 + Math.random() * 0.4); fl.Q.value = v.q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.008); g.gain.setValueAtTime(0.16, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(AU.sfxBus);
    o.start(t); o.stop(t + dur + 0.02); lfo.start(t); lfo.stop(t + dur + 0.02);
    t += dur + 0.012;
  }
}
function sayStep(dt) {
  for (const b of S.bots) {
    b.sayCd = Math.max(0, (b.sayCd || 0) - dt);
    if (b.say) { b.say.life -= dt; if (b.say.life <= 0) b.say = null; }
    if (b.alive && !b.lowSaid && b.hp < b.maxHp * 0.3) { b.lowSaid = true; speak(b, 'low'); }
    if (b.hp >= b.maxHp * 0.3) b.lowSaid = false;
  }
}
function drawSay(c, b) {
  const s = b.say; if (!s || !b.alive) return;
  const k = 1 - s.life / s.max, pop = k < 0.12 ? 0.6 + k / 0.12 * 0.4 : 1, a = Math.min(1, s.life * 4);
  const y = b.y - 98 - (b.hat === 'cone' ? 6 : 0), x = b.x + b.facing * 6;
  c.save(); c.translate(x, y); c.scale(pop, pop); c.globalAlpha = a;
  c.font = '800 11px "M PLUS Rounded 1c", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = Math.max(26, c.measureText(s.text).width + 14), h = 20;
  const loud = s.kind === 'fly' || s.kind === 'hurt' || s.kind === 'ko';
  c.fillStyle = loud ? '#FFF4D6' : '#FFFFFF'; c.strokeStyle = '#161B21'; c.lineWidth = 1.6;
  c.beginPath(); rr(c, -w / 2, -h / 2, w, h, 9); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-4, h / 2 - 1); c.lineTo(0, h / 2 + 6); c.lineTo(4, h / 2 - 1); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = c.strokeStyle === '#161B21' ? (loud ? '#FFF4D6' : '#FFFFFF') : '#FFF'; c.fillRect(-3.4, h / 2 - 2.6, 6.8, 2.4);
  c.fillStyle = s.kind === 'hurt' || s.kind === 'fly' ? '#D7322A' : '#161B21';
  c.fillText(s.text, 0, 0.5);
  c.restore();
}

// ---------------------------------------------------------------- ストーリー（全5話・短め）
// who: 0=あなた 1=ポンコツ 2=ネジマル 3=ガラクタ 'doc'=ドック（語り役） null=地の文
const STORY = [
  {
    title: 'スクラップ島', stage: 'jungle', diff: 'easy', goal: { type: 'kills', n: 1 }, reward: { rivets: 300, gears: 2 },
    intro: [
      ['doc', 'idle', 'ここはスクラップ島。人間がいらなくなった機械を、捨てていった島じゃ。'],
      ['doc', 'worried', '人間はもう来ん。わしらの電気は、島の底にある「大電池」だけが頼りでな。'],
      ['doc', 'sad', 'じゃが全員に配れるほどはない。昔はそれを奪い合って、本気の戦争をした。島は半分沈んだ。'],
      ['doc', 'ready', 'だから決まりを作った。年に一度の砲撃大会で、電気の取り分を決める。4体ずつ、順番に撃つ。壊れたら、わしが直す。'],
      ['doc', 'happy', '勝てば電気がたくさんもらえる。優勝すれば、新品の体もな。'],
      [1, 'happy', 'あ、いたいた！ あなたも出るんでしょ？ まずは練習試合。1体でいいから落としてみて。'],
    ],
    win: [
      [1, 'happy', 'やるじゃん！ 撃ち方、体が覚えてるんだね。'],
      ['doc', 'idle', 'ふむ。浜で拾ったときは、ただのガラクタかと思ったがの。'],
      [1, 'ready', '次は予選。サビ鉄キャニオンで待ってる。'],
    ],
    lose: [[1, 'worried', '起きたばっかりだもんね。もう一回やろ。']],
  },
  {
    title: '予選', stage: 'canyon', diff: 'normal', goal: { type: 'rank', n: 2 }, reward: { rivets: 450, gears: 3 },
    intro: [
      [2, 'smug', '新入りか。浜で拾われたブリキが大会とはな。電気がもったいない。'],
      [3, 'idle', '……'],
      ['doc', 'idle', 'ネジマルは電気を貯めこむのが趣味でな。ガラクタは前回の優勝者じゃ。'],
      ['doc', 'worried', '妙なやつでな。毎年勝つのに、電気を一度も受け取らん。'],
      [2, 'focus', '予選は2位まで通過だ。せいぜい3位を取り合え。'],
    ],
    win: [
      [2, 'hurt', 'ぐぬぬ。プロペラが曲がった。'],
      [1, 'happy', '予選突破！ 本戦は浮島だよ。'],
    ],
    lose: [[2, 'smug', '見たか。これが格の違いだ。'], ['doc', 'idle', '気にするな。壊れたところは直しておく。']],
  },
  {
    title: '浮島の夜', stage: 'jungle', diff: 'normal', goal: { type: 'rank', n: 1 }, reward: { rivets: 600, gears: 3 },
    intro: [
      [1, 'ready', 'ここから本戦。浮島は足場が狭いから、落とし合いになるよ。'],
      [1, 'idle', 'ドックの工場にね、昔の優勝トロフィーがあるの。そこに写ってるロボ、あなたと同じブラウン管頭なんだ。'],
      [0, 'focus', '……'],
      [1, 'smug', 'ま、今日は手加減しないけどね！'],
    ],
    win: [
      [1, 'sad', '負けたー。でも楽しかった。'],
      [1, 'happy', 'トロフィーの写真、あとでドックに見せてもらお。'],
    ],
    lose: [[1, 'happy', '今日はわたしの勝ち！ 落とし合いは、足場を先に崩した方が勝つよ。']],
  },
  {
    title: '準決勝', stage: 'canyon', diff: 'hard', goal: { type: 'rank', n: 1 }, reward: { rivets: 800, gears: 4 },
    intro: [
      [2, 'strain', '本気でいく。予選の借りは返す。'],
      ['doc', 'idle', 'トロフィーの写真か。……あれは、昔のガラクタじゃ。'],
      ['doc', 'sad', '大会を始めた年、あいつは頭をなくした。わしが直したが、同じ部品はもうなかった。'],
      [3, 'idle', '……'],
    ],
    win: [
      [2, 'sad', '……決勝、行ってこい。負けたら許さん。'],
      [1, 'happy', '決勝だよ！ 相手はもちろん、ガラクタ。'],
    ],
    lose: [[2, 'smug', '借りは返した。悔しければ、また来い。']],
  },
  {
    title: '決勝', stage: 'jungle', diff: 'hard', goal: { type: 'rank', n: 1 }, reward: { rivets: 1200, gears: 6 },
    intro: [
      ['doc', 'ready', '決勝じゃ。島じゅうのロボが見とる。'],
      [3, 'focus', '……その画面。まだ映るのか。'],
      [0, 'ready', '……'],
      [3, 'smug', 'ならば、映してみせろ。'],
    ],
    win: [
      [3, 'happy', '……いい画だった。'],
      [3, 'idle', 'わたしが勝ち続けたのは、電気を島じゅうに配るためだ。勝った者が、取り分を決められる。'],
      [3, 'ready', '次は、おまえが決めろ。'],
      [1, 'happy', '優勝ー！ 新品の体、どうする？'],
      [0, 'happy', '……'],
      ['doc', 'happy', 'その年、大電池の電気は島じゅうに配られた。ブラウン管頭は、新品の体を断ったそうじゃ。'],
    ],
    lose: [[3, 'idle', 'まだ映りが甘い。また来い。']],
  },
];
const goalText = g => g.type === 'kills' ? `${g.n}体撃破` : g.n === 1 ? '1位' : `${g.n}位以内`;
function goalMet(g, me, place) { return g.type === 'kills' ? me.kills >= g.n : place <= g.n; }

// 語り役ドック（島の修理屋）。試合には出ないので、会話と工場でだけ描く
const DOC = { id: 4, name: 'ドック', color: '#C98A3A', eye: '#FFE6A0', hat: 'none', doc: true, facing: -1, aim: Math.PI + 0.3, weapon: 'hammer', eq: { head: 'h1', body: 'b1', legs: 'l1' }, st: { speed: 0, jump: 0 }, hp: 100, maxHp: 100, alive: true, grounded: true, x: 0, y: 0, vx: 0, vy: 0, walk: 0, blink: 2 };
DOC.light = shadeHex(DOC.color, 0.45); DOC.dark = shadeHex(DOC.color, -0.35);
function drawDoc(c, b, t, portrait) {
  c.save(); c.translate(b.x, b.y);
  if (!portrait) { c.fillStyle = 'rgba(0,0,0,.22)'; ell(c, 0, 14.6, 13, 2.6); c.translate(0, 14); c.scale(1.22, 1.22); c.translate(0, -14); }
  const f = b.facing; c.lineJoin = 'round'; c.lineCap = 'round';
  c.save(); c.scale(f, 1);
  // 脚とブーツ
  for (const lx of [-4.6, 4.6]) { c.beginPath(); rr(c, lx - 2.2, 4, 4.4, 7, 2); fillStroke(c, '#525C66', 1.2); c.beginPath(); rr(c, lx - 3.6, 10.2, 8.6, 4.3, 2); fillStroke(c, '#3A2A1E', 1.3); }
  // 胴（つなぎ）
  c.beginPath(); rr(c, -11, -8, 22, 16, 4.5); fillStroke(c, gradV(c, -8, 8, ['#7FA4C8', '#5B7FA6', '#3E5E82']), 1.6);
  c.beginPath(); rr(c, -6, -7, 12, 8, 2); c.fillStyle = 'rgba(0,0,0,.18)'; c.fill();
  c.fillStyle = '#FFC531'; circ(c, -5, -6, 1.1); circ(c, 5, -6, 1.1);
  c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-3, -2); c.lineTo(3, -2); c.stroke();
  // 頭（真鍮の古いブラウン管）
  c.beginPath(); rr(c, -15, -33, 30, 25, 6); fillStroke(c, gradV(c, -33, -8, ['#E8C17A', '#C98A3A', '#8E5A22']), 1.8);
  c.fillStyle = 'rgba(0,0,0,.22)'; for (const x of [-12.5, 12.5]) circ(c, x, -11, 0.9);
  c.beginPath(); rr(c, -11.5, -29, 23, 15, 3.4);
  const g = c.createRadialGradient(0, -22, 1, 0, -21, 13); g.addColorStop(0, '#3A3220'); g.addColorStop(1, '#14110A'); c.fillStyle = g; c.fill(); c.strokeStyle = OL; c.lineWidth = 1.2; c.stroke();
  // 溶接ゴーグル（おでこ）
  c.fillStyle = '#3A2A1E'; c.fillRect(-15, -35, 30, 3.6);
  for (const x of [-6, 6]) { c.beginPath(); c.arc(x, -34, 4.2, 0, 7); fillStroke(c, '#5C6670', 1.3); c.beginPath(); c.arc(x, -34, 2.8, 0, 7); c.fillStyle = gradV(c, -37, -31, ['#FFD27A', '#C9601A']); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; circ(c, x - 1, -35, 0.8); }
  c.restore();
  const mood = moodOf(b, portrait);
  b.portrait = portrait;
  drawFace(c, b, 0, -22.5, 20, 13, t, mood);
  // ヒゲ（白い口ひげの形の放熱板）
  c.save(); c.scale(1, 1);
  c.beginPath(); c.moveTo(0, -12.8);
  c.bezierCurveTo(-4, -15.5, -10, -14, -13, -9.5); c.bezierCurveTo(-9, -11, -5, -10.5, 0, -10.5);
  c.bezierCurveTo(5, -10.5, 9, -11, 13, -9.5); c.bezierCurveTo(10, -14, 4, -15.5, 0, -12.8);
  fillStroke(c, '#F4EEDF', 1.1);
  c.restore();
  // 腕とスパナ
  c.save(); c.translate(f * 8, 0); c.rotate(f > 0 ? -0.5 : Math.PI + 0.5); if (f < 0) c.scale(1, -1);
  c.beginPath(); c.arc(0, 0, 3.2, 0, 7); fillStroke(c, '#525C66', 1.2);
  c.beginPath(); rr(c, 2, -1.8, 16, 3.6, 1.5); fillStroke(c, gradV(c, -1.8, 1.8, ['#C9D0D6', '#7D868F']), 1.1);
  c.beginPath(); c.arc(19, 0, 4.4, 0.6, Math.PI * 2 - 0.6); fillStroke(c, '#9AA3AB', 1.2);
  c.restore();
  c.restore();
}

// 会話
const TALK = { lines: null, i: 0, done: null, shown: 0, full: false };
function showTalk(lines, done) {
  TALK.lines = lines; TALK.i = 0; TALK.done = done;
  $('#talk').hidden = false;
  talkLine();
}
function talkSpeaker(who) {
  if (who == null) return null;
  if (who === 'doc') { if (S.npc) { DOC.x = S.npc.x; DOC.y = S.npc.y; DOC.facing = S.npc.facing; } return DOC; }
  return S.bots[who] || null;
}
function talkLine() {
  const [who, mood, text] = TALK.lines[TALK.i];
  const b = talkSpeaker(who), box = $('#talk');
  box.classList.toggle('narr', !b);
  box.classList.toggle('right', !!b && who !== 0 && who !== 'doc');
  box.style.setProperty('--c', b ? b.color : '#A3B3BC');
  $('#talkName').textContent = b ? b.name : '';
  TALK.text = text; TALK.shown = 0; TALK.full = false; TALK.t0 = performance.now();
  $('#talkText').textContent = '';
  if (b) {
    b.mood = mood || 'idle'; b.moodT = 6;
    S.talkFocus = who === 'doc' && !S.npc ? null : b;
    const cv = $('#talkFace');
    requestAnimationFrame(() => paintPortrait(cv, { ...b, mood: b.mood, facing: who === 0 || who === 'doc' ? 1 : -1 }, who === 'doc' ? 1.95 : 2.2, who === 'doc' ? 1.04 : 0.98));
  } else S.talkFocus = null;
  sfx('click');
}
function talkTick() {
  if ($('#talk').hidden || TALK.full) return;
  const n = Math.min(TALK.text.length, Math.floor((performance.now() - TALK.t0) / 32));
  if (n !== TALK.shown) {
    TALK.shown = n; $('#talkText').textContent = TALK.text.slice(0, n);
    const sp = talkSpeaker(TALK.lines[TALK.i][0]);
    if (sp && n % 3 === 0 && !/[……]/.test(TALK.text[n - 1] || '')) voice(sp, 'talk', 1);
  }
  if (n >= TALK.text.length) TALK.full = true;
}
function talkNext() {
  if ($('#talk').hidden) return;
  if (!TALK.full) { TALK.full = true; TALK.shown = TALK.text.length; $('#talkText').textContent = TALK.text; return; }
  TALK.i++;
  if (TALK.i >= TALK.lines.length) talkEnd(); else talkLine();
}
function talkEnd() {
  $('#talk').hidden = true; S.talkFocus = null;
  const d = TALK.done; TALK.done = null; if (d) d();
}

// ---------------------------------------------------------------- チュートリアル（ドックの修理工場）
const TUT_STEPS = [
  { key: 'walk', pc: 'まずは歩く。A・D キーで、旗のところまで行ってみい。', sp: 'まずは歩く。左スティックで、旗のところまで行ってみい。' },
  { key: 'jump', pc: 'つぎは段差じゃ。Space でジャンプ。長く押すほど高く跳べる。空中でも左右に動けるぞ。', sp: 'つぎは段差じゃ。左スティックを上に倒すとジャンプ。倒し続けるほど高く跳べる。' },
  { key: 'fire', pc: '向こうのかかしを撃ってみい。狙う方向へドラッグして、離すと発射じゃ。長く引くほど強い。', sp: '向こうのかかしを撃ってみい。右スティックを狙う方向へ引いて、離すと発射じゃ。長く引くほど強い。' },
  { key: 'swap', pc: '武器は下のボタンか数字キーで替えられる。グレネード（2）を選んでみい。跳ねて、3秒で爆発する。', sp: '武器は下のボタンで替えられる。グレネードを選んでみい。跳ねて、3秒で爆発する。' },
  { key: 'drop', pc: '最後じゃ。かかしを水に落としてみい。足元を崩すか、爆風で吹き飛ばす。水に落ちたロボは錆びて止まる。', sp: '最後じゃ。かかしを水に落としてみい。足元を崩すか、爆風で吹き飛ばす。水に落ちたロボは錆びて止まる。' },
];
const TUT_FLAG = 470, TUT_LEDGE = [575, 665];
function startTutorial() {
  startMatch({ stage: 'practice', diff: 'easy', seed: 4242, tutorial: true });
}
function tutSetup() {
  const me = S.bots[0], dummy = S.bots[1];
  S.bots.length = 2;
  const put = (b, x) => { b.x = x; let f = 300; while (f < WATER && !solid(x, f + 1)) f++; b.y = f - R; b.grounded = true; b.vx = b.vy = 0; };
  put(me, 230); me.facing = 1; syncAim(me);
  dummy.name = 'かかし'; dummy.color = '#B9A27A'; dummy.light = shadeHex('#B9A27A', 0.45); dummy.dark = shadeHex('#B9A27A', -0.35);
  dummy.eye = '#FFF0C8'; dummy.hat = 'none'; dummy.id = 5; dummy.dummy = true; dummy.maxHp = dummy.hp = 300;
  put(dummy, 1330); dummy.facing = -1; syncAim(dummy);
  S.npc = { x: 120, y: 0, facing: 1 }; let f = 300; while (f < WATER && !solid(120, f + 1)) f++; S.npc.y = f - R;
  for (const k of WORDER) me.ammo[k] = WP[k].lv <= Math.max(P.lv, 1) ? WP[k].ammo : 0;
  me.ammo.grenade = Math.max(me.ammo.grenade, 5);
  S.tutorial = { step: -1, okT: 0 };
  buildCards(); buildTray();
}
function tutStart() { S.tutorial.step = 0; showCoach(); }
function showCoach() {
  const st = TUT_STEPS[S.tutorial.step];
  $('#coach').hidden = false;
  $('#coachStep').textContent = `${S.tutorial.step + 1} / ${TUT_STEPS.length}`;
  $('#coachText').textContent = document.body.classList.contains('touch') ? st.sp : st.pc;
  $('#coach').classList.remove('ok');
  DOC.mood = 'ready';
  requestAnimationFrame(() => paintPortrait($('#coachFace'), { ...DOC, mood: 'ready', facing: 1 }, 1.35, 1.08));
  voice(DOC, 'talk', 4);
  if (st.key === 'drop') {
    // かかしを崖っぷちへ
    const d = S.bots[1]; d.alive = true; d.hp = d.maxHp; d.x = 1585; let f = 300; while (f < WATER && !solid(d.x, f + 1)) f++; d.y = f - R; d.grounded = true;
  }
}
function tutCheck() {
  const T2 = S.tutorial, me = S.bots[0], d = S.bots[1];
  if (!T2 || T2.step < 0 || T2.step >= TUT_STEPS.length) return;
  if (T2.okT > 0) { T2.okT -= STEP; if (T2.okT <= 0) { T2.step++; if (T2.step >= TUT_STEPS.length) tutFinish(); else showCoach(); } return; }
  const key = TUT_STEPS[T2.step].key;
  let ok = false;
  if (key === 'walk') ok = me.x >= TUT_FLAG - 8;
  else if (key === 'jump') ok = me.grounded && me.x > TUT_LEDGE[0] && me.x < TUT_LEDGE[1] && me.y + R < 772;
  else if (key === 'fire') ok = d.hp < d.maxHp || d.deaths > 0;
  else if (key === 'swap') ok = me.weapon === 'grenade';
  else if (key === 'drop') ok = d.deaths > 0;
  if (ok) {
    T2.okT = 1.1; $('#coach').classList.add('ok'); $('#coachText').textContent = ['よし。', 'うまい。', 'その調子じゃ。', 'それでいい。', '見事じゃ。'][T2.step];
    sfx('pick'); requestAnimationFrame(() => paintPortrait($('#coachFace'), { ...DOC, mood: 'happy', facing: 1 }, 1.35, 1.08));
  }
  // かかしは壊れても、すぐ元の場所に戻す
  if (!d.alive && key !== 'drop') { d.alive = true; d.hp = d.maxHp; d.x = 1330; d.y = 600; d.grounded = false; }
}
function tutFinish() {
  $('#coach').hidden = true;
  S.phase = 'talk';
  showTalk([
    ['doc', 'happy', '上出来じゃ。あとは本番で覚えればいい。'],
    ['doc', 'idle', '本番は4体で順番に撃ち合う。持ち時間は25秒。撃ったら残り5秒で、急いで隠れるんじゃ。'],
    ['doc', 'ready', '当てたダメージと撃破で点が入る。4分たって、一番点が高いやつの勝ちじゃ。'],
    ['doc', 'happy', '壊れても心配いらん。わしが直す。……さあ、外でポンコツが待っとるぞ。'],
  ], () => {
    const first = !P.tut;
    P.tut = true; if (first) { P.rivets += 200; saveProfile(); }
    goTitle(); openStory();
    if (first) toast('チュートリアル完了　リベット +200');
  });
}

// 話を選ぶ画面
function openStory() {
  showScreen('#story');
  const box = $('#storyList'); box.innerHTML = '';
  const tb = document.createElement('button');
  tb.className = 'chap tut' + (P.tut ? ' cleared' : '');
  tb.innerHTML = `<b>はじめに</b><span class="ct">ドックの修理工場</span><small>操作を覚える（チュートリアル）</small>${P.tut ? `<em>${svg('star')}クリア</em>` : '<em class="new">まずはここ</em>'}`;
  tb.addEventListener('click', startTutorial);
  box.appendChild(tb);
  STORY.forEach((ch, i) => {
    const locked = i > (P.story || 0), cleared = i < (P.story || 0);
    const bt = document.createElement('button');
    bt.className = 'chap' + (locked ? ' locked' : '') + (cleared ? ' cleared' : '');
    bt.disabled = locked;
    bt.innerHTML = `<b>第${i + 1}話</b><span class="ct"></span><small>${STAGES[ch.stage].name}　目標 ${goalText(ch.goal)}　CPU ${{ easy: 'やさしい', normal: 'ふつう', hard: 'つよい' }[ch.diff]}</small>${cleared ? `<em>${svg('star')}クリア</em>` : locked ? `<em>${svg('lock')}</em>` : (P.tut ? `<em class="new">次はここ</em>` : '<em></em>')}`;
    bt.querySelector('.ct').textContent = ch.title;
    bt.addEventListener('click', () => playChapter(i));
    box.appendChild(bt);
  });
}
function playChapter(i) {
  const ch = STORY[i];
  startMatch({ stage: ch.stage, diff: ch.diff, chapter: i });
}

// ---------------------------------------------------------------- ショップ（元ゲームの課金の形に合わせる）
// 持ち越しの弾（stock）は試合の基本の弾に上乗せされ、基本を使い切ってから減る
const AMMO_PRICE = { grenade: 240, hammer: 200, bouncer: 300, revolver: 300, mine: 360, cannon: 420, fire: 420, tele: 480, gas: 480, jet: 400, hook: 300, chute: 240 };
const AMMO_PACK = 8, SALE_OFF = 0.15;
const PACKS = [
  { id: 'p1', name: '鉄くずパック', desc: 'Lv1〜3の武器から3種、各3発', lv: [1, 3], n: 3, each: 3, rivets: 400 },
  { id: 'p2', name: 'サビ鉄パック', desc: 'Lv4〜6の武器から3種、各3発', lv: [4, 6], n: 3, each: 3, rivets: 900 },
  { id: 'p3', name: 'ブラウン管パック', desc: 'Lv7以上の武器から3種、各4発', lv: [7, 99], n: 3, each: 4, gears: 3 },
];
const BOOSTS = [
  { id: 'kit', name: '修理キット', desc: '試合で使える修理が1回増える（1試合に最大2個まで持ち込み）', rivets: 250 },
  { id: 'xp2', name: '経験値2倍', desc: 'つぎの3試合、もらえる経験値が2倍', gears: 3 },
  { id: 'riv2', name: 'リベット2倍', desc: 'つぎの3試合、もらえるリベットが2倍', gears: 3 },
];
// 現金で買うギア。決済先と価格は未決定のため購入は止めてある
const GEAR_PACKS = [
  { name: 'ギア袋', gears: 10, yen: 160 },
  { name: 'ギア箱', gears: 35, yen: 490 },
  { name: 'ギアの山', gears: 80, yen: 1000 },
  { name: 'ギア倉庫', gears: 270, yen: 3000 },
  { name: 'ギアの金庫', gears: 1000, yen: 10000 },
];
const EXCHANGE = { gears: 5, rivets: 600 };
const PAYMENTS_READY = false;

// 日替わりセール（ローカル時刻の日付で決まる）
function saleWeapon() {
  const d = new Date(), day = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  const opts = Object.keys(AMMO_PRICE).filter(k => WP[k].lv <= P.lv);
  return opts.length ? opts[day % opts.length] : 'grenade';
}
function saleLeft() {
  const d = new Date(), end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const s = Math.max(0, Math.floor((end - d) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const ammoPrice = k => Math.round(AMMO_PRICE[k] * (k === saleWeapon() ? 1 - SALE_OFF : 1));
function canPay(c) { return P.rivets >= (c.rivets || 0) && P.gears >= (c.gears || 0); }
function pay(c) { if (!canPay(c)) { toast('リベットかギアが足りません'); return false; } P.rivets -= c.rivets || 0; P.gears -= c.gears || 0; return true; }
function addStock(k, n) { P.stock = P.stock || {}; P.stock[k] = (P.stock[k] || 0) + n; }

function buyAmmo(k, inMatch) {
  if (!pay({ rivets: ammoPrice(k) })) return false;
  addStock(k, AMMO_PACK); saveProfile(); sfx('buy');
  if (inMatch) { const me = S.bots.find(b => b.human); if (me) me.ammo[k] = (me.ammo[k] || 0) + AMMO_PACK; }
  return true;
}
function buyPack(pk) {
  const pool = WORDER.filter(k => AMMO_PRICE[k] && WP[k].lv >= pk.lv[0] && WP[k].lv <= pk.lv[1] && WP[k].lv <= P.lv);
  if (!pool.length) { toast(`Lv${pk.lv[0]}で買えるようになります`); return; }
  if (!pay(pk)) return;
  const got = [];
  for (let i = 0; i < pk.n; i++) { const k = pool[Math.floor(Math.random() * pool.length)]; addStock(k, pk.each); got.push(k); }
  saveProfile(); sfx('win');
  showPackReveal(pk, got);
}
function buyBoost(bo) {
  if (!pay(bo)) return;
  if (bo.id === 'kit') P.kits = (P.kits || 0) + 1;
  if (bo.id === 'xp2') P.xp2 = (P.xp2 || 0) + 3;
  if (bo.id === 'riv2') P.riv2 = (P.riv2 || 0) + 3;
  saveProfile(); sfx('buy'); toast(`${bo.name}を買いました`); renderShop();
}
function exchangeGears() {
  if (P.gears < EXCHANGE.gears) { toast('ギアが足りません'); return; }
  P.gears -= EXCHANGE.gears; P.rivets += EXCHANGE.rivets; saveProfile(); sfx('buy'); renderShop();
}

let shopTab = 'pack';
function openShop() { showScreen('#shop'); renderShop(); }
function renderShop() {
  $('#sRiv').textContent = P.rivets; $('#sGear').textContent = P.gears; $('#sSale').textContent = saleLeft();
  for (const bt of document.querySelectorAll('#shopTabs button')) bt.classList.toggle('sel', bt.dataset.t === shopTab);
  const box = $('#shopList'); box.innerHTML = '';
  const cost = c => c.gears ? `${svg('gear')}${c.gears}` : `${svg('rivet')}${c.rivets}`;
  const card = (title, desc, price, onBuy, extra = '', disabled = false, tag = '') => {
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `${extra}<div class="ii"><b></b><small></small></div>${tag}<button class="buy"${disabled ? ' disabled' : ''}>${price}</button>`;
    el.querySelector('b').textContent = title; el.querySelector('small').textContent = desc;
    el.querySelector('.buy').addEventListener('click', onBuy);
    box.appendChild(el); return el;
  };
  if (shopTab === 'pack') {
    for (const pk of PACKS) {
      const locked = pk.lv[0] > P.lv;
      card(pk.name, locked ? `Lv${pk.lv[0]}で解放　${pk.desc}` : pk.desc, locked ? `${svg('lock')}Lv${pk.lv[0]}` : cost(pk), () => buyPack(pk), `<div class="crate">${svg('rocket')}</div>`, locked);
    }
  } else if (shopTab === 'ammo') {
    const sale = saleWeapon();
    for (const k of Object.keys(AMMO_PRICE)) {
      if (WP[k].lv > P.lv) continue;
      const have = (P.stock && P.stock[k]) || 0, isSale = k === sale;
      card(`${WP[k].name} ${AMMO_PACK}発`, `持ち越し ${have}発`, `${svg('rivet')}${ammoPrice(k)}`, () => { if (buyAmmo(k)) renderShop(); },
        `<div class="wico">${svg(k)}</div>`, false, isSale ? `<em class="sale">${Math.round(SALE_OFF * 100)}%引き</em>` : '');
    }
  } else if (shopTab === 'boost') {
    for (const bo of BOOSTS) {
      const own = bo.id === 'kit' ? `所持 ${P.kits || 0}個` : bo.id === 'xp2' ? `残り ${P.xp2 || 0}試合` : `残り ${P.riv2 || 0}試合`;
      card(bo.name, `${bo.desc}　${own}`, cost(bo), () => buyBoost(bo), `<div class="wico">${svg(bo.id === 'kit' ? 'wrench' : bo.id === 'xp2' ? 'star' : 'rivet')}</div>`);
    }
  } else {
    card('ギアをリベットに両替', `ギア${EXCHANGE.gears}枚 → リベット${EXCHANGE.rivets}`, `${svg('gear')}${EXCHANGE.gears}`, exchangeGears, `<div class="wico">${svg('gear')}</div>`);
    for (const g of GEAR_PACKS) {
      card(g.name, `ギア ${g.gears}枚`, PAYMENTS_READY ? `${g.yen.toLocaleString()}円` : `${g.yen.toLocaleString()}円・準備中`, () => toast('お金での購入はまだ使えません'), `<div class="wico gear">${svg('gear')}</div>`, !PAYMENTS_READY);
    }
    const note = document.createElement('p'); note.className = 'snote'; note.textContent = 'お金での購入は準備中です。ギアは勝利とレベルアップでも手に入ります。';
    box.appendChild(note);
  }
}
function showPackReveal(pk, got) {
  const el = $('#reveal'); el.hidden = false;
  el.querySelector('h3').textContent = pk.name;
  const row = el.querySelector('.got'); row.innerHTML = '';
  got.forEach((k, i) => {
    const d = document.createElement('div'); d.className = 'gotc'; d.style.animationDelay = `${i * 0.18}s`;
    d.innerHTML = `${svg(k)}<b></b><small>+${pk.each}発</small>`; d.querySelector('b').textContent = WP[k].name; row.appendChild(d);
  });
  renderShop();
}

// 試合中の弾切れ案内（元ゲームの「15%引き・8発パック」）。試合は止めない
function offerAmmo(k) {
  if (!AMMO_PRICE[k] || S.tutorial) return;
  S.offered = S.offered || {};
  if (S.offered[k]) return;
  S.offered[k] = true;
  const el = $('#offer');
  el.innerHTML = `<div class="ot"><b></b><small>${AMMO_PACK}発パック　${k === saleWeapon() ? `<em>${Math.round(SALE_OFF * 100)}%引き</em>` : ''}</small></div><button class="buy">${svg('rivet')}${ammoPrice(k)}</button><button class="x" aria-label="閉じる">${svg('close')}</button>`;
  el.querySelector('b').textContent = `${WP[k].name}の弾が切れた`;
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  el.querySelector('.buy').onclick = e => { e.stopPropagation(); if (buyAmmo(k, true)) { el.hidden = true; toast(`${WP[k].name} +${AMMO_PACK}発`); } };
  el.querySelector('.x').onclick = e => { e.stopPropagation(); el.hidden = true; };
  clearTimeout(offerAmmo.t); offerAmmo.t = setTimeout(() => { el.hidden = true; }, 7000);
}

// ---------------------------------------------------------------- 画面とHUD
function showScreen(id) {
  for (const s of ['#title', '#garage', '#result', '#pause', '#story', '#shop', '#free']) $(s).hidden = s !== id;
  $('#offer').hidden = true;
}
function inMatch() { return ['lobby', 'banner', 'turn', 'retreat', 'settle', 'over'].includes(S.phase); }

function buildCards() {
  const box = $('#cards'); box.innerHTML = '';
  S.cardEls = S.bots.map(b => {
    const el = document.createElement('div'); el.className = 'card';
    el.style.setProperty('--c', b.color);
    el.innerHTML = `<canvas></canvas><div class="cn"><span class="nm"></span><b class="sc">0</b><span class="hpn"></span></div><span class="kb">0</span><i class="hp"><i></i></i>`;
    box.appendChild(el);
    el.querySelector('.nm').textContent = b.name;
    requestAnimationFrame(() => paintPortrait(el.querySelector('canvas'), b, 0.78, 1.1));
    return { el, sc: el.querySelector('.sc'), kb: el.querySelector('.kb'), hp: el.querySelector('.hp i'), hpn: el.querySelector('.hpn'), last: '' };
  });
}
function buildTray() {
  const tray = $('#tray'); tray.innerHTML = '';
  const me = S.bots.find(b => b.human);
  $('#wslot').hidden = !me; $('#boost').hidden = !me;
  if (!me) return;
  WORDER.forEach((k, i) => {
    const bt = document.createElement('button'); bt.className = 'wbtn'; bt.dataset.k = k;
    bt.innerHTML = `${svg(k)}<span>${WP[k].name}</span><em></em>${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : '<kbd>移動</kbd>'}`;
    bt.addEventListener('click', e => { e.stopPropagation(); selectWeapon(k); tray.hidden = true; });
    tray.appendChild(bt);
  });
}
function selectWeapon(k) {
  const me = S.bots.find(b => b.human);
  if (!me) return;
  if (WP[k].lv > P.lv) { toast(`${WP[k].name}は Lv${WP[k].lv} で解放`); return; }
  if (!(me.ammo[k] > 0)) { toast(`${WP[k].name}の弾がありません`); return; }
  // ジェットパックとパラシュートは選んだ瞬間に使う（狙う必要がない）
  if (k === 'jet' || k === 'chute') {
    if (S.active !== me || !me.alive || !(S.phase === 'turn' || S.phase === 'retreat')) { toast('自分の番に使えます'); return; }
    if ((k === 'jet' && me.jet) || (k === 'chute' && me.chute)) return;
    const keep = me.weapon; me.weapon = k; useMove(me, k, me.aim);
    me.weapon = me.ammo[keep] > 0 ? keep : 'rocket';
    toast(k === 'jet' ? 'ジャンプ長押しで上昇' : 'パラシュート準備。落ちると開く');
    return;
  }
  me.weapon = k; S.charge = null;
}
let toastT = 0;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 1600); }
function showBanner(text, color) {
  const el = $('#banner'); el.textContent = text; el.style.setProperty('--c', color);
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function showHint(on) {
  const el = $('#hint');
  if (!on) { el.hidden = true; return; }
  const touch = document.body.classList.contains('touch');
  el.innerHTML = touch
    ? '<b>左</b> 移動・上でジャンプ　<b>右</b> 引いて狙う・離して発射'
    : '<b>A D</b> 移動　<b>Space</b> ジャンプ（長押しで高く）　<b>1〜0</b> 武器　<b>ホイール</b> 拡大縮小　<b>V</b> 全体<br><b>狙う方向へドラッグ</b>、長く引くほど強い、離すと発射（<b>↑ ↓</b> 角度 + <b>F</b> 長押しでも可）';
  el.hidden = false;
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHud() {
  if (!inMatch() || !S.cardEls) return;
  S.bots.forEach((b, i) => {
    const e = S.cardEls[i], key = `${b.score}|${b.kills}|${b.hp}|${b.alive}|${S.active === b}`;
    if (e.last === key) return; e.last = key;
    e.sc.textContent = b.score; e.kb.textContent = b.kills;
    e.hp.style.width = `${clamp(b.hp / b.maxHp, 0, 1) * 100}%`;
    e.el.classList.toggle('low', b.alive && b.hp < b.maxHp * 0.4); e.el.classList.toggle('crit', b.alive && b.hp < b.maxHp * 0.2);
    e.hpn.textContent = b.alive ? `HP ${Math.max(0, Math.ceil(b.hp))}` : '';
    e.el.classList.toggle('on', S.active === b); e.el.classList.toggle('dead', !b.alive);
  });
  const tt = (S.phase === 'turn' || S.phase === 'retreat') ? S.turnTime : 0;
  const total = S.phase === 'retreat' ? RETREAT : TURN_TIME;
  setText('#tsec', (S.phase === 'turn' || S.phase === 'retreat') ? String(Math.max(0, Math.ceil(tt))) : '');
  setText('#tmatch', fmt(S.matchTime));
  const ring = $('#tring'), frac = clamp(tt / total, 0, 1);
  const dash = `${(frac * 163.4).toFixed(1)} 200`;
  if (hudCache.ring !== dash) { hudCache.ring = dash; ring.setAttribute('stroke-dasharray', dash); }
  $('#timer').classList.toggle('hot', S.phase === 'retreat' || (S.phase === 'turn' && tt <= 5));
  const me = S.bots.find(b => b.human);
  if (me) {
    const k = me.weapon, am = me.ammo[k] === Infinity ? '∞' : String(me.ammo[k]);
    const key = k + am;
    if (hudCache.w !== key) { hudCache.w = key; $('#wslot').innerHTML = `${svg(k)}<span>${WP[k].name}</span><em>${am}</em>`; }
    setText('#boostn', String(me.boost));
    $('#boost').classList.toggle('off', me.boost <= 0);
    if (!$('#tray').hidden) {
      for (const bt of $('#tray').children) {
        const kk = bt.dataset.k, locked = WP[kk].lv > P.lv, n = me.ammo[kk];
        bt.classList.toggle('sel', kk === me.weapon); bt.classList.toggle('locked', locked); bt.disabled = !locked && !(n > 0);
        const em = bt.querySelector('em'), txt = locked ? `Lv${WP[kk].lv}` : (n === Infinity ? '∞' : String(n));
        if (em.textContent !== txt) em.textContent = txt;
      }
    }
  }
}

// ロビー
function showLobby() {
  const box = $('#lobbyPlayers'); box.innerHTML = '';
  for (const b of S.bots) {
    const el = document.createElement('div'); el.className = 'lp'; el.style.setProperty('--c', b.color);
    el.innerHTML = `<canvas></canvas><span></span>`; el.querySelector('span').textContent = b.name;
    box.appendChild(el);
    b.mood = 'ready';
    requestAnimationFrame(() => paintPortrait(el.querySelector('canvas'), b, 1.6, 0.82));
  }
  $('#lobbyStage').textContent = T.st.name;
  $('#lobbyDiff').textContent = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' }[S.diff];
}
function lobbyTick() { setText('#lobbyCount', String(Math.max(0, Math.ceil(S.phaseT)))); }

// 結果
function showResult() {
  $('#hud').hidden = true; showScreen('#result');
  const { rank, reward } = S.result, me = S.bots.find(b => b.human);
  const place = me ? rank.indexOf(me) + 1 : 0;
  const sr = S.result.story;
  $('#resHead').textContent = sr ? (sr.success ? '目標達成！' : '目標ならず') : !me ? '試合終了' : place === 1 ? '勝利！' : `${place}位`;
  const hasNext = sr && sr.success && sr.idx + 1 < STORY.length;
  $('#bAgain').textContent = hasNext ? '次の話へ' : 'もう一戦';
  S.againAction = hasNext ? () => playChapter(sr.idx + 1) : sr ? () => playChapter(sr.idx) : () => startMatch({ stage: S.stageKey, diff: S.diff });
  const pod = $('#podium'); pod.innerHTML = '';
  const order = [1, 0, 2, 3].filter(i => i < rank.length);
  rank.forEach((b, i) => { b.mood = i === 0 ? 'happy' : i === rank.length - 1 ? 'sad' : i === 1 ? 'smug' : 'idle'; });
  for (const i of order) {
    const b = rank[i], el = document.createElement('div'); el.className = `pc p${i + 1}`; el.style.setProperty('--c', b.color);
    el.innerHTML = `<div class="pts"><small>ポイント</small><b>${b.score}</b></div><canvas></canvas><div class="col"><span class="nm"></span><b>${i + 1}</b><small>撃破 ${b.kills}</small></div>`;
    el.querySelector('.nm').textContent = b.name;
    pod.appendChild(el);
    requestAnimationFrame(() => paintPortrait(el.querySelector('canvas'), b, 1.5, 0.85));
  }
  const side = $('#resSide');
  if (!reward) { side.innerHTML = ''; return; }
  const stars = [1, 2, 3].map(n => `<span class="${n <= reward.stars ? 'on' : ''}">${svg('star')}</span>`).join('');
  const nextW = WORDER.map(k => WP[k]).find(w => w.lv > P.lv);
  side.innerHTML = `
    ${sr ? `<p class="goal ${sr.success ? 'ok' : 'ng'}">第${sr.idx + 1}話「${sr.ch.title}」　目標 ${goalText(sr.ch.goal)}　${sr.success ? '達成' : '未達成'}</p>` : ''}
    <div class="stars">${stars}</div>
    <dl>
      <dt>スコア</dt><dd>${me.score}${reward.newBest ? '<i>ベスト更新</i>' : ''}</dd>
      <dt>経験値</dt><dd>+${reward.xp}</dd>
      <dt>${svg('rivet')}リベット</dt><dd>+${reward.rivets}</dd>
      ${reward.gears ? `<dt>${svg('gear')}ギア</dt><dd>+${reward.gears}</dd>` : ''}
      ${sr && sr.first ? `<dt>初クリア報酬</dt><dd>${svg('rivet')}${sr.ch.reward.rivets} ${svg('gear')}${sr.ch.reward.gears}</dd>` : ''}
    </dl>
    <div class="lvbar"><span>Lv ${P.lv}</span><i><i style="width:${(P.xp / xpNeed(P.lv) * 100).toFixed(1)}%"></i></i><small>${P.xp} / ${xpNeed(P.lv)}</small></div>
    ${reward.levelUp ? `<p class="lvup">レベルアップ！ ${reward.unlocked.length ? reward.unlocked.join('、') + ' が解放' : ''}</p>` : ''}
    ${nextW ? `<p class="next">次の解放　<b>${nextW.name}</b>　Lv${nextW.lv}</p>` : ''}`;
}

// ---------------------------------------------------------------- タイトル・ガレージ
let selStage = 'canyon', selDiff = 'normal';
try { selStage = localStorage.getItem('boombolts.stage') || 'canyon'; selDiff = localStorage.getItem('boombolts.diff') || 'normal'; } catch (e) {}
if (!STAGES[selStage]) selStage = 'canyon';
if (!DIFF[selDiff]) selDiff = 'normal';

function stageThumb(key) {
  const t = buildStage(key, 7), st = t.st, c = document.createElement('canvas'), w = 240, h = 120;
  c.width = w; c.height = h; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, st.sky[0]); g.addColorStop(1, st.sky[1]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data, y0 = 380, sc = W / w;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const wx = Math.floor(px * sc), wy = Math.floor(y0 + py * sc * 0.75);
    const o = (py * w + px) * 4;
    if (wy >= WATER) { d[o] = 50; d[o + 1] = 110; d[o + 2] = 130; continue; }
    const v = t.m[wy * W + wx];
    if (v) { const top = !t.m[(wy - 8) * W + wx]; const col = v === 2 ? [128, 86, 50] : top ? st.top : st.rock; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; }
  }
  x.putImageData(img, 0, 0);
  return c;
}
function buildTitle() {
  const box = $('#stages'); box.innerHTML = '';
  for (const key of Object.keys(STAGES).filter(k => !STAGES[k].hidden)) {
    const bt = document.createElement('button'); bt.className = 'stage'; bt.dataset.k = key;
    bt.appendChild(stageThumb(key));
    const sp = document.createElement('span'); sp.textContent = STAGES[key].name; bt.appendChild(sp);
    bt.addEventListener('click', () => { selStage = key; try { localStorage.setItem('boombolts.stage', key); } catch (e) {} refreshTitle(); });
    box.appendChild(bt);
  }
  for (const bt of document.querySelectorAll('#diff button')) bt.addEventListener('click', () => { selDiff = bt.dataset.d; try { localStorage.setItem('boombolts.diff', selDiff); } catch (e) {} refreshTitle(); });
  refreshTitle();
}
function refreshTitle() {
  for (const bt of document.querySelectorAll('#stages .stage')) bt.classList.toggle('sel', bt.dataset.k === selStage);
  for (const bt of document.querySelectorAll('#diff button')) bt.classList.toggle('sel', bt.dataset.d === selDiff);
  const nx = P.story || 0;
  $('#bStory').innerHTML = !P.tut ? 'ストーリー<small>はじめに：ドックの修理工場</small>' : nx >= STORY.length ? 'ストーリー<small>全話クリア</small>' : `ストーリー<small>第${nx + 1}話「${STORY[nx].title}」</small>`;
  $('#tLv').textContent = `Lv ${P.lv}`;
  $('#tRiv').textContent = P.rivets; $('#tGear').textContent = P.gears;
  $('#tXp').style.width = `${(P.xp / xpNeed(P.lv) * 100).toFixed(1)}%`;
  const meBot = { ...BOTS[0], eq: P.eq, color: BOTS[0].color, light: shadeHex(BOTS[0].color, 0.45), dark: shadeHex(BOTS[0].color, -0.35), facing: 1, aim: -0.4, weapon: 'rocket' };
  paintPortrait($('#tBot'), meBot, 2.4, 0.78);
}
function setupTitleDemo() {
  T = buildStage('jungle', 11); paintTerrain(T); T.decos = buildDecos(T, 11); T.bd = buildBackdrop('jungle', 11);
  S.rnd = mulberry(11); S.diff = 'normal';
  S.bots = BOTS.map((d, i) => newBot(d, i, false));
  S.bots.forEach(b => placeBot(b, false));
  S.bots.forEach(b => { b.facing = b.x < W / 2 ? 1 : -1; syncAim(b); });
  S.proj = []; S.parts = []; S.flames = []; S.gases = []; S.crates = []; S.floats = [];
  S.active = null; S.phase = 'title';
}
function goTitle() {
  S.paused = false; $('#hud').hidden = true; $('#lobby').hidden = true; $('#tray').hidden = true; $('#talk').hidden = true; TALK.done = null; S.talkFocus = null; S.chapter = null; S.tutorial = null; S.npc = null; $('#coach').hidden = true; $('#hud').classList.remove('tut');
  setupTitleDemo(); showScreen('#title'); refreshTitle(); playSong('title'); resetClock();
}

let garageSlot = 'head';
function openGarage() { showScreen('#garage'); renderGarage(); }
function renderGarage() {
  $('#gLv').textContent = `Lv ${P.lv}`; $('#gRiv').textContent = P.rivets; $('#gGear').textContent = P.gears;
  $('#gXp').style.width = `${(P.xp / xpNeed(P.lv) * 100).toFixed(1)}%`;
  for (const bt of document.querySelectorAll('#gTabs button')) bt.classList.toggle('sel', bt.dataset.s === garageSlot);
  const meBot = { ...BOTS[0], eq: P.eq, light: shadeHex(BOTS[0].color, 0.45), dark: shadeHex(BOTS[0].color, -0.35), facing: 1, aim: -0.4, weapon: 'rocket' };
  paintPortrait($('#gBot'), meBot, 2.6, 0.74);
  const st = loadoutStats(P.eq, P.owned);
  $('#gStats').innerHTML = STAT_KEYS.map(k => `<div class="st"><span>${STAT_NAME[k]}</span><i><i style="width:${(st[k] / STAT_MAX[k] * 100).toFixed(0)}%"></i></i><b>${k === 'hp' ? 100 + st[k] : '+' + st[k] + '%'}</b></div>`).join('');
  const list = $('#gList'); list.innerHTML = '';
  for (const p of PARTS.filter(q => q.slot === garageSlot)) {
    const owned = p.id in P.owned, lv = P.owned[p.id] || 0, locked = TIER_LV[p.tier] > P.lv, equipped = P.eq[p.slot] === p.id;
    const s = partStats(p.id, lv), nxt = owned && lv < MAX_UP ? partStats(p.id, lv + 1) : null;
    const el = document.createElement('div'); el.className = 'part' + (equipped ? ' eq' : '') + (locked ? ' locked' : '');
    const statTxt = STAT_KEYS.filter(k => s[k] || (nxt && nxt[k])).map(k => `<span>${STAT_NAME[k]} ${k === 'hp' ? '+' + s[k] : '+' + s[k] + '%'}${nxt && nxt[k] !== s[k] ? `<i>→${nxt[k]}${k === 'hp' ? '' : '%'}</i>` : ''}</span>`).join('') || '<span>基本パーツ</span>';
    const pips = owned ? `<span class="pips">${[0, 1, 2].map(n => `<i class="${n < lv ? 'on' : ''}"></i>`).join('')}</span>` : '';
    let action = '';
    if (locked) action = `<button disabled>${svg('lock')}Lv${TIER_LV[p.tier]}</button>`;
    else if (!owned) action = `<button data-a="buy">${svg('rivet')}${p.cost}${p.gears ? ` ${svg('gear')}${p.gears}` : ''}</button>`;
    else {
      action = (equipped ? '<button class="ghost" disabled>装備中</button>' : '<button data-a="eq">装備</button>') +
        (lv < MAX_UP ? `<button data-a="up">強化 ${svg('rivet')}${upCost(p, lv)}</button>` : '<button class="ghost" disabled>最大</button>');
    }
    el.innerHTML = `<canvas></canvas><div class="pi"><div class="pn"><b></b><small>ランク${p.tier}</small>${pips}</div><div class="ps">${statTxt}</div></div><div class="pa">${action}</div>`;
    el.querySelector('.pn b').textContent = p.name;
    list.appendChild(el);
    const pb = { ...meBot, eq: { ...P.eq, [p.slot]: p.id } };
    requestAnimationFrame(() => paintPortrait(el.querySelector('canvas'), pb, 1.5, p.slot === 'legs' ? 0.42 : p.slot === 'head' ? 0.98 : 0.72));
    el.querySelectorAll('button[data-a]').forEach(bt => bt.addEventListener('click', () => partAction(p, bt.dataset.a)));
  }
}
function partAction(p, a) {
  if (a === 'buy') {
    if (P.rivets < p.cost || P.gears < (p.gears || 0)) { toast('リベットかギアが足りません'); return; }
    P.rivets -= p.cost; P.gears -= p.gears || 0; P.owned[p.id] = 0; P.eq[p.slot] = p.id; sfx('buy');
  } else if (a === 'eq') { P.eq[p.slot] = p.id; sfx('pick'); }
  else if (a === 'up') {
    const lv = P.owned[p.id] || 0, cost = upCost(p, lv);
    if (lv >= MAX_UP) return;
    if (P.rivets < cost) { toast('リベットが足りません'); return; }
    P.rivets -= cost; P.owned[p.id] = lv + 1; sfx('buy');
  }
  saveProfile(); renderGarage();
}

// ---------------------------------------------------------------- 入力
const layer = $('#touch');
const pointers = new Map();
const stickEls = { L: $('#stickL'), R: $('#stickR') };
const STICK_R = 62;
function layoutSticks() {
  // 何もしていないときの定位置（左右下）
  for (const k of ['L', 'R']) {
    const el = stickEls[k];
    if (el.dataset.active) continue;
    el.style.left = (k === 'L' ? 34 + STICK_R : view.w - 34 - STICK_R) + 'px';
    el.style.top = (view.h - 30 - STICK_R) + 'px';
  }
}
function setKnob(k, vx, vy) { stickEls[k].firstElementChild.style.transform = `translate(${vx * STICK_R * 0.6}px,${vy * STICK_R * 0.6}px)`; }
function humanTurn() { const b = S.active; return b && b.human && b.alive && (S.phase === 'turn' || S.phase === 'retreat'); }
layer.addEventListener('pointerdown', e => {
  auInit();
  if (!inMatch() || S.paused) return;
  const touch = e.pointerType !== 'mouse';
  document.body.classList.toggle('touch', touch);
  if (!$('#tray').hidden) { $('#tray').hidden = true; return; }
  let role = touch ? (e.clientX < view.w * 0.42 ? 'L' : 'R') : 'M';
  for (const p of pointers.values()) if (p.role === role || (role !== 'L' && p.role !== 'L')) return;
  const p = { role, x0: e.clientX, y0: e.clientY, jumped: false };
  pointers.set(e.pointerId, p);
  try { layer.setPointerCapture(e.pointerId); } catch (er) {}
  if (role === 'R' || role === 'M') showHint(false);
  if (role !== 'M') {
    const el = stickEls[role]; el.dataset.active = '1'; el.classList.add('act');
    el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px';
  }
  e.preventDefault();
}, { passive: false });
layer.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const r = p.role === 'M' ? 160 : STICK_R;
  let vx = (e.clientX - p.x0) / r, vy = (e.clientY - p.y0) / r;
  const m = hyp(vx, vy);
  if (p.role === 'L') {
    if (m > 1) { vx /= m; vy /= m; }
    I.move = Math.abs(vx) > 0.25 ? vx : 0;
    if (vy < -0.6 && !p.jumped && humanTurn()) { I.jump = true; p.jumped = true; }
    if (vy > -0.3) p.jumped = false;
    I.stickJump = vy < -0.45; keyMove();
    setKnob('L', vx, vy);
  } else {
    if (p.role === 'R') setKnob('R', m > 1 ? vx / m : vx, m > 1 ? vy / m : vy);
    const pw = Math.min(1, m);
    I.stick = (pw > 0.06 && humanTurn() && S.phase === 'turn') ? { a: Math.atan2(vy, vx), p: pw } : null;
  }
});
function endPointer(e) {
  const p = pointers.get(e.pointerId); if (!p) return;
  pointers.delete(e.pointerId);
  if (p.role === 'L') { I.move = 0; I.stickJump = false; keyMove(); }
  else if (I.stick) { if (I.stick.p >= 0.18 && e.type === 'pointerup') I.fireReq = { a: I.stick.a, p: I.stick.p }; I.stick = null; }
  if (p.role !== 'M') { const el = stickEls[p.role]; delete el.dataset.active; el.classList.remove('act'); setKnob(p.role, 0, 0); layoutSticks(); }
}
layer.addEventListener('pointerup', endPointer);
layer.addEventListener('pointercancel', endPointer);
layer.addEventListener('contextmenu', e => e.preventDefault());

function keyMove() { I.moveKey = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); I.aimKey = (keys.up ? 1 : 0) - (keys.down ? 1 : 0); I.jumpHeld = !!keys.jump || I.stickJump; }
window.addEventListener('keydown', e => {
  auInit();
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (!inMatch()) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); e.preventDefault(); return; }
  if (S.paused) return;
  document.body.classList.remove('touch');
  const c = e.code;
  if (c === 'KeyA' || c === 'ArrowLeft') keys.left = true;
  else if (c === 'KeyD' || c === 'ArrowRight') keys.right = true;
  else if (c === 'ArrowUp') keys.up = true;
  else if (c === 'ArrowDown') keys.down = true;
  else if (c === 'Space' || c === 'KeyW' || c === 'Enter') { keys.jump = true; if (!e.repeat && humanTurn()) I.jump = true; }
  else if (c === 'KeyF' && !e.repeat) {
    const b = S.active;
    if (humanTurn() && canFire(b)) { if (WP[b.weapon].fixed) I.fireReq = { a: b.aim, p: 1 }; else S.charge = 0; }
  }
  else if (/^Digit\d$/.test(c)) { const n = +c.slice(5); selectWeapon(WORDER[(n + 9) % 10]); }
  else if (c === 'KeyQ' || c === 'KeyE') cycleWeapon(c === 'KeyE' ? 1 : -1);
  else if (c === 'KeyV') S.cam.over = !S.cam.over;
  else if (c === 'Minus' || c === 'NumpadSubtract') S.cam.zoom = clamp(S.cam.zoom * 0.85, 0.45, 1.6);
  else if (c === 'Equal' || c === 'NumpadAdd' || c === 'Semicolon') S.cam.zoom = clamp(S.cam.zoom * 1.18, 0.45, 1.6);
  else if (c === 'KeyR') useBoost();
  else return;
  keyMove(); e.preventDefault();
});
window.addEventListener('keyup', e => {
  const c = e.code;
  if (c === 'KeyA' || c === 'ArrowLeft') keys.left = false;
  else if (c === 'KeyD' || c === 'ArrowRight') keys.right = false;
  else if (c === 'ArrowUp') keys.up = false;
  else if (c === 'ArrowDown') keys.down = false;
  else if (c === 'Space' || c === 'KeyW' || c === 'Enter') keys.jump = false;
  else if (c === 'KeyF' && S.charge != null) { const b = S.active; if (b) I.fireReq = { a: b.aim, p: Math.max(0.15, S.charge) }; }
  keyMove();
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; I.stickJump = false; keyMove(); S.charge = null; });
window.addEventListener('wheel', e => { if (inMatch() && !S.paused && !e.target.closest('#tray')) { S.cam.over = false; S.cam.zoom = clamp(S.cam.zoom * (e.deltaY > 0 ? 0.88 : 1.12), 0.45, 1.6); } }, { passive: true });
function cycleWeapon(d) {
  const me = S.bots.find(b => b.human); if (!me) return;
  let i = WORDER.indexOf(me.weapon);
  for (let n = 0; n < WORDER.length; n++) { i = (i + d + WORDER.length) % WORDER.length; if (WP[WORDER[i]].lv <= P.lv && me.ammo[WORDER[i]] > 0) { me.weapon = WORDER[i]; S.charge = null; return; } }
}
function togglePause() {
  if (!inMatch() || S.phase === 'over') return;
  S.paused = !S.paused;
  $('#pause').hidden = !S.paused;
  I.stick = null; S.charge = null;
}
function toggleMute() {
  AU.muted = !AU.muted;
  try { localStorage.setItem('boombolts.mute', AU.muted ? '1' : '0'); } catch (e) {}
  $('#bMute').innerHTML = svg(AU.muted ? 'mute' : 'sound');
  if (AU.master) AU.master.gain.value = AU.muted ? 0 : 0.9;
  if ($('#tMute')) $('#tMute').innerHTML = svg(AU.muted ? 'mute' : 'sound');
}
document.addEventListener('visibilitychange', () => { if (document.hidden && inMatch() && !S.paused && S.phase !== 'over' && S.phase !== 'lobby') togglePause(); });

// ボタン
$('#bPause').innerHTML = svg('pause'); $('#bView').innerHTML = svg('view'); $('#bMute').innerHTML = svg(AU.muted ? 'mute' : 'sound');
$('#boostIco').innerHTML = svg('wrench');
for (const el of document.querySelectorAll('[data-ico]')) el.innerHTML = svg(el.dataset.ico);
$('#bPause').addEventListener('click', togglePause);
$('#tMute').innerHTML = svg(AU.muted ? 'mute' : 'sound');
$('#tMute').addEventListener('click', () => { auInit(); toggleMute(); });
// 最初の操作で音を起こす（ブラウザは操作前に音を出せない）
document.addEventListener('pointerdown', () => auInit(), { capture: true });
document.addEventListener('click', e => { if (e.target.closest('button')) sfx('click'); }, { capture: true });
$('#bView').addEventListener('click', () => { S.cam.over = !S.cam.over; });
$('#mini').addEventListener('click', () => { S.cam.over = !S.cam.over; });
$('#bMute').addEventListener('click', () => { auInit(); toggleMute(); });
$('#wslot').addEventListener('click', () => { auInit(); const t = $('#tray'); t.hidden = !t.hidden; updateHud(); });
$('#boost').addEventListener('click', () => { auInit(); useBoost(); });
$('#bResume').addEventListener('click', togglePause);
$('#bQuit').addEventListener('click', () => { $('#pause').hidden = true; goTitle(); });
$('#bStart').addEventListener('click', () => { auInit(); showScreen('#free'); refreshTitle(); });
$('#bFreeGo').addEventListener('click', () => { auInit(); startMatch({ stage: selStage, diff: selDiff }); });
$('#bFreeBack').addEventListener('click', () => { showScreen('#title'); refreshTitle(); });
$('#bGarage').addEventListener('click', () => { auInit(); openGarage(); });
$('#bShop').addEventListener('click', () => { auInit(); openShop(); });
$('#bShopBack').addEventListener('click', () => { showScreen('#title'); refreshTitle(); });
for (const bt of document.querySelectorAll('#shopTabs button')) bt.addEventListener('click', () => { shopTab = bt.dataset.t; renderShop(); });
$('#reveal').addEventListener('click', () => { $('#reveal').hidden = true; });
setInterval(() => { if (!$('#shop').hidden) $('#sSale').textContent = saleLeft(); if (!$('#title').hidden) $('#tSale').textContent = saleLeft(); }, 1000);
$('#bGBack').addEventListener('click', () => { showScreen('#title'); refreshTitle(); });
for (const bt of document.querySelectorAll('#gTabs button')) bt.addEventListener('click', () => { garageSlot = bt.dataset.s; renderGarage(); });
$('#bAgain').addEventListener('click', () => { (S.againAction || (() => startMatch({ stage: S.stageKey, diff: S.diff })))(); });
$('#bResGarage').addEventListener('click', () => { goTitle(); openGarage(); });
$('#bResTitle').addEventListener('click', () => { const story = S.chapter != null; goTitle(); if (story) openStory(); });
$('#bStory').addEventListener('click', () => { auInit(); openStory(); });
$('#bStoryBack').addEventListener('click', () => { showScreen('#title'); refreshTitle(); });
$('#talk').addEventListener('click', e => { if (e.target.closest('#talkSkip')) { talkEnd(); return; } talkNext(); });
window.addEventListener('keydown', e => { if (!$('#talk').hidden && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); e.stopImmediatePropagation(); talkNext(); } }, { capture: true });

// ---------------------------------------------------------------- ループ
let acc = 0, lastT = 0;
// 地形づくりなど重い処理のあとに、止まっていた時間を早回しで取り戻さない
function resetClock() { acc = 0; lastT = 0; }
function frame() {
  const now = performance.now();
  requestAnimationFrame(frame);
  if (!lastT) lastT = now;
  let d = (now - lastT) / 1000; lastT = now;
  if (d > 0.25) d = 0.25;
  if (!S.manual && !(inMatch() && !$('#rotate').hidden)) {
    acc += d;
    let n = 0;
    while (acc >= STEP && n < 6) { update(STEP); acc -= STEP; n++; }
    if (n === 6) acc = 0;
  }
  render(); updateHud(); talkTick();
}

// ---------------------------------------------------------------- 検証用
window.bb = {
  S, P, WP, PARTS, get T() { return T; },
  start(o = {}) { startMatch(o); },
  run(n, inp) { const was = S.silent; S.silent = true; for (let i = 0; i < n; i++) { if (inp) Object.assign(I, inp); update(STEP); } S.silent = was; },
  pause(v) { S.manual = v; },
  solidCount() { let n = 0; for (let i = 0; i < T.m.length; i++) n += T.m[i] ? 1 : 0; return n; },
  fire(a, p, k) { const b = S.active; if (k) b.weapon = k; return fireWeapon(b, a, p); },
  toTurn(i) { while (S.turnIdx !== i || S.phase !== 'turn') { if (S.phase === 'banner') S.phaseT = 0; else if (S.phase === 'turn' || S.phase === 'retreat') S.turnTime = 0; else if (S.phase === 'settle') S.phaseT = 99; else if (S.phase === 'lobby') S.phaseT = 0; update(STEP); } },
  resetProfile() { P = freshProfile(); this.P = P; saveProfile(); refreshTitle(); },
  setProfile(o) { Object.assign(P, o); saveProfile(); refreshTitle(); },
  get profile() { return P; },
  render, update, showResult, openGarage, goTitle, finish, moodOf, auInit, playSong, sfx, get AU() { return AU; },
  SFX_NAMES: ['boom', 'launch', 'throw', 'shot', 'jump', 'land', 'step', 'bounce', 'splash', 'beep', 'pick', 'turn', 'myturn', 'tick', 'clang', 'whoosh', 'warp', 'fire', 'gas', 'hurt', 'yay', 'scream', 'ko', 'crate', 'click', 'buy', 'win', 'lose'],
  carveAt(x, y, r) { carve(x, y, r); }, openShop, buyAmmo, buyPack, PACKS, offerAmmo, saleWeapon, speak, startTutorial, simShot, get TUT() { return S.tutorial; }, STORY, talkNext, talkEnd, playChapter, openStory,
};

// ---------------------------------------------------------------- 起動
loadProfile();
if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('touch');
window.addEventListener('resize', resize);
resize();
buildTitle();
goTitle();
requestAnimationFrame(frame);
window.__bbReady = true;
})();
