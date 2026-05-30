# タスクリスト

凡例: `[ ]` 未着手 / `[x]` 完了 / `[-]` スキップ

---

## Phase 1: プロジェクト基盤

- [ ] **T01** `npm create vite@latest` でプロジェクト初期化（vanilla JS）
- [ ] **T02** `npm install jsqr idb` を追加
- [ ] **T03** `npm install -D vite-plugin-pwa` を追加し vite.config.js を設定
- [ ] **T04** `public/manifest.json` を作成（アイコン・テーマカラー・display:standalone）
- [ ] **T05** 初期コミット `chore: initial project setup`

---

## Phase 2: QRスキャナー

- [ ] **T06** `src/scanner.js` — getUserMedia でカメラ起動、エラーハンドリング
- [ ] **T07** `src/scanner.js` — jsQR でフレーム解析ループ（requestAnimationFrame）
- [ ] **T08** `src/scanner.js` — QR検出時にコールバックを呼びストリーム停止
- [ ] **T09** `index.html` + `src/ui.js` — スキャン画面UI（video + canvas、結果表示エリア）
- [ ] **T10** 「検証サイトで確認」ボタン表示（dqcvs.nqs.go.jp URLの場合）
- [ ] **T11** コミット `feat: QR scanner implementation`

---

## Phase 3: 検証連携

- [ ] **T12** `src/ui.js` — 「検証サイトで確認」で新タブを開く
- [ ] **T13** `src/ui.js` — 「検証しました」ボタンで verified フラグをセット
- [ ] **T14** 検証済みバッジ表示CSS
- [ ] **T15** コミット `feat: verification link and status tracking`

---

## Phase 4: 履歴機能

- [ ] **T16** `src/storage.js` — IndexedDB 初期化（idb 使用）
- [ ] **T17** `src/storage.js` — addScan / getScans / deleteScan / clearScans 関数
- [ ] **T18** `src/ui.js` — 履歴画面のレンダリング（リスト + 削除ボタン）
- [ ] **T19** スキャン成功時に自動保存を追加
- [ ] **T20** 「全件削除」ボタン + 確認ダイアログ
- [ ] **T21** コミット `feat: scan history with IndexedDB`

---

## Phase 5: PWA仕上げ

- [ ] **T22** Service Worker のキャッシュ設定（jsQR + idb をプリキャッシュ）
- [ ] **T23** インストールプロンプト（beforeinstallprompt）対応
- [ ] **T24** オフライン時の警告表示
- [ ] **T25** GitHub Pages へのデプロイ設定（vite.config.js の base 設定）
- [ ] **T26** コミット `feat: PWA and offline support`

---

## PR / マージ

- [ ] **PR1** feature/setup → main
- [ ] **PR2** feature/qr-scanner → main
- [ ] **PR3** feature/verification → main
- [ ] **PR4** feature/history → main
- [ ] **PR5** feature/pwa → main
