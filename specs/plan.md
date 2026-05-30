# 実装計画（action-plan）

## フェーズ構成

### Phase 1: プロジェクト基盤（feature/setup）
- Vite プロジェクト初期化
- jsQR, idb パッケージ追加
- vite-plugin-pwa 設定
- manifest.json, Service Worker 設定

### Phase 2: QRスキャナー（feature/qr-scanner）
- カメラ起動 / 権限エラー処理
- jsQR によるフレーム解析ループ
- QR検出時のストリーム停止
- 結果表示UI

### Phase 3: 検証連携（feature/verification）
- 「検証サイトで確認」ボタン実装
- dqcvs.nqs.go.jp ドメイン判定
- 検証済みフラグの記録・表示

### Phase 4: 履歴機能（feature/history）
- IndexedDB 初期化（idb）
- スキャン保存・取得・削除
- 履歴画面UI

### Phase 5: PWA仕上げ（feature/pwa）
- Service Worker キャッシュ設定
- インストールプロンプト対応
- オフライン対応確認

## リスク
| リスク | 対策 |
|--------|------|
| iOSでのカメラ動作 | Safari の getUserMedia 対応を確認（iOS 14.3+ 必要） |
| dqcvs.nqs.go.jp の仕様変更 | URLパターンを設定ファイル化し差し替えやすくする |
| HTTPS必須 | 開発はlocalhost、本番はGitHub Pages（HTTPS） |
