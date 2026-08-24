# Makemake SEO Dashboard

これは公開中の GitHub Pages（`docs/`）とは別に置く、アクセス制御された運用ダッシュボードです。GA4 / Search Console の認証情報も集計データも Pages の HTML・Git リポジトリには置きません。

## 構成

```
Google Search Console ─┐
                       ├─ Cloudflare Worker（毎日 11:15 JST に収集） ─ KV（36時間キャッシュ）
GA4 Data API ──────────┘                                      │
                                                                  └─ Cloudflare Access 保護下のダッシュボード
```

Worker は、GSC の `query / page / clicks / impressions / ctr / position / date` と、GA4 の `activeUsers / sessions / screenPageViews / landingPagePlusQueryString に相当するページ到達分析 / sessionSource / sessionMedium / sessionCampaignName / sessionManualAdContent / keyEvents` を取得します。データは最長 2 年分を一日一回まとめて取り、画面上の 7・28・90日・6か月・1年切替では保存済みデータを絞り込みます。閲覧のたびに Google API は呼びません。

## 初回設定（秘密情報を Git に置かない）

1. Cloudflare で Worker / KV namespace / Access application を作ります。Access の対象はダッシュボードの独自ホスト名（例: `seo.makenai-mark.com`）全体にしてください。Workers の `workers.dev` URL を公開運用に使わないでください。
2. `dashboard/wrangler.toml.example` をローカルで `dashboard/wrangler.toml` に複製し、KV ID を入れます。このファイルは `.gitignore` の対象にします。
3. Google Cloud でサービスアカウントを作成して JSON キーを発行します。GA4 プロパティ **`G-4BL0WG5Y3T` の測定IDではなく、数値の Property ID** にそのサービスアカウントへ「閲覧者」以上を付与します。Search Console は対象プロパティに同じサービスアカウントを「フル」以上でユーザー追加します。
4. 値をそれぞれ秘密情報として設定します。`GOOGLE_SERVICE_ACCOUNT_JSON`、`GA4_PROPERTY_ID`、`SEARCH_CONSOLE_SITE_URL`、`DASHBOARD_REFRESH_TOKEN` は必ず `wrangler secret put` を使います。`PUBLIC_SITE_ORIGIN`、`SEO_TARGET_QUERIES`、`SEO_IMPORTANT_PATHS` は Worker の環境変数で構いません。

```sh
cd dashboard
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put GA4_PROPERTY_ID
npx wrangler secret put SEARCH_CONSOLE_SITE_URL
npx wrangler secret put DASHBOARD_REFRESH_TOKEN
npx wrangler secret put PUBLIC_SITE_ORIGIN
npx wrangler secret put SEO_TARGET_QUERIES
npx wrangler deploy
```

`SEARCH_CONSOLE_SITE_URL` は Search Console に登録済みのプロパティ文字列と完全に一致させます（例: `sc-domain:makenai-mark.com` または `https://makenai-mark.com/`）。リポジトリ内や公開 HTML からこの値を推測してはいけません。

## 手動初回更新

デプロイ後に、Access を通過できる管理端末から以下を実行します。トークンを shell history に残したくない場合は、プロンプト入力など安全な運用に置き換えてください。

```sh
curl -X POST "https://seo.makenai-mark.com/api/admin/refresh" \
  -H "Authorization: Bearer $DASHBOARD_REFRESH_TOKEN"
```

レスポンスが `ok: true` なら、画面で GSC / GA4 のキャッシュ済み実データを読めます。失敗時には API が Google の HTTP ステータスを返し、既存キャッシュは消しません。

## 計測上の前提

- 問い合わせは現在の `generate_lead` を使用します。GA4 管理画面でこのイベントを **キーイベント** に指定してください。フォームの `submit` は送信失敗を含み得るため、問い合わせ数には使いません。
- 診断ページ到達は `/diagnosis/` の `screenPageViews`、記事→診断遷移は `diagnosis_cta_click` です。
- X / Instagram は `sessionSource` を `x|twitter|t.co`、`instagram|ig|l.instagram.com` として集計し、`sessionManualAdContent`（`utm_content`）を投稿単位として表示します。UTM のない SNS 流入は投稿単位比較に入らず、`(UTM contentなし)` と明示されます。
- コラムは公開サイトの sitemap の `/insights/` URLを毎回発見するため、記事追加時にダッシュボードのコードを修正しません。公開日は記事本文の `公開日：YYYY年M月D日` を抽出します。書式が異なる記事は「公開日未取得」です。
- GSC は通常数日の確定遅延があるため、最新3日を収集対象から外します。これは「0」と誤認しないためです。

## 判定ロジック

28日以上かつ十分な表示・セッションがある場合、検索クリック、表示、平均順位（低下が改善）、オーガニックユーザーのうち2項目以上が 5% 以上改善なら「改善中」、悪化なら「要改善」、それ以外は「横ばい」です。公開直後・7日・少量データは必ず「データ不足」であり、「要改善」にしません。

## ローカル確認

```sh
cd dashboard
npm test
npm run check
```

実 API の接続確認は、Access と Google 権限を設定してから `/api/admin/refresh` で行います。認証情報がない状態でダミー数値を画面へ書き込むことはしません。
