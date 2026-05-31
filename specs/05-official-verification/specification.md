# 機能仕様 05: 公式検証（中継サーバ経由）

## 背景
署名検証・失効確認はクライアント単体では不可能（公開鍵非公開・CORS不許可）。
唯一の手段として、自前の中継サーバ（Cloudflare Worker）からデジタル庁検証サイト
（`POST https://dqcvs.nqs.go.jp/w/verify`）を呼び、結果HTMLを解析してアプリに返す。

## 検証サイトの仕様（実測）
- 入力: `POST /w/verify`、`application/x-www-form-urlencoded`、body=`checkdata=<c値>&execute=`
- 出力: 結果HTML（`検証結果：有効です` / 登録情報テーブル / 証明書情報）
- CORS: `Access-Control-Allow-Origin` なし → ブラウザ直呼び不可
- `X-Frame-Options: DENY` → iframe不可

## アーキテクチャ
```
PWA --(POST JSON {checkdata})--> Cloudflare Worker --(form POST)--> dqcvs.nqs.go.jp/w/verify
PWA <--(JSON 結果)------------- Worker (HTML解析 + CORS付与) <---- 結果HTML
```

## ユーザーストーリー
- **US-12**: スキャンした資格者証を、デジタル庁の公式判定（有効/無効）でアプリ内確認したい
- **US-13**: 失効・取消・一時停止を含む正式な有効性結果を見たい
- **US-14**: 署名に使われた証明書情報（官職認証局など）も確認したい

## 受入条件
### Worker
- [ ] `POST` で `{ checkdata }` を受け取り、検証サイトへ form POST する
- [ ] 結果HTMLを解析し JSON で返す: `{ valid, resultText, checkedAt, registration[], certificates[] }`
- [ ] CORS ヘッダを付与（許可オリジン: GitHub Pages と localhost）
- [ ] `OPTIONS` プリフライトに対応
- [ ] 検証サイトがエラー/想定外HTMLのときは `{ error }` を返す
- [ ] 個人データをログに残さない

### PWA
- [ ] 資格者証QR検出時に「🏛 公式検証を実行」ボタンを表示
- [ ] ボタン押下で Worker にPOST、ローディング表示
- [ ] 結果を表示: 判定（有効/無効、無効時は理由）・確認日時・登録情報・証明書情報
- [ ] 通信失敗/未設定時のエラー表示
- [ ] 実行前に「資格データを中継サーバ経由でデジタル庁に送信します」と明示（プライバシー）
- [ ] 公式判定結果を履歴に保存

## 解析対象（結果HTML構造）
- 判定: `検証結果：(.+)` を抽出。「有効」を含めば valid=true
- 確認日時: `確認日時：(.+)`
- 登録情報: `<h2 id="qualificationInfo">` 直後の table の th/td
- 証明書情報: `<details class="certificate-info">` 内の各 table（caption + th/td）

## 設定
- `src/proxy-config.js` に Worker のURL（デプロイ後に設定）。未設定ならボタンは無効＋案内表示。

## スコープ外
- Worker でのデータ永続化（ステートレス転送のみ）
- 公式API化（提供されていない）
