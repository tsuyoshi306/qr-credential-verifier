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

## Phase 8: UX改善・ファイル取り込み

- [x] **T49** 結果欄の技術情報（生URL・署名バッジ）を details で折りたたみ
- [x] **T50** `npm install pdfjs-dist`（動的importで初期バンドルから分離）
- [x] **T51** `src/file-import.js` — PDF/画像からQRをデコード（jsQR）
- [x] **T52** `index.html`/`src/main.js` — 「ファイルから読み取り」ボタン・file input・ローディング
- [x] **T53** 取り込み結果を handleDetected 共通フローへ
- [x] **T54** ビルド・実PDFで動作確認（Node上でpdfjs描画→jsQRデコード成功）
- [x] **T55** コミット `feat: collapsible details + PDF/image QR import`

---

## Phase 9: 一括アップロード

- [x] **T56** file input を multiple 対応
- [x] **T57** 公式検証fetchを `requestOfficialVerification()` に共通化
- [x] **T58** `index.html` — バルク結果リスト領域・「全件公式検証」ボタン
- [x] **T59** `src/main.js` — 複数選択時の逐次取り込み・行レンダリング・進捗
- [x] **T60** 各行の個別公式検証・全件公式検証（直列）
- [x] **T61** ビルド確認・コミット `feat: bulk file upload with per-item verification`

---

## Phase 10: 検証表示の統一と一括「詳細」展開

- [x] **T62** 一括各行をコンパクト判定表示＋「詳細」トグルに変更
- [x] **T63** 「詳細」展開は単一検証と同一の `buildOfficialResultHtml()` を使用
- [x] **T64** 詳細パネルのCSS（開閉）
- [x] **T65** ビルド確認・コミット `feat: unify single/bulk verification detail with expandable 詳細`
- [x] **T66** 一括の各item解析結果(fields)を保持
- [x] **T67** 「詳細」展開でQR登録情報を表示（単一cred-infoと同一項目・共通生成関数）
- [x] **T68** 詳細内「公式検証」ボタン→公式結果を全表示（buildOfficialResultHtml）
- [x] **T69** 全件公式検証は各詳細を開いて結果反映 / ビルド確認・コミット

---

## Phase 11: 一括の技術情報 と 履歴詳細の再検証

- [x] **T70** `buildSigBadgeHtml`/`buildTechInfoHtml` を共通化（単一で使用）
- [x] **T71** 一括「詳細」に技術情報（折りたたみ）を追加
- [x] **T72** `showResult(url,{save,existingId})` で保存制御
- [x] **T73** 履歴行クリックでスキャン結果カードに再表示（save=false）
- [x] **T74** 履歴からの公式検証は既存レコード更新・新規追加しない
- [x] **T75** 削除ボタンの伝播制御 / ビルド確認・コミット

---

## Phase 12: 公式検証結果の重複排除

- [x] **T76** `buildOfficialResultHtml` から登録情報テーブルを除去（判定＋証明書情報のみ）
- [x] **T77** ビルド確認・コミット `feat: drop duplicated registration from official result`

---

## Phase 13: CSV出力

- [x] **T78** 公式検証時に証明書情報(所有者/発行者/シリアル/有効期間)・確認日時を履歴保存
- [x] **T79** `index.html` 履歴タブに「CSV出力」ボタン
- [x] **T80** `src/main.js` — 全履歴をqrData再解析しCSV生成（BOM付・エスケープ）・ダウンロード
- [x] **T81** ビルド確認・コミット `feat: CSV export of scanned data`

---

## PR / マージ

- [ ] **PR1** feature/setup → main
- [ ] **PR2** feature/qr-scanner → main
- [ ] **PR3** feature/verification → main
- [ ] **PR4** feature/history → main
- [ ] **PR5** feature/pwa → main
