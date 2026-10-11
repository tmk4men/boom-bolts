// 公開の前に、読み込むファイルへキャッシュバスター（?v=日時）を付け直す。node release.mjs
import { readFileSync, writeFileSync } from 'node:fs'
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12)
const f = 'index.html', s = readFileSync(f, 'utf8')
writeFileSync(f, s.replace(/game\.js\?v=\w+/g, `game.js?v=${v}`)); console.log(f, '->', v)
