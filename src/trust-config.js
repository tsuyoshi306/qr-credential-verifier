// デジタル庁 デジタル資格者証 署名検証用 公開鍵（トラストリスト）
//
// ⚠️ 2026-05 時点で、デジタル庁は資格者証COSE署名の公開鍵/トラストリストを
//    一般公開していません。検証サイト(dqcvs.nqs.go.jp)がサーバ側で保持しています。
//    そのため既定では空配列＝「署名検証スキップ」となります。
//
// 公開鍵が公表されたら、ここに JWK 形式で追記してください（複数可）。
// COSE protected ヘッダの kid（キーID）と照合します。kid が無い場合は全鍵を試行します。
//
// JWK 例（P-256 / ES256）:
//   {
//     kid: "AQAB-example",            // COSEヘッダの kid（base64url文字列）と一致させる
//     kty: "EC",
//     crv: "P-256",
//     x: "...",   // base64url
//     y: "..."    // base64url
//   }
//
// 取得元メモ:
//   - デジタル庁 国家資格等オンライン・デジタル化 技術仕様（公表され次第URLを記載）
//   - 認証局(発行CA)の証明書から公開鍵を抽出する場合は kid を証明書のものに合わせる

export const TRUST_KEYS = []

// kid（バイト列）から JWK を検索。kid 未指定なら null を返し、呼び出し側で全鍵試行する。
export function findKey(kidBytes) {
  if (!TRUST_KEYS.length) return null
  if (!kidBytes) return null
  const kid = bytesToB64url(kidBytes)
  return TRUST_KEYS.find(k => k.kid === kid) || null
}

function bytesToB64url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
