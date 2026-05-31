import { decode as cborDecode, encode as cborEncode, Encoder, addExtension, Tag } from 'cbor-x'
import { TRUST_KEYS, findKey } from './trust-config.js'

const VERIFICATION_HOST = 'dqcvs.nqs.go.jp'

// COSE algorithm registry (RFC 8152 / IANA)
// kind: 'ec' = ECDSA(楕円曲線) / 'rsa-pss' = RSASSA-PSS / 'rsa-pkcs1' = RSASSA-PKCS1-v1_5
const COSE_ALG = {
  '-7':   { name: 'ES256', kind: 'ec', crv: 'P-256', hash: 'SHA-256' },
  '-35':  { name: 'ES384', kind: 'ec', crv: 'P-384', hash: 'SHA-384' },
  '-36':  { name: 'ES512', kind: 'ec', crv: 'P-521', hash: 'SHA-512' },
  '-37':  { name: 'PS256', kind: 'rsa-pss', hash: 'SHA-256', saltLength: 32 },
  '-38':  { name: 'PS384', kind: 'rsa-pss', hash: 'SHA-384', saltLength: 48 },
  '-39':  { name: 'PS512', kind: 'rsa-pss', hash: 'SHA-512', saltLength: 64 },
  '-257': { name: 'RS256', kind: 'rsa-pkcs1', hash: 'SHA-256' },
  '-258': { name: 'RS384', kind: 'rsa-pkcs1', hash: 'SHA-384' },
  '-259': { name: 'RS512', kind: 'rsa-pkcs1', hash: 'SHA-512' }
}

// payloadキーの日本語ラベル。
// 実物のデジタル資格者証（小型船舶操縦士）解析で判明した2文字コードに対応。
//   CN=資格名称, UN=氏名, UB=生年月日, RN=登録番号, RD=登録年月日,
//   ID=発行年月日, IA=交付機関, IN=交付者名, CI=資格ID, DN=証明書ID, DT=種別, UC=利用者コード
const LABELS = {
  // 実キー（デジタル資格者証）
  CN: '資格名称', UN: '氏名', UB: '生年月日',
  RN: '登録番号', RD: '登録年月日', ID: '発行年月日',
  IA: '交付機関', IN: '交付者名', CI: '資格ID',
  DN: '証明書ID', DT: '種別コード', UC: '利用者コード',
  // 後方互換（推測キー）
  qualification: '資格名称', name: '氏名', birthDate: '生年月日',
  registrationNumber: '登録番号', issueDate: '発行年月日', issuer: '交付機関'
}

// 表示順（実キー優先）
const LABEL_ORDER = ['CN', 'UN', 'UB', 'RN', 'RD', 'ID', 'IA', 'IN', 'CI', 'DT', 'DN', 'UC']

/** QR文字列が資格者証の検証URLかどうか */
export function isCredentialUrl(url) {
  try {
    return new URL(url).hostname === VERIFICATION_HOST
  } catch {
    return false
  }
}

/** URLから c= パラメータを取り出して bytes にデコード。失敗時 null */
export function extractCoseBytes(url) {
  let c
  try {
    c = new URL(url).searchParams.get('c')
  } catch {
    return null
  }
  if (!c) return null
  return base64AnyToBytes(c)
}

function base64AnyToBytes(s) {
  // base64url / base64 どちらも許容
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/**
 * COSE_Sign1 をパースする。
 * 返り値: { protected, unprotected, payloadBytes, signature, alg, kid }
 */
export function parseCoseSign1(bytes) {
  let obj = cborDecode(bytes)
  // CBOR tag 18 (COSE_Sign1) でラップされている場合に対応
  if (obj instanceof Tag) obj = obj.value
  if (!Array.isArray(obj) || obj.length !== 4) {
    throw new Error('COSE_Sign1 形式ではありません（4要素配列ではない）')
  }
  const [protectedBstr, unprotected, payloadBytes, signature] = obj
  let protectedMap = {}
  if (protectedBstr && protectedBstr.length) {
    try { protectedMap = cborDecode(protectedBstr) } catch { protectedMap = {} }
  }
  const algValue = mapGet(protectedMap, 1) ?? mapGet(unprotected, 1)
  const kid = mapGet(protectedMap, 4) ?? mapGet(unprotected, 4)
  return {
    protectedBstr: protectedBstr || new Uint8Array(),
    protectedMap,
    unprotected,
    payloadBytes,
    signature,
    alg: algValue != null ? String(algValue) : null,
    algInfo: algValue != null ? COSE_ALG[String(algValue)] : null,
    kid: kid instanceof Uint8Array ? kid : (kid ? new Uint8Array(kid) : null)
  }
}

function mapGet(map, key) {
  if (!map) return undefined
  if (map instanceof Map) return map.get(key)
  if (typeof map === 'object') return map[key]
  return undefined
}

/** payload(bytes) を CBOR デコードして表示用の {label, value} 配列にする */
export function decodePayload(payloadBytes) {
  if (!payloadBytes || !payloadBytes.length) return { raw: null, fields: [] }
  let data
  try {
    data = cborDecode(payloadBytes)
  } catch {
    // CBORでなければUTF-8文字列として扱う
    const text = new TextDecoder().decode(payloadBytes)
    return { raw: text, fields: [{ label: 'データ', value: text }] }
  }
  const entries = data instanceof Map ? [...data.entries()]
    : (data && typeof data === 'object' ? Object.entries(data) : [])
  // 既知キーを表示順に並べ、残りは元の順で後ろに付ける
  const map = new Map(entries.map(([k, v]) => [String(k), v]))
  const fields = []
  const used = new Set()
  for (const key of LABEL_ORDER) {
    if (map.has(key)) {
      fields.push({ label: LABELS[key], value: formatValue(map.get(key)) })
      used.add(key)
    }
  }
  for (const [k, v] of map) {
    if (used.has(k)) continue
    fields.push({ label: LABELS[k] || String(k), value: formatValue(v) })
  }
  return { raw: data, fields }
}

function formatValue(v) {
  if (v == null) return ''
  if (v instanceof Date) return v.toLocaleDateString('ja-JP')
  if (v instanceof Uint8Array) return '0x' + [...v].map(b => b.toString(16).padStart(2, '0')).join('')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * COSE_Sign1 の署名を検証する。
 * 返り値: { status: 'ok'|'ng'|'skipped'|'error', reason }
 *   - 公開鍵未設定: 'skipped'
 *   - 検証成功: 'ok'  / 失敗: 'ng'
 */
export async function verifySignature(parsed) {
  if (!TRUST_KEYS.length) {
    return { status: 'skipped', reason: '公開鍵が未設定のため署名検証をスキップしました' }
  }
  if (!parsed.algInfo) {
    return { status: 'error', reason: `未対応の署名アルゴリズム(alg=${parsed.alg})` }
  }
  const jwk = findKey(parsed.kid) || TRUST_KEYS[0]
  const info = parsed.algInfo
  try {
    let importAlgo, verifyAlgo, jwkImport
    if (info.kind === 'ec') {
      importAlgo = { name: 'ECDSA', namedCurve: info.crv }
      verifyAlgo = { name: 'ECDSA', hash: info.hash }
      jwkImport = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true }
    } else if (info.kind === 'rsa-pss') {
      importAlgo = { name: 'RSA-PSS', hash: info.hash }
      verifyAlgo = { name: 'RSA-PSS', saltLength: info.saltLength }
      jwkImport = { kty: jwk.kty, n: jwk.n, e: jwk.e, ext: true }
    } else if (info.kind === 'rsa-pkcs1') {
      importAlgo = { name: 'RSASSA-PKCS1-v1_5', hash: info.hash }
      verifyAlgo = { name: 'RSASSA-PKCS1-v1_5' }
      jwkImport = { kty: jwk.kty, n: jwk.n, e: jwk.e, ext: true }
    } else {
      return { status: 'error', reason: `未対応の署名種別(${info.name})` }
    }
    const key = await crypto.subtle.importKey('jwk', jwkImport, importAlgo, false, ['verify'])
    // Sig_structure = ["Signature1", protected, external_aad(空bstr), payload]
    const sigStructure = ['Signature1', parsed.protectedBstr, new Uint8Array(), parsed.payloadBytes]
    const toVerify = cborEncode(sigStructure)
    const ok = await crypto.subtle.verify(verifyAlgo, key, parsed.signature, toVerify)
    return ok
      ? { status: 'ok', reason: `署名は正当です（${info.name}・データは改竄されていません）` }
      : { status: 'ng', reason: '署名検証に失敗しました（改竄の疑い、または鍵不一致）' }
  } catch (e) {
    return { status: 'error', reason: '署名検証中にエラー: ' + e.message }
  }
}

/**
 * QR文字列を受け取り、解析〜署名検証まで行う高レベル関数。
 * 返り値: { isCredential, fields, alg, signature: {status,reason}, error }
 */
export async function analyzeCredential(qrData) {
  if (!isCredentialUrl(qrData)) {
    return { isCredential: false }
  }
  const bytes = extractCoseBytes(qrData)
  if (!bytes) {
    return { isCredential: true, error: 'c= パラメータの取得/デコードに失敗しました', fields: [] }
  }
  try {
    const parsed = parseCoseSign1(bytes)
    const { fields } = decodePayload(parsed.payloadBytes)
    const signature = await verifySignature(parsed)
    return {
      isCredential: true,
      fields,
      alg: parsed.algInfo ? parsed.algInfo.name : parsed.alg,
      signature
    }
  } catch (e) {
    return {
      isCredential: true,
      error: 'COSE解析に失敗しました: ' + e.message,
      rawHex: '0x' + [...bytes.slice(0, 64)].map(b => b.toString(16).padStart(2, '0')).join(''),
      fields: []
    }
  }
}
