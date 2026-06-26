# TQR Free Prototype Hosting

TQRの初期プロトタイプは、静的HTMLだけで構成しているため無料枠で公開できます。

## Current Prototype Files

```text
index.html        # GitHub Pages / static hosting entry point
.nojekyll         # GitHub Pages用: Jekyll処理を無効化
prototype/
  login.html   # ログインページ
  admin.html   # 集計用HP・管理画面
  index.html   # 打刻端末画面
```

最初に開くページは `index.html` です。自動的に `prototype/login.html` へ遷移します。

## Recommended Free Hosting

### 1. Cloudflare Pages

おすすめ度: 高

向いている理由:

- 静的HTMLの公開が簡単
- 無料枠が広い
- 将来的にCloudflare D1、Workers、Turnstileなどへ広げやすい
- 独自ドメイン設定もしやすい

初期設定:

```text
Build command: 空欄
Build output directory: prototype
Root page: login.html
```

### 2. GitHub Pages

おすすめ度: 中

向いている理由:

- 完全無料で始めやすい
- 静的HTMLの確認に十分
- GitHub管理と相性が良い

注意:

- 将来の認証・DB連携は別サービスが必要
- 非公開業務データを直接置かない

設定手順:

```text
1. GitHubでTQR用リポジトリを作成
2. このプロジェクトをpush
3. GitHubの Settings を開く
4. Pages を開く
5. Source を Deploy from a branch にする
6. Branch を main、Folder を /root にする
7. Save
8. 数分後に https://ユーザー名.github.io/リポジトリ名/ で確認
```

公開URL例:

```text
https://<github-user>.github.io/TQR/
```

このURLを開くと、`prototype/login.html` に遷移します。

### 3. Vercel

おすすめ度: 中

向いている理由:

- フロントエンド開発に強い
- 将来Next.jsへ移行しやすい
- プレビューURLを作りやすい

注意:

- 本格的な勤怠データ運用前に料金・利用規約を確認する

## Authentication Plan

現在のログインはプロトタイプ用の見た目と画面遷移です。

デモ認証情報:

```text
管理者:
会社ID: TOTAL-001
管理者ID: admin
PASS: 0000

打刻端末:
会社ID: TOTAL-001
端末ID: TQR-TAB-001
PASS: 0000
```

本実装では以下が必要です。

- 管理者ログイン
- 端末ログイン
- 会社IDの検証
- 端末登録状態の検証
- PASSのハッシュ保存
- ログイン失敗履歴
- 権限管理

## Suggested Backend Options

### Supabase

向いている用途:

- 管理者認証
- PostgreSQLで勤怠データ保存
- CSV出力用のデータ取得
- 無料枠で初期検証

### Firebase

向いている用途:

- 認証
- リアルタイム同期
- PWAやモバイル連携

### Cloudflare Workers + D1

向いている用途:

- Cloudflare Pagesとまとめたい場合
- 軽量API
- 低コスト運用

## Important Security Notes

勤怠データは個人情報に近い扱いになるため、本番運用では以下を必須にします。

- PASSを平文保存しない
- 管理画面をHTTPSで公開する
- 管理者権限を分ける
- 端末ごとに登録・無効化できるようにする
- CSV出力履歴を残す
- バックアップ方針を決める
- 無料枠の制限と利用規約を確認する

## Next Implementation Steps

1. 無料公開先を決める
2. `prototype/login.html` を入口に公開する
3. Supabaseなどで認証とDBを作る
4. 管理画面のログインを本物の認証に置き換える
5. 打刻端末のログをDB保存へ置き換える
6. CSV出力をDBデータから生成する
