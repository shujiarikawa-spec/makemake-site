# Makemake SEO Dashboard

これは公開中の GitHub Pages（`docs/`）とは別に置く、アクセス制御された運用ダッシュボードです。GA4 / Search Console の認証情報も集計データも Pages の HTML・Git リポジトリには置きません。

## 構成

```
Google Search Console ─┐
                       ├─ Cloudflare Worker（毎日 11:15 JST に収集） ─ KV（履歴キャッシュ） ─ Google Sheets
GA4 Data API ──────────┘                                      │
                                                                  └─ Basic認証保護下のダッシュボード
```

Worker は、GSC の `query / page / clicks / impressions / ctr / position / date` と、GA4 の `activeUsers / sessions / screenPageViews / landingPagePlusQueryString に相当するページ到達分析 / sessionSource / sessionMedium / sessionCampaignName / sessionManualAdContent / keyEvents` を取得します。初回は28日、以後は直近7日だけ再取得して履歴キャッシュへ統合します。Google Sheetsは初回28日、以後7日の再照合を自然キーで更新します。閲覧のたびに Google API は呼びません。

## 初回設定（秘密情報を Git に置かない）

1. Cloudflare で Worker / KV namespace を作ります。`workers.dev` のダッシュボードは、Worker 内の **Basic認証**で保護します。`run_worker_first = true` により、HTML・JavaScript・APIの全リクエストで認証を確認します。無料枠では閲覧リクエストもWorker実行回数に含まれるため、運用者だけが使う内部画面に限定します。
2. `dashboard/wrangler.toml` に KV ID を設定します。認証情報はこのファイルやGitには入れません。
3. Google Cloud で同一プロジェクトの **Google Sheets API**、GA4 Data API、Search Console APIを有効化し、サービスアカウントのJSONキーを発行します。GA4プロパティ **`G-4BL0WG5Y3T` の測定IDではなく、数値の Property ID** にサービスアカウントへ「閲覧者」以上を付与します。Search Consoleは対象プロパティに同じサービスアカウントを**制限付き**ユーザーとして追加します。指定スプレッドシートには、サービスアカウントのメールアドレスを**編集者**として共有します。
4. `GOOGLE_SERVICE_ACCOUNT_JSON`、`DASHBOARD_ACCESS_PASSWORD_V3`、必要に応じて`DASHBOARD_REFRESH_TOKEN`は Worker の**シークレット**として設定します。`DASHBOARD_ACCESS_USERNAME`、`GA4_PROPERTY_ID`、`SEARCH_CONSOLE_SITE_URL`、`GOOGLE_SHEETS_SPREADSHEET_ID`、`PUBLIC_SITE_ORIGIN`は環境変数として設定します。`keep_vars = true` が有効なため、GitHub連携の後続デプロイでもCloudflare画面で設定した環境変数を削除しません。

```sh
cd dashboard
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
npx wrangler secret put DASHBOARD_ACCESS_PASSWORD
npx wrangler secret put DASHBOARD_REFRESH_TOKEN
npx wrangler deploy
```

`SEARCH_CONSOLE_SITE_URL` は Search Console に登録済みのプロパティ文字列と完全に一致させます（例: `sc-domain:makenai-mark.com` または `https://makenai-mark.com/`）。リポジトリ内や公開 HTML からこの値を推測してはいけません。

### PV品質の運用状態

保護された画面の「PVの判定前に確認する項目」には、GA4 Data APIだけでは取得できない運用設定も表示します。次のWorker環境変数は、設定が完了した事実を確認した時だけ更新します。未設定時は画面に`未確認`と表示され、成功状態を推測しません。

- `INTERNAL_TRAFFIC_FILTER_STATUS`：GA4の内部トラフィック定義と、該当データフィルタの状態。例：`Testing（2026-09-05）`
- `GA4_SEARCH_CONSOLE_LINK_STATUS`：GA4プロパティとSearch Consoleプロパティのリンク状態。例：`連携済み（2026-09-05）`

内部トラフィックを除外するには、GA4のウェブデータストリームに除外対象の固定IPまたはVPN出口IPを登録し、データフィルタを最初は`Testing`で確認してから`Active`にします。IPアドレスを推測して登録しません。

## 手動初回更新

デプロイ後に、Basic認証を通過できる管理端末から以下を実行します。`DASHBOARD_REFRESH_TOKEN`を設定していない場合も、ダッシュボード用のBasic認証で実行できます。パスワードをshell historyに残さないよう、プロンプト入力にします。

```sh
read -r "DASHBOARD_USER?Dashboard user: "
read -rs "DASHBOARD_PASSWORD?Dashboard password: "
curl -X POST "https://makemake-seo-dashboard.shuji-arikawa.workers.dev/api/admin/refresh" \
  --user "$DASHBOARD_USER:$DASHBOARD_PASSWORD"
```

レスポンスが `ok: true` なら、画面で GSC / GA4 のキャッシュ済み実データを読めます。失敗時には API が Google の HTTP ステータスを返し、既存キャッシュは消しません。

## 計測上の前提

- フォーム計測は、`contact_submit_click`、`diagnosis_submit_click`、`contact_submission_success`、`diagnosis_submission_success` の4イベントです。押下は入力不足で送れなかったケースも含み、完了はFormspreeから対応する完了ページへ戻った場合だけを計測します。フォームの入力値・個人情報はGA4へ送りません。GA4上で送信完了イベントをキーイベントに指定しても構いませんが、ダッシュボードはイベント回数を使用するため追加設定なしで表示できます。
- 診断ページ到達は `/diagnosis/` の `screenPageViews`、記事→診断遷移は `diagnosis_cta_click` です。
- X / Instagram は `sessionSource` を `x|twitter|t.co`、`instagram|ig|l.instagram.com` として集計し、`sessionManualAdContent`（`utm_content`）を投稿単位として表示します。UTM のない SNS 流入は投稿単位比較に入らず、`(UTM contentなし)` と明示されます。
- コラムは公開サイトの sitemap の `/insights/` URLを毎回発見するため、記事追加時にダッシュボードのコードを修正しません。公開日は記事本文の `公開日：YYYY年M月D日` を抽出します。書式が異なる記事は「公開日未取得」です。
- GSC は通常数日の確定遅延があるため、最新3日を収集対象から外します。これは「0」と誤認しないためです。無料WorkerのCPU制限に収めるため、初回は`DASHBOARD_HISTORY_DAYS`（既定28日）だけを取得します。以後は`SHEETS_RECONCILE_DAYS`（既定7日）を更新し、同じ日付・キーの行は追加せず更新します。長期の推移は日次蓄積で育てる設計です。
- 保存先のシートは`daily_summary`、`search_queries`、`search_pages`、`ga4_pages`、`utm_traffic`、`form_events`、`articles`、`seo_actions`です。既存シートが同一ヘッダーなら更新、ヘッダーが異なれば中断するため、既存データを壊しません。空の`シート1`はそのまま残します。

## 判定ロジック

28日以上かつ十分な表示・セッションがある場合、検索クリック、表示、平均順位（低下が改善）、オーガニックユーザーのうち2項目以上が 5% 以上改善なら「改善中」、悪化なら「要改善」、それ以外は「横ばい」です。公開直後・7日・少量データは必ず「データ不足」であり、「要改善」にしません。

## ローカル確認

```sh
cd dashboard
npm test
npm run check
```

実 API の接続確認は、Basic認証とGoogle権限を設定してから `/api/admin/refresh` で行います。認証情報がない状態でダミー数値を画面へ書き込むことはしません。
