# Edge Function: record-punch

端末側のQR/PASS打刻を安全に保存するための関数です。

ブラウザから `punch_records` へ直接 `insert` せず、以下の流れにします。

1. 端末画面が `record-punch` Edge Function を呼び出す
2. Edge Function が端末ID/端末PASSを確認する
3. PASSまたはQRトークンをDB側で検証する
4. DB関数 `record_terminal_punch` が二重打刻を判定して保存する
5. 成功、二重打刻、エラーを端末画面へ返す

## Files

```text
supabase/migrations/004_record_terminal_punch_rpc.sql
supabase/config.toml
supabase/functions/record-punch/index.ts
supabase/functions/_shared/cors.ts
prototype/terminal.js
```

## Supabase SQL

Supabase SQL Editorで次を実行してください。

```text
supabase/migrations/004_record_terminal_punch_rpc.sql
```

このSQLは、サービスロールだけが実行できる打刻用RPCを作ります。

## Deploy

Supabase CLIを使う場合:

```bash
supabase functions deploy record-punch --project-ref ecwbkzerizkjfvscixlq
```

Dashboardから作る場合は、Edge Functionsで `record-punch` を作成し、`supabase/functions/record-punch/index.ts` の内容を貼り付けます。

## Secrets

Supabase hosted Edge Functionsでは、`SUPABASE_URL` と `SUPABASE_SECRET_KEYS` が標準で使えます。

絶対にGitHub Pages、ブラウザ、チャット、公開リポジトリへ `service_role` キーを貼らないでください。

## Current Demo Values

テスト用:

```text
会社ID: TOTAL-001
端末ID: TQR-TAB-001
端末PASS: 0000
従業員ID: E-0007
従業員PASS: 1234
QRトークン: tqr-demo-qr-token-change-before-production
```

本番利用前に、端末PASS、従業員PASS、QRトークンは必ず変更してください。

## Notes

- Edge Function未デプロイ時、端末画面はローカル保存デモにフォールバックします。
- Edge Functionデプロイ後は、成功打刻がSupabaseの `punch_records` に保存され、管理画面に表示されます。
- 今後の本番化では、端末ごとの秘密情報の再発行、レート制限、監査ログ強化を追加します。
