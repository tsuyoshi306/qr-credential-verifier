// COSE署名検証ロジックの自己テスト（実データ不要・Node実行）
//   node test/cose.test.mjs
import { encode as cborEncode } from 'cbor-x'
import { TRUST_KEYS } from '../src/trust-config.js'
import { analyzeCredential, parseCoseSign1, decodePayload } from '../src/cose.js'

const { subtle } = globalThis.crypto
let pass = 0, fail = 0
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)) }

// --- テスト用 ES256 鍵ペアを生成し、JWKをトラストリストに注入 ---
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pubJwk = await subtle.exportKey('jwk', kp.publicKey)
TRUST_KEYS.push({ kid: 'test-key', kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y })

// --- ダミー登録情報を COSE_Sign1(ES256) で署名して QR URL を作る ---
function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function makeCredentialUrl(payloadObj, { tamper = false } = {}) {
  const protectedMap = new Map([[1, -7]]) // alg: ES256
  const protectedBstr = new Uint8Array(cborEncode(protectedMap))
  const payloadBytes = new Uint8Array(cborEncode(payloadObj))
  const sigStructure = ['Signature1', protectedBstr, new Uint8Array(), payloadBytes]
  const toSign = new Uint8Array(cborEncode(sigStructure))
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, toSign))
  let finalPayload = payloadBytes
  if (tamper) { finalPayload = new Uint8Array(cborEncode({ ...payloadObj, qualification: '改竄された資格' })) }
  const coseSign1 = [protectedBstr, new Map([[4, new Uint8Array(Buffer.from('test-key'))]]), finalPayload, sig]
  const c = b64url(cborEncode(coseSign1))
  return `https://dqcvs.nqs.go.jp/w/?c=${c}`
}

const sample = {
  qualification: '介護福祉士', name: '山田 花子', registrationNumber: '第88888号',
  issueDate: '2024/03/06', issuer: 'ダミー庁'
}

console.log('Test 1: 正常な署名付きQRの解析')
{
  const url = await makeCredentialUrl(sample)
  const a = await analyzeCredential(url)
  ok(a.isCredential === true, 'isCredential=true')
  ok(!a.error, 'パースエラーなし')
  ok(a.alg === 'ES256', `alg=ES256 (got ${a.alg})`)
  ok(a.signature.status === 'ok', `署名検証OK (got ${a.signature.status})`)
  const qual = a.fields.find(f => f.label === '資格名称')
  ok(qual && qual.value === '介護福祉士', `資格名称を抽出 (got ${qual?.value})`)
  const name = a.fields.find(f => f.label === '氏名')
  ok(name && name.value === '山田 花子', `氏名を抽出 (got ${name?.value})`)
}

console.log('Test 2: 改竄されたpayloadは署名NG')
{
  const url = await makeCredentialUrl(sample, { tamper: true })
  const a = await analyzeCredential(url)
  ok(a.signature.status === 'ng', `改竄検知=NG (got ${a.signature.status})`)
}

console.log('Test 3: 非資格者証URL')
{
  const a = await analyzeCredential('https://example.com/foo')
  ok(a.isCredential === false, 'isCredential=false')
}

console.log('Test 4: 壊れたc=パラメータ')
{
  const a = await analyzeCredential('https://dqcvs.nqs.go.jp/w/?c=!!!notbase64!!!')
  ok(a.isCredential === true && (a.error || a.signature), '壊れた入力でクラッシュしない')
}

console.log('Test 5: 鍵未設定ならスキップ')
{
  TRUST_KEYS.length = 0 // 鍵を全削除
  const url = await makeCredentialUrl(sample) // 署名は鍵削除前のkpで作成済み
  const a = await analyzeCredential(url)
  ok(a.signature.status === 'skipped', `鍵なし=skipped (got ${a.signature.status})`)
}

console.log('Test 6: PS256(RSA-PSS)署名の検証（実物と同じ方式）')
{
  TRUST_KEYS.length = 0
  const rsa = await subtle.generateKey(
    { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'])
  const pub = await subtle.exportKey('jwk', rsa.publicKey)
  TRUST_KEYS.push({ kid: 'P-000001', kty: 'RSA', n: pub.n, e: pub.e })
  // 実物と同じ payload キーで COSE_Sign1(PS256) を作る
  const payloadObj = { CN: '小型船舶操縦士', UN: '海事　太郎', RN: '0200000000000', UB: '1990/01/01' }
  const protectedMap = new Map([[1, -37]]) // PS256
  const protectedBstr = new Uint8Array(cborEncode(protectedMap))
  const payloadBytes = new Uint8Array(cborEncode(payloadObj))
  const sigStruct = ['Signature1', protectedBstr, new Uint8Array(), payloadBytes]
  const sig = new Uint8Array(await subtle.sign(
    { name: 'RSA-PSS', saltLength: 32 }, rsa.privateKey, new Uint8Array(cborEncode(sigStruct))))
  const cose = [protectedBstr, new Map([[4, new Uint8Array(Buffer.from('P-000001'))]]), payloadBytes, sig]
  const url = `https://dqcvs.nqs.go.jp/w/?c=${b64url(cborEncode(cose))}`
  const a = await analyzeCredential(url)
  ok(a.alg === 'PS256', `alg=PS256 (got ${a.alg})`)
  ok(a.signature.status === 'ok', `PS256署名検証OK (got ${a.signature.status})`)
  const cn = a.fields.find(f => f.label === '資格名称')
  ok(cn && cn.value === '小型船舶操縦士', `実キーCN→資格名称 (got ${cn?.value})`)
  const rn = a.fields.find(f => f.label === '登録番号')
  ok(rn && rn.value === '0200000000000', `実キーRN→登録番号 (got ${rn?.value})`)
  TRUST_KEYS.length = 0
}

console.log(`\n結果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
