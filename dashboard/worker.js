import { buildDashboard } from "./lib.js";
import { makeSheetRows, syncSheets } from "./sheets.js";
import { dashboardAuthRequired, hasDashboardAccess } from "./auth.js";

const CACHE_KEY = "seo-dashboard/raw-v1";
const SHEETS_STATE_KEY = "seo-dashboard/sheets-sync-state-v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/spreadsheets"];

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const base64url = (value) => btoa(typeof value === "string" ? value : String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const text = (value) => new TextEncoder().encode(value);

function mergeHistory(previous, fresh, refreshedStartDate, key) {
  const before = (previous || []).filter(row => !row.date || row.date < refreshedStartDate);
  const merged = new Map(before.map(row => [key(row), row]));
  fresh.forEach(row => merged.set(key(row), row));
  return [...merged.values()];
}

async function googleAccessToken(serviceAccountText) {
  const serviceAccount = JSON.parse(serviceAccountText);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: serviceAccount.client_email, scope: GOOGLE_SCOPES.join(" "), aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }));
  const pem = serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", binary, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, text(`${header}.${payload}`));
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${payload}.${base64url(signature)}` }) });
  if (!response.ok) throw new Error(`Google token request failed (${response.status})`);
  return (await response.json()).access_token;
}

async function googleJson(url, accessToken, body) {
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Google API request failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  return response.json();
}

function rowsFromGa(report, dimensions) {
  const headers = report.dimensionHeaders || [];
  const metricHeaders = report.metricHeaders || [];
  return (report.rows || []).map(row => {
    const out = {};
    headers.forEach((header, index) => { out[header.name] = row.dimensionValues[index]?.value || ""; });
    metricHeaders.forEach((header, index) => { out[header.name] = Number(row.metricValues[index]?.value || 0); });
    if (out.date) out.date = `${out.date.slice(0, 4)}-${out.date.slice(4, 6)}-${out.date.slice(6, 8)}`;
    return out;
  });
}

async function gaReport(env, token, dimensions, metrics, startDate, endDate, extra = {}) {
  const response = await googleJson(`https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`, token, {
    dateRanges: [{ startDate, endDate }], dimensions: dimensions.map(name => ({ name })), metrics: metrics.map(name => ({ name })), limit: 10000, ...extra
  });
  return rowsFromGa(response, dimensions);
}

async function scReport(env, token, dimensions, startDate, endDate, dimensionFilterGroups) {
  const response = await googleJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.SEARCH_CONSOLE_SITE_URL)}/searchAnalytics/query`, token, {
    startDate, endDate, dimensions, type: "web", rowLimit: 5000, dataState: "final", ...(dimensionFilterGroups ? { dimensionFilterGroups } : {})
  });
  return (response.rows || []).map(row => ({ date: dimensions.includes("date") ? row.keys[dimensions.indexOf("date")] : undefined,
    query: dimensions.includes("query") ? row.keys[dimensions.indexOf("query")] : undefined,
    page: dimensions.includes("page") ? row.keys[dimensions.indexOf("page")] : undefined,
    clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }));
}

async function siteArticles(origin) {
  const sitemap = await (await fetch(`${origin.replace(/\/$/, "")}/sitemap.xml`)).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+\/insights\/[^<]+)<\/loc>/g)].map(match => match[1]);
  const pages = await Promise.all(urls.map(async url => {
    try {
      const html = await (await fetch(url)).text();
      const title = (html.match(/<title>([^<]+)<\/title>/i) || [])[1]?.trim() || new URL(url).pathname;
      const publishedAt = (html.match(/公開日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/) || []);
      return { url, title, publishedAt: publishedAt.length ? `${publishedAt[1]}-${publishedAt[2].padStart(2, "0")}-${publishedAt[3].padStart(2, "0")}` : null };
    } catch { return { url, title: new URL(url).pathname, publishedAt: null }; }
  }));
  return pages;
}

async function refresh(env) {
  const token = await googleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const cachedRaw = await env.SEO_CACHE.get(CACHE_KEY, "json");
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 3); // GSC final data delay
  // Workers Free has a 10 ms CPU budget for a cron invocation. Start with a
  // small, useful window and let the daily reconciliation build history over
  // time instead of attempting a costly two-year import in one invocation.
  const historyDays = Math.max(28, Number(env.DASHBOARD_HISTORY_DAYS || 28));
  const reconcileDays = Math.max(1, Number(env.SHEETS_RECONCILE_DAYS || 7));
  const collectionDays = cachedRaw?.latestDate ? reconcileDays : historyDays;
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - collectionDays + 1);
  const startDate = start.toISOString().slice(0, 10); const endDate = end.toISOString().slice(0, 10);
  const targetQueries = (env.SEO_TARGET_QUERIES || "").split(",").map(value => value.trim()).filter(Boolean).slice(0, 10);
  const [searchDaily, searchQueryRows, searchPageRows, gaDaily, acquisitionRows, landingPageRows, pageRows, pageRollupRows, articleAcquisitionRows, eventRows, articles, ...targetReports] = await Promise.all([
    scReport(env, token, ["date"], startDate, endDate),
    scReport(env, token, ["date", "query"], startDate, endDate),
    scReport(env, token, ["date", "page"], startDate, endDate),
    gaReport(env, token, ["date", "sessionDefaultChannelGroup"], ["activeUsers", "sessions", "screenPageViews", "keyEvents"], startDate, endDate),
    gaReport(env, token, ["date", "sessionSource", "sessionMedium", "sessionCampaignName", "sessionManualAdContent"], ["activeUsers", "sessions", "screenPageViews", "keyEvents"], startDate, endDate),
    gaReport(env, token, ["date", "landingPagePlusQueryString", "sessionDefaultChannelGroup"], ["activeUsers", "sessions"], startDate, endDate),
    gaReport(env, token, ["date", "pagePath", "pageTitle", "sessionDefaultChannelGroup"], ["activeUsers", "sessions", "screenPageViews"], startDate, endDate),
    gaReport(env, token, ["date", "pagePath"], ["activeUsers", "sessions", "screenPageViews", "keyEvents"], startDate, endDate),
    gaReport(env, token, ["date", "pagePath", "sessionSource", "sessionMedium", "sessionCampaignName", "sessionManualAdContent"], ["activeUsers", "sessions"], startDate, endDate),
    gaReport(env, token, ["date", "eventName", "pagePath"], ["keyEvents", "eventCount"], startDate, endDate),
    siteArticles(env.PUBLIC_SITE_ORIGIN || "https://makenai-mark.com"),
    ...targetQueries.map(query => scReport(env, token, ["date", "query"], startDate, endDate, [{ filters: [{ dimension: "query", operator: "equals", expression: query }] }]))
  ]);
  const fresh = { searchDaily, searchQueryRows, searchPageRows,
    gaDaily: gaDaily.map(row => ({ ...row, users: row.activeUsers, pageviews: row.screenPageViews })),
    acquisitionRows: acquisitionRows.map(row => ({ ...row, users: row.activeUsers, pageviews: row.screenPageViews })), landingPageRows: landingPageRows.map(row => ({ ...row, users: row.activeUsers })), pageRows: pageRows.map(row => ({ ...row, users: row.activeUsers, pageviews: row.screenPageViews })), pageRollupRows: pageRollupRows.map(row => ({ ...row, users: row.activeUsers, pageviews: row.screenPageViews })),
    articleAcquisitionRows: articleAcquisitionRows.map(row => ({ ...row, users: row.activeUsers })), eventRows: eventRows.map(row => ({ ...row, events: row.eventCount })),
    targetQueryRows: targetReports.flat() };
  const raw = { version: 1, generatedAt: new Date().toISOString(), latestDate: endDate,
    searchDaily: mergeHistory(cachedRaw?.searchDaily, fresh.searchDaily, startDate, row => row.date),
    searchQueryRows: mergeHistory(cachedRaw?.searchQueryRows, fresh.searchQueryRows, startDate, row => `${row.date}\u0001${row.query}`),
    searchPageRows: mergeHistory(cachedRaw?.searchPageRows, fresh.searchPageRows, startDate, row => `${row.date}\u0001${row.page}`),
    gaDaily: mergeHistory(cachedRaw?.gaDaily, fresh.gaDaily, startDate, row => `${row.date}\u0001${row.sessionDefaultChannelGroup}`),
    acquisitionRows: mergeHistory(cachedRaw?.acquisitionRows, fresh.acquisitionRows, startDate, row => [row.date, row.sessionSource, row.sessionMedium, row.sessionCampaignName, row.sessionManualAdContent].join("\u0001")),
    landingPageRows: mergeHistory(cachedRaw?.landingPageRows, fresh.landingPageRows, startDate, row => [row.date, row.landingPagePlusQueryString, row.sessionDefaultChannelGroup].join("\u0001")),
    pageRows: mergeHistory(cachedRaw?.pageRows, fresh.pageRows, startDate, row => [row.date, row.pagePath, row.pageTitle, row.sessionDefaultChannelGroup].join("\u0001")),
    pageRollupRows: mergeHistory(cachedRaw?.pageRollupRows, fresh.pageRollupRows, startDate, row => [row.date, row.pagePath].join("\u0001")),
    articleAcquisitionRows: mergeHistory(cachedRaw?.articleAcquisitionRows, fresh.articleAcquisitionRows, startDate, row => [row.date, row.pagePath, row.sessionSource, row.sessionMedium, row.sessionCampaignName, row.sessionManualAdContent].join("\u0001")),
    eventRows: mergeHistory(cachedRaw?.eventRows, fresh.eventRows, startDate, row => [row.date, row.eventName, row.pagePath].join("\u0001")),
    articles, targetQueries, targetQueryRows: mergeHistory(cachedRaw?.targetQueryRows, fresh.targetQueryRows, startDate, row => `${row.date}\u0001${row.query}`), importantPaths: (env.SEO_IMPORTANT_PATHS || "").split(",").map(value => value.trim()).filter(Boolean), warnings: [] };
  const priorSync = await env.SEO_CACHE.get(SHEETS_STATE_KEY, "json");
  const initialDays = Math.max(1, Number(env.SHEETS_INITIAL_BACKFILL_DAYS || 28));
  const backfillDays = priorSync?.completedAt ? reconcileDays : initialDays;
  const sheetStart = new Date(`${endDate}T00:00:00.000Z`); sheetStart.setUTCDate(sheetStart.getUTCDate() - backfillDays + 1);
  const sheetStartDate = sheetStart.toISOString().slice(0, 10);
  try {
    raw.sheets = await syncSheets({ spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID, token, rows: makeSheetRows(raw, sheetStartDate, endDate, env.ARTICLE_TARGET_KEYWORDS || "") });
    if (!raw.sheets.skipped) await env.SEO_CACHE.put(SHEETS_STATE_KEY, JSON.stringify({ completedAt: new Date().toISOString(), lastStartDate: sheetStartDate, lastEndDate: endDate, ...raw.sheets }));
    if (raw.sheets.skipped) raw.warnings.push(`Google Sheets保存は未設定です: ${raw.sheets.reason}`);
  } catch (error) {
    raw.sheets = { failed: true, message: error instanceof Error ? error.message : "Google Sheets sync failed" };
    raw.warnings.push(`Google Sheets保存エラー: ${raw.sheets.message}`);
    console.error("SEO Sheets sync failed", error);
  }
  // Keep the historical cache beyond the current reporting window. Daily runs
  // merge only the reconciliation window, which avoids re-querying old data.
  await env.SEO_CACHE.put(CACHE_KEY, JSON.stringify(raw));
  return raw;
}

function authorized(request, env) {
  const header = request.headers.get("authorization") || "";
  return env.DASHBOARD_REFRESH_TOKEN && header === `Bearer ${env.DASHBOARD_REFRESH_TOKEN}`;
}

export default {
  async fetch(request, env) {
    // The worker.dev deployment has no Cloudflare Access application because
    // the account's free checkout requires a billing method. Fail closed until
    // the dedicated dashboard credentials are configured in Worker secrets.
    if (!hasDashboardAccess(request, env)) return dashboardAuthRequired();
    const url = new URL(request.url);
    if (url.pathname === "/api/dashboard") {
      const raw = await env.SEO_CACHE.get(CACHE_KEY, "json");
      if (!raw) return json({ error: "データ未取得", message: "初回更新を実行してください。" }, 503);
      return json(buildDashboard(raw, url.searchParams.get("period") || "28"));
    }
    if (url.pathname === "/api/admin/refresh" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      try { const raw = await refresh(env); return json({ ok: true, generatedAt: raw.generatedAt, latestDate: raw.latestDate, sheets: raw.sheets }); }
      catch (error) { return json({ error: "refresh_failed", message: error instanceof Error ? error.message : "Unknown error" }, 502); }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refresh(env).catch(error => console.error("SEO refresh failed", error)));
  }
};
