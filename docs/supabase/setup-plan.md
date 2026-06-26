# TQR Supabase Setup Plan

## Goal

TQRの本実装では、Supabaseを以下に使う。

- 管理者ログイン
- 会社・拠点・従業員・端末の管理
- 打刻ログ保存
- 修正履歴保存
- CSV出力履歴保存
- 監査ログ保存

画面公開は当面GitHub Pagesのままでよい。DBと認証だけSupabaseへ接続する。

## Why Supabase First

TQRで最初に必要なのはデータの正本です。

SupabaseはPostgreSQL、Auth、RLSをまとめて使えるため、以下と相性がよい。

- 会社IDごとのデータ分離
- 管理者ログイン
- 勤怠データ保存
- CSV出力用の集計
- 将来のAPI化

Supabase公式ドキュメントでも、公開schemaのテーブルはRLSを有効にする前提が示されているため、TQRでも最初からRLSを有効にする。

参考:

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth](https://supabase.com/docs/guides/auth)

## Files Added

```text
supabase/migrations/001_initial_tqr_schema.sql
docs/supabase/setup-plan.md
docs/supabase/security-checklist.md
```

## Initial Tables

- `companies`
- `company_users`
- `sites`
- `employees`
- `employee_qr_tokens`
- `devices`
- `punch_records`
- `punch_corrections`
- `csv_exports`
- `audit_logs`

## Data Separation

すべての主要テーブルに `company_id` を持たせる。

RLSでは、ログインユーザーが `company_users` に所属している会社のデータだけ見られるようにする。

```text
auth.users
  -> company_users
    -> companies
      -> employees / devices / punch_records
```

## Setup Steps

1. Supabaseで新規Projectを作る
2. SQL Editorを開く
3. `supabase/migrations/001_initial_tqr_schema.sql` を実行する
4. Authenticationで管理者ユーザーを作る
5. `companies` に会社を作る
6. `company_users` に管理者ユーザーを紐づける
7. `sites`、`employees`、`devices` を登録する
8. プロトタイプのログインをSupabase Authへ置き換える
9. 打刻ログを `punch_records` に保存する
10. 管理画面をSupabaseデータ表示に置き換える

## Demo Seed Example

Supabase Authでユーザーを作った後、そのユーザーIDを `auth_user_id` に入れる。

```sql
insert into public.companies (company_code, name)
values ('TOTAL-001', 'トータル勤怠テスト会社')
returning id;

-- returned company id を使う
insert into public.company_users (company_id, auth_user_id, role, display_name)
values (
  '<company_id>',
  '<auth_user_id>',
  'owner',
  '管理者'
);
```

## PASS Handling

従業員PASSは平文保存しない。

初期案:

- フロントからPASSを送る
- Edge Functionまたはサーバー側処理で検証する
- DBには `pass_hash` のみ保存する
- ハッシュにはbcrypt/argon2などを使う

プロトタイプの `1234` は本番では使わない。

## QR Token Handling

QRコードには社員IDそのものを入れない。

初期案:

```text
QR内: ランダムな打刻用token
DB内: token_hash
```

運用:

- QR紛失時は該当tokenを失効
- 新しいtokenを発行
- 過去打刻ログは社員に紐づけたまま保持

## Next Implementation

1. Supabase Project URLとAnon Keyを取得
2. `prototype` にSupabase JSを読み込む
3. `login.html` をSupabase Authログインに変更
4. `admin.html` の打刻一覧を `punch_records` から取得
5. `index.html` の打刻処理を `punch_records` insertへ変更
6. PASS検証はEdge Function化する
