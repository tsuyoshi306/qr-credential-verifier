// デジタル庁 デジタル資格者証 署名検証用 公開鍵（トラストリスト）
//
// ── 実物QR解析で判明した事実（2026-06 / 小型船舶操縦士の資格者証）──────────
//   署名方式 : PS256（RSA-2048 / RSASSA-PSS, SHA-256）
//   kid      : "P-000001"（COSE unprotected ヘッダ label 4, ASCII文字列）
//   証明書   : QRには同梱されていない（x5chain なし）
//   公開鍵   : 一般公開されていない。検証サイト(dqcvs.nqs.go.jp)が
//              サーバ側で保持し、「検証実施」フォームPOSTで検証する方式。
//
// ⚠️ したがって現状アプリ単独での署名検証は不可能（公開鍵が入手できない）。
//    公開鍵が公表されたら、下記 TRUST_KEYS に JWK を追記すれば検証が有効化される。
//    PS256対応済みなので、RSA公開鍵(n,e)を入れるだけでよい。
//
// JWK 例（RSA / PS256・実物に対応）:
//   {
//     kid: "P-000001",   // COSEヘッダの kid（ASCII文字列）と一致させる
//     kty: "RSA",
//     n: "...",          // 係数 modulus（base64url）
//     e: "AQAB"          // 公開指数（base64url, 通常 AQAB）
//   }
// JWK 例（EC / ES256）: { kid, kty:"EC", crv:"P-256", x, y }

export const TRUST_KEYS = []

// kid（バイト列）から JWK を検索。ASCII文字列・base64url の双方で照合する。
// kid 未指定 or 一致なしなら null を返し、呼び出し側で全鍵試行する。
export function findKey(kidBytes) {
  if (!TRUST_KEYS.length || !kidBytes) return null
  const asAscii = bytesToAscii(kidBytes)
  const asB64url = bytesToB64url(kidBytes)
  return TRUST_KEYS.find(k => k.kid === asAscii || k.kid === asB64url) || null
}

function bytesToAscii(bytes) {
  try { return new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) }
  catch { return '' }
}

function bytesToB64url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
