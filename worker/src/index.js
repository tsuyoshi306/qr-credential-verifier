// Cloudflare Worker: デジタル庁検証サイトへの中継プロキシ
// PWA から { checkdata } を受け取り、dqcvs.nqs.go.jp/w/verify へ form POST、
// 結果HTMLを解析して JSON で返す（CORS付与）。
import { parseVerifyResult } from './parse.js'

const VERIFY_URL = 'https://dqcvs.nqs.go.jp/w/verify'

// 許可するオリジン（GitHub Pages 本番 + ローカル開発）
const ALLOWED_ORIGINS = [
  'https://tsuyoshi306.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  }
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, cors)
    }

    let checkdata
    try {
      const body = await request.json()
      checkdata = body.checkdata
    } catch {
      return json({ error: 'invalid JSON body' }, 400, cors)
    }
    if (!checkdata || typeof checkdata !== 'string') {
      return json({ error: 'checkdata required' }, 400, cors)
    }

    // 検証サイトへ form POST（個人データはログに残さない）
    let html
    try {
      const form = new URLSearchParams()
      form.set('checkdata', checkdata)
      form.set('execute', '')
      const upstream = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (compatible; qr-credential-verifier)'
        },
        body: form.toString()
      })
      if (!upstream.ok) {
        return json({ error: `検証サイトがエラーを返しました (HTTP ${upstream.status})` }, 502, cors)
      }
      html = await upstream.text()
    } catch (e) {
      return json({ error: '検証サイトへの接続に失敗しました' }, 502, cors)
    }

    const parsed = parseVerifyResult(html)
    if (!parsed.resultText && parsed.registration.length === 0) {
      return json({ error: '検証結果を解析できませんでした（サイト仕様変更の可能性）' }, 502, cors)
    }
    return json(parsed, 200, cors)
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }
  })
}
