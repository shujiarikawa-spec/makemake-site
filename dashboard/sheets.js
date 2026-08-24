/*
 * Google Sheets persistence.  This module never talks to a browser; the
 * Worker calls it with its server-side service-account token.
 */
export const SHEETS = Object.freeze({
  daily_summary: {
    headers: ["date", "search_clicks", "search_impressions", "search_ctr", "average_position", "organic_users", "organic_sessions", "organic_pageviews", "key_events"],
    key: row => row[0]
  },
  search_queries: {
    headers: ["date", "query", "clicks", "impressions", "ctr", "position"],
    key: row => `${row[0]}\u0001${row[1]}`
  },
  search_pages: {
    headers: ["date", "page", "clicks", "impressions", "ctr", "position"],
    key: row => `${row[0]}\u0001${row[1]}`
  },
  ga4_pages: {
    headers: ["date", "page", "users", "sessions", "pageviews", "key_events"],
    key: row => `${row[0]}\u0001${row[1]}`
  },
  utm_traffic: {
    headers: ["date", "source", "medium", "campaign", "content", "users", "sessions", "pageviews", "key_events"],
    key: row => [row[0], row[1], row[2], row[3], row[4]].join("\u0001")
  },
  articles: {
    headers: ["url", "title", "publish_date", "target_keyword", "status"],
    key: row => row[0]
  },
  seo_actions: {
    headers: ["date", "action_type", "title", "description", "related_url"],
    key: row => [row[0], row[1], row[2], row[4]].join("\u0001")
  }
});

const num = value => Number(value || 0);
const inRange = (date, startDate, endDate) => date >= startDate && date <= endDate;
const sorted = rows => rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

function aggregate(rows, key, initial, combine) {
  const grouped = new Map();
  for (const row of rows) {
    const id = key(row);
    grouped.set(id, combine(grouped.get(id) || initial(), row));
  }
  return [...grouped.values()];
}

function keywordMap(text) {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error("ARTICLE_TARGET_KEYWORDS must be a JSON object keyed by article URL or path");
  }
}

/** Convert the cached API response into the exact, documented Sheet rows. */
export function makeSheetRows(raw, startDate, endDate, targetKeywordJson = "") {
  const selected = rows => (rows || []).filter(row => row.date && inRange(row.date, startDate, endDate));
  const searchByDate = new Map((raw.searchDaily || []).map(row => [row.date, row]));
  const organicByDate = new Map((raw.gaDaily || []).filter(row => String(row.sessionDefaultChannelGroup || "").toLowerCase() === "organic search").map(row => [row.date, row]));
  const dates = [...new Set([...searchByDate.keys(), ...organicByDate.keys()])].filter(date => inRange(date, startDate, endDate)).sort();
  const dailySummary = dates.map(date => {
    const search = searchByDate.get(date) || {};
    const organic = organicByDate.get(date) || {};
    return [date, num(search.clicks), num(search.impressions), num(search.ctr), num(search.position), num(organic.users), num(organic.sessions), num(organic.pageviews), num(organic.keyEvents)];
  });
  const queryRows = sorted(selected(raw.searchQueryRows).map(row => [row.date, row.query || "", num(row.clicks), num(row.impressions), num(row.ctr), num(row.position)]));
  const pageRows = sorted(selected(raw.searchPageRows).map(row => [row.date, row.page || "", num(row.clicks), num(row.impressions), num(row.ctr), num(row.position)]));
  const gaRows = aggregate(selected(raw.pageRollupRows), row => `${row.date}\u0001${row.pagePath}`, () => ({ date: "", page: "", users: 0, sessions: 0, pageviews: 0, keyEvents: 0 }), (total, row) => ({
    date: row.date, page: row.pagePath || "", users: total.users + num(row.users), sessions: total.sessions + num(row.sessions), pageviews: total.pageviews + num(row.pageviews), keyEvents: total.keyEvents + num(row.keyEvents)
  })).map(row => [row.date, row.page, row.users, row.sessions, row.pageviews, row.keyEvents]);
  const utmRows = sorted(selected(raw.acquisitionRows).filter(row => row.sessionSource || row.sessionMedium || row.sessionCampaignName || row.sessionManualAdContent).map(row => [
    row.date, row.sessionSource || "", row.sessionMedium || "", row.sessionCampaignName || "", row.sessionManualAdContent || "", num(row.users), num(row.sessions), num(row.pageviews), num(row.keyEvents)
  ]));
  const targets = keywordMap(targetKeywordJson);
  const articleRows = (raw.articles || []).map(article => [article.url, article.title, article.publishedAt || "", targets[article.url] || targets[new URL(article.url).pathname] || "", "published"]);
  const actionRows = (raw.articles || []).filter(article => article.publishedAt).map(article => [article.publishedAt, "article", article.title, "公開済みコラムを初期登録", new URL(article.url).pathname]);
  return { daily_summary: dailySummary, search_queries: queryRows, search_pages: pageRows, ga4_pages: sorted(gaRows), utm_traffic: utmRows, articles: articleRows, seo_actions: actionRows };
}

async function sheetsRequest(url, token, method = "GET", body) {
  const response = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Google Sheets API request failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  return response.json();
}

function columnName(length) {
  let number = length; let out = "";
  while (number) { const remainder = (number - 1) % 26; out = String.fromCharCode(65 + remainder) + out; number = Math.floor((number - 1) / 26); }
  return out;
}

function valuesBySheet(response, names) {
  const values = {};
  (response.valueRanges || []).forEach((range, index) => { values[names[index]] = range.values || []; });
  return values;
}

/**
 * Creates only missing sheets, validates existing headers, then upserts rows
 * by their natural key. Nothing is deleted, and a non-matching existing
 * header aborts rather than risking someone else's data.
 */
export async function syncSheets({ spreadsheetId, token, rows }) {
  if (!spreadsheetId) return { skipped: true, reason: "GOOGLE_SHEETS_SPREADSHEET_ID is not configured" };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const metadata = await sheetsRequest(`${base}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`, token);
  const current = new Map((metadata.sheets || []).map(sheet => [sheet.properties.title, sheet.properties]));
  const missing = Object.keys(SHEETS).filter(name => !current.has(name));
  if (missing.length) {
    await sheetsRequest(`${base}:batchUpdate`, token, "POST", { requests: missing.map(title => ({ addSheet: { properties: { title } } })) });
    missing.forEach(title => current.set(title, { title, gridProperties: { rowCount: 1000 } }));
  }
  const names = Object.keys(SHEETS);
  const readRanges = names.map(name => {
    const rowCount = Math.max(1000, current.get(name)?.gridProperties?.rowCount || 1000);
    return `${name}!A1:${columnName(SHEETS[name].headers.length)}${rowCount}`;
  });
  const existing = valuesBySheet(await sheetsRequest(`${base}/values:batchGet?${readRanges.map(range => `ranges=${encodeURIComponent(range)}`).join("&")}`, token), names);
  const data = [];
  let updated = 0; let appended = 0;
  for (const name of names) {
    const definition = SHEETS[name]; const values = existing[name] || [];
    const header = values[0] || [];
    if (header.some(value => value !== "") && header.join("\u0001") !== definition.headers.join("\u0001")) throw new Error(`${name} has an existing header that does not match the dashboard schema; no data was written`);
    if (header.join("\u0001") !== definition.headers.join("\u0001")) data.push({ range: `${name}!A1:${columnName(definition.headers.length)}1`, values: [definition.headers] });
    const byKey = new Map();
    values.slice(1).forEach((row, index) => { if (row.length) byKey.set(definition.key(row), index + 2); });
    // Row 1 is always reserved for the schema, including a newly created tab.
    let nextRow = Math.max(values.length + 1, 2);
    for (const row of rows[name] || []) {
      const knownRow = byKey.get(definition.key(row));
      const rowNumber = knownRow || nextRow++;
      data.push({ range: `${name}!A${rowNumber}:${columnName(definition.headers.length)}${rowNumber}`, values: [row] });
      if (knownRow) updated++; else appended++;
    }
  }
  if (data.length) await sheetsRequest(`${base}/values:batchUpdate`, token, "POST", { valueInputOption: "RAW", data });
  return { createdSheets: missing, updatedRows: updated, appendedRows: appended, writtenRanges: data.length };
}
