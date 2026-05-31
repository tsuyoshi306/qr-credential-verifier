// 検証結果HTMLパーサのテスト
//   実HTMLは個人情報を含むため samples/ (gitignore) に置き、無ければ内蔵の匿名HTMLで検証する。
//   node worker/test/parse.test.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseVerifyResult } from '../src/parse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)) }

// 匿名のサンプル結果HTML（実サイトと同じ構造）
const SAMPLE = `<!DOCTYPE html><html><body>
<h1 class="page-heading">有効性確認</h1>
<ul><li><time datetime="2026-06-01T01:00:57">確認日時：2026/06/01 01:00:57</time></li>
<li>検証結果：有効です</li></ul>
<div><h2 id="qualificationInfo">登録情報</h2>
<table aria-labelledby="qualificationInfo">
<tr><th scope="row">発行機関</th><td>国土交通省</td></tr>
<tr><th scope="row">資格名</th><td>小型船舶操縦士</td></tr>
<tr><th scope="row">名前</th><td>海事　太郎</td></tr>
<tr><th scope="row">登録番号</th><td>0200000000000</td></tr>
</table>
<details class="certificate-info"><summary><h2><span>証明書情報</span></h2></summary>
<table><caption>国家資格等情報連携・活用システムの証明書</caption>
<tr><th scope="row">発行者別名</th><td>OU=官職認証局,O=日本国政府,C=JP</td></tr>
<tr><th scope="row">所有者別名</th><td>CN=統括官,OU=デジタル庁,O=日本国政府,C=JP</td></tr>
</table>
<table><caption>発行者情報</caption>
<tr><th scope="row">発行者(DN)</th><td>OU=OfficialStatusCA,O=Japanese Government,C=JP</td></tr>
</table>
</details></div></body></html>`

function run(html, label) {
  console.log(label)
  const r = parseVerifyResult(html)
  ok(r.valid === true, `valid=true (got ${r.valid})`)
  ok(r.resultText.includes('有効'), `resultText に有効 (got "${r.resultText}")`)
  ok(/2026/.test(r.checkedAt), `確認日時を抽出 (got "${r.checkedAt}")`)
  ok(r.registration.length >= 4, `登録情報 ${r.registration.length}件`)
  const qual = r.registration.find(x => x.key === '資格名')
  ok(qual && qual.value.includes('小型船舶'), `資格名を抽出 (got ${qual?.value})`)
  ok(r.certificates.length >= 2, `証明書テーブル ${r.certificates.length}個`)
  const issuer = r.certificates[0].rows.find(x => x.key === '発行者別名')
  ok(issuer && issuer.value.includes('官職認証局'), `発行者別名=官職認証局 (got ${issuer?.value})`)
}

run(SAMPLE, 'Test A: 匿名サンプルHTML')

const realPath = path.join(__dirname, '../../samples/verify-result.real.html')
if (fs.existsSync(realPath)) {
  run(fs.readFileSync(realPath, 'utf8'), 'Test B: 実物HTML (samples/)')
} else {
  console.log('Test B: スキップ（samples/verify-result.real.html が無い）')
}

// 無効ケース
console.log('Test C: 無効ケース')
{
  const html = SAMPLE.replace('検証結果：有効です', '検証結果：無効です（資格が取り消されています）')
  const r = parseVerifyResult(html)
  ok(r.valid === false, `valid=false (got ${r.valid})`)
  ok(r.resultText.includes('無効'), `resultText に無効 (got "${r.resultText}")`)
}

console.log(`\n結果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
