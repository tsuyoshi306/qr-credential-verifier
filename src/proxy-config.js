// 公式検証 中継サーバ（Cloudflare Worker）のエンドポイント。
//
// デプロイ手順:
//   cd worker
//   npx wrangler login        # 初回のみ（ブラウザ認証）
//   npx wrangler deploy
// 出力された https://qr-credential-verify-proxy.<account>.workers.dev を下に設定する。
//
// 未設定（空文字）の場合、アプリは「公式検証」ボタンを無効化し案内を表示する。
export const PROXY_URL = 'https://qr-credential-verify-proxy.tsuyoshi306.workers.dev'

export function isProxyConfigured() {
  return typeof PROXY_URL === 'string' && PROXY_URL.startsWith('http')
}
