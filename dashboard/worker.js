import { buildDashboard, dateRange } from "./lib.js";

const CACHE_KEY = "seo-dashboard/raw-v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/webmasters.readonly"];

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const base64url = (value) => btoa(typeof value === "string" ? value : String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const text = (value) => new TextEncoder().encode(value);

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
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 3); // GSC final data delay
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 729); // enough for 365d + comparison
  const startDate = start.toISOString().slice(0, 10); const endDate = end.toISOString().slice(0, 10);
  const targetQueries = (env.SEO_TARGET_QUERIES || "").split(",").map(value => value.trim()).filter(Boolean).slice(0, 10);
  const [searchDaily, searchQueryRows, searchPageRows, gaDaily, acquisitionRows, landingPageRows, pageRows, articleAcquisitionRows, eventRows, articles, ...targetReports] = await Promise.all([
    scReport(env, token, ["date"], startDate, endDate),
    scReport(env, token, ["date", "query"], startDate, endDate),
    scReport(env, token, ["date", "page"], startDate, endDate),
    gaReport(env, token, ["date", "sessionDefaultChannelGroup"], ["activeUsers", "sessions", "screenPageViews", "keyEvents"], startDate, endDate),
    gaReport(env, token, ["date", "sessionSource", "sessionMedium", "sessionCampaignName", "sessionManualAdContent"], ["activeUsers", "sessions"], startDate, endDate),
    gaReport(env, token, ["date", "landingPagePlusQueryString", "sessionDefaultChannelGroup"], ["activeUsers", "sessions"], startDate, endDate),
    gaReport(env, token, ["date", "pagePath", "pageTitle", "sessionDefaultChannelGroup"], ["activeUsers", "sessions", "screenPageViews"], startDate, endDate),
    gaReport(env, token, ["date", "pagePath", "sessionSource", "sessionMedium", "sessionCampaignName", "sessionManualAdContent"], ["activeUsers", "sessions"], startDate, endDate),
    gaReport(env, token, ["date", "eventName", "pagePath"], ["keyEvents", "eventCount"], startDate, endDate),
    siteArticles(env.PUBLIC_SITE_ORIGIN || "https://makenai-mark.com"),
    ...targetQueries.map(query => scReport(env, token, ["date", "query"], startDate, endDate, [{ filters: [{ dimension: "query", operator: "equals", expression: query }] }]))
  ]);
  const raw = { version: 1, generatedAt: new Date().toISOString(), latestDate: endDate, searchDaily, searchQueryRows, searchPageRows,
    gaDaily: gaDaily.map(row => ({ ...row, users: row.activeUsers, pageviews: row.screenPageViews })),
    acquisitionRows: acquisitionRows.map(row => ({ ...row, users: row.activeUsers })), landingPageRows: landingPageRows.map(row => ({ ...row, users: row.activeUsers })), pageRows: pageRows.map(row => ({ ...row, users: row.activeUsers, pageviews: row.screenPageViews })),
    articleAcquisitionRows: articleAcquisitionRows.map(row => ({ ...row, users: row.activeUsers })), eventRows: eventRows.map(row => ({ ...row, events: row.eventCount })),
    articles, targetQueries, targetQueryRows: targetReports.flat(), importantPaths: (env.SEO_IMPORTANT_PATHS || "").split(",").map(value => value.trim()).filter(Boolean), warnings: [] };
  await env.SEO_CACHE.put(CACHE_KEY, JSON.stringify(raw), { expirationTtl: 60 * 60 * 36 });
  return raw;
}

function authorized(request, env) {
  const header = request.headers.get("authorization") || "";
  return env.DASHBOARD_REFRESH_TOKEN && header === `Bearer ${env.DASHBOARD_REFRESH_TOKEN}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/dashboard") {
      const raw = await env.SEO_CACHE.get(CACHE_KEY, "json");
      if (!raw) return json({ error: "データ未取得", message: "初回更新を実行してください。" }, 503);
      return json(buildDashboard(raw, url.searchParams.get("period") || "28"));
    }
    if (url.pathname === "/api/admin/refresh" && request.method === "POST") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      try { const raw = await refresh(env); return json({ ok: true, generatedAt: raw.generatedAt, latestDate: raw.latestDate }); }
      catch (error) { return json({ error: "refresh_failed", message: error instanceof Error ? error.message : "Unknown error" }, 502); }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refresh(env).catch(error => console.error("SEO refresh failed", error)));
  }
};
