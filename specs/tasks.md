# タスクリスト

凡例: `[ ]` 未着手 / `[x]` 完了 / `[-]` スキップ

---

## Phase 1: プロジェクト基盤

- [x] **T01** Vite プロジェクト初期化（vanilla JS）
- [x] **T02** `npm install jsqr idb` を追加
- [x] **T03** `vite-plugin-pwa` を追加し vite.config.js を設定
- [x] **T04** manifest 設定（vite.config.js 内で定義、display:standalone）
- [x] **T05** 初期コミット `chore: initial project setup`

---

## Phase 2: QRスキャナー

- [x] **T06** `src/scanner.js` — getUserMedia でカメラ起動、エラーハンドリング
- [x] **T07** `src/scanner.js` — jsQR でフレーム解析ループ（requestAnimationFrame）
- [x] **T08** `src/scanner.js` — QR検出時にコールバックを呼びストリーム停止
- [x] **T09** `index.html` + `src/main.js` — スキャン画面UI（video + canvas、結果表示エリア）※ui.jsはmain.jsに統合
- [x] **T10** 「検証サイトで確認」ボタン表示（dqcvs.nqs.go.jp URLの場合）
- [x] **T11** コミット `feat: QR scanner implementation`

---

## Phase 3: 検証連携

- [x] **T12** `src/main.js` — 「検証サイトで確認」で新タブを開く
- [x] **T13** `src/main.js` — 「検証しました」ボタンで verified フラグをセット
- [x] **T14** 検証済みバッジ表示CSS
- [x] **T15** コミット `feat: verification link and status tracking`

---

## Phase 4: 履歴機能

- [x] **T16** `src/storage.js` — IndexedDB 初期化（idb 使用）
- [x] **T17** `src/storage.js` — addScan / getScans / markVerified / deleteScan / clearScans 関数
- [x] **T18** `src/main.js` — 履歴画面のレンダリング（リスト + 削除ボタン）
- [x] **T19** スキャン成功時に自動保存を追加
- [x] **T20** 「全件削除」ボタン + 確認ダイアログ
- [x] **T21** コミット `feat: scan history with IndexedDB`

---

## Phase 5: PWA仕上げ

- [x] **T22** Service Worker のキャッシュ設定（VitePWA autoUpdate + globPatterns）
- [x] **T23** インストールプロンプト（beforeinstallprompt）対応
- [x] **T24** オフライン時の警告表示
- [x] **T25** GitHub Pages 用の base 設定（vite.config.js: /qr-credential-verifier/）
- [x] **T26** コミット `feat: PWA and offline support`

---

## Phase 6: アプリ内署名検証

- [x] **T27** `npm install cbor-x` を追加
- [x] **T28** `src/cose.js` — URLから`c=`抽出、Base64(url)デコード
- [x] **T29** `src/cose.js` — CBOR/COSE_Sign1 パース（tag18対応）、protectedヘッダのalg取得
- [x] **T30** `src/cose.js` — payload(登録情報)のCBORデコードとキー正規化
- [x] **T31** `src/cose.js` — Sig_structure構築 + Web Crypto(ES256)署名検証
- [x] **T32** `src/trust-config.js` — 公開鍵JWK配列（デフォルト空）+ 取得手順メモ
- [x] **T33** `index.html` + `src/main.js` — 登録情報カード・署名検証バッジ・失効未確認注意書き
- [x] **T34** 「有効」断定をしないこと、鍵未設定時スキップの動作確認
- [x] **T35** COSEパース失敗時の生データフォールバック
- [x] **T36** 履歴にパース結果・署名検証結果を保存
- [x] **T37** コミット `feat: in-app COSE signature verification and credential display`
- [x] **T38** 自己テスト `test/cose.test.mjs`（署名OK/NG/skip/壊れ入力 = 10件pass）+ サンプルQR画像

---

## Phase 7: 公式検証（Cloudflare Worker中継）

- [x] **T39** `worker/src/parse.js` — 検証結果HTMLパーサ（判定/日時/登録情報/証明書）
- [x] **T40** `worker/src/index.js` — POST受付→検証サイトへform POST→JSON返却、CORS/OPTIONS対応
- [x] **T41** `worker/wrangler.toml` — Worker設定
- [x] **T42** `worker/test/parse.test.mjs` — 匿名+実HTMLでパーサ検証（16件pass）
- [x] **T43** `src/proxy-config.js` — Worker URL設定（未設定時はボタン無効化）
- [x] **T44** `index.html`/`src/main.js` — 「公式検証を実行」ボタン・結果表示・送信前の同意明示
- [x] **T45** 公式検証結果を既存履歴レコードに反映（updateScan）
- [x] **T46** Worker デプロイ済み（tsuyoshi306.workers.dev）+ proxy-config に本番URL設定
- [x] **T47** コミット `feat: official verification via Cloudflare Worker proxy`
- [x] **T48** Worker統合テスト（実checkdataで上流POST→解析→CORS確認、ローカル）

---

## PR / マージ

- [ ] **PR1** feature/setup → main
- [ ] **PR2** feature/qr-scanner → main
- [ ] **PR3** feature/verification → main
- [ ] **PR4** feature/history → main
- [ ] **PR5** feature/pwa → main
