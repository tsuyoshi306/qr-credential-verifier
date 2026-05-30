# QR Credential Verifier — Claude Code ステアリングファイル

## プロジェクト概要
デジタル資格者証のQRコードをスマホカメラで読み取り、デジタル庁の検証サイト（dqcvs.nqs.go.jp）へ誘導するPWAアプリ。スキャン履歴と検証結果をブラウザ（IndexedDB）に保存する。

## 技術スタック
- **フロントエンド**: Vanilla JS + Vite（フレームワークなし、シンプル優先）
- **QRスキャン**: jsQR（軽量・ライセンス自由）
- **ストレージ**: IndexedDB（idb ライブラリ経由）
- **PWA**: vite-plugin-pwa（Service Worker + manifest）
- **スタイル**: CSS（フレームワークなし）

## 開発ルール
1. **仕様ファースト**: 実装前に必ず `specs/` 配下の仕様を確認・更新する
2. **ブランチ運用**: `main`（リリース）/ `feature/機能名` の2層運用
3. **コミット単位**: タスク1件 = 1コミット
4. **PR**: 機能完成後に `gh pr create` でmainへPR
5. **仕様整合チェック**: PR前に `specs/*/specification.md` の受入条件を確認する

## Git運用
- feature ブランチから開発し、main には直接コミットしない
- コミットメッセージ形式: `feat:`, `fix:`, `docs:`, `test:`, `chore:`

## ディレクトリ構成（予定）
```
/
├── CLAUDE.md
├── index.html
├── src/
│   ├── main.js
│   ├── scanner.js
│   ├── storage.js
│   └── ui.js
├── specs/
│   ├── constitution.md
│   ├── 01-qr-scanner/
│   ├── 02-verification/
│   └── 03-history/
└── public/
    └── manifest.json
```
