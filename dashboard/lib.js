/* Shared, dependency-free data shaping for the Worker and the dashboard UI. */
export const PERIOD_DAYS = Object.freeze({ "7": 7, "28": 28, "90": 90, "183": 183, "365": 365 });
export const DEFAULT_IMPORTANT_PATHS = Object.freeze(["/", "/theory/", "/structure/", "/services/", "/diagnosis/", "/glossary/", "/performance/", "/ceo/", "/company/"]);

export function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function dateRange(days, latest) {
  const end = new Date(`${latest}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return {
    current: { start: isoDate(start), end: isoDate(end) },
    previous: { start: isoDate(previousStart), end: isoDate(previousEnd) }
  };
}

export function inRange(date, range) {
  return date >= range.start && date <= range.end;
}

export function number(value) { return Number(value || 0); }
export function pctChange(current, previous) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}
export function ratio(numerator, denominator) { return denominator ? numerator / denominator : 0; }

export function reduceSearch(rows) {
  const clicks = rows.reduce((sum, row) => sum + number(row.clicks), 0);
  const impressions = rows.reduce((sum, row) => sum + number(row.impressions), 0);
  const weightedPosition = rows.reduce((sum, row) => sum + number(row.position) * number(row.impressions), 0);
  return { clicks, impressions, ctr: ratio(clicks, impressions), position: impressions ? weightedPosition / impressions : 0 };
}

export function reduceGa(rows) {
  return rows.reduce((total, row) => ({
    users: total.users + number(row.users),
    sessions: total.sessions + number(row.sessions),
    pageviews: total.pageviews + number(row.pageviews),
    keyEvents: total.keyEvents + number(row.keyEvents)
  }), { users: 0, sessions: 0, pageviews: 0, keyEvents: 0 });
}

export function health(current, previous, sampleDays) {
  const signals = [
    pctChange(current.search.clicks, previous.search.clicks),
    pctChange(current.search.impressions, previous.search.impressions),
    // Lower average position is better, so invert the comparison.
    previous.search.position && current.search.position ? ((previous.search.position - current.search.position) / previous.search.position) * 100 : null,
    pctChange(current.organic.users, previous.organic.users)
  ].filter(value => value !== null && Number.isFinite(value));
  const evidence = current.search.impressions + previous.search.impressions + current.organic.sessions + previous.organic.sessions;
  if (sampleDays < 14 || evidence < 30 || signals.length < 3) {
    return { status: "insufficient", label: "データ不足", reason: "判定に必要なデータが不足しています" };
  }
  const up = signals.filter(value => value >= 5).length;
  const down = signals.filter(value => value <= -5).length;
  if (up >= 2 && up > down) return { status: "improving", label: "改善中" };
  if (down >= 2 && down > up) return { status: "needs-work", label: "要改善" };
  return { status: "steady", label: "横ばい" };
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const value = key(row);
    (groups[value] ||= []).push(row);
    return groups;
  }, {});
}

function safePath(value) {
  try { return new URL(value, "https://makenai-mark.com").pathname; } catch { return value || "/"; }
}

function aggregateTable(rows, key, reducer) {
  return Object.entries(groupBy(rows, key)).map(([name, subset]) => ({ name, ...reducer(subset) }));
}

function socialNetwork(row) {
  const source = String(row.sessionSource || "").toLowerCase();
  if (["x", "twitter", "t.co"].includes(source)) return "X";
  if (["instagram", "ig", "l.instagram.com"].includes(source)) return "Instagram";
  return null;
}

export function buildDashboard(raw, periodKey = "28") {
  const days = PERIOD_DAYS[periodKey] || PERIOD_DAYS["28"];
  const latest = raw.latestDate;
  const ranges = dateRange(days, latest);
  const select = (rows, range) => (rows || []).filter(row => inRange(row.date, range));
  const searchCurrentRows = select(raw.searchDaily, ranges.current);
  const searchPreviousRows = select(raw.searchDaily, ranges.previous);
  const gaCurrentRows = select(raw.gaDaily, ranges.current);
  const gaPreviousRows = select(raw.gaDaily, ranges.previous);
  const organic = (rows) => reduceGa(rows.filter(row => String(row.sessionDefaultChannelGroup || "").toLowerCase() === "organic search"));
  const diagnosis = (rows) => reduceGa((raw.pageRows || []).filter(row => inRange(row.date, rows) && safePath(row.pagePath) === "/diagnosis/"));
  const inquiry = (rows) => reduceGa((raw.eventRows || []).filter(row => inRange(row.date, rows) && row.eventName === "generate_lead"));
  const columns = (rows) => reduceGa((raw.pageRows || []).filter(row => inRange(row.date, rows) && safePath(row.pagePath).startsWith("/insights/")));
  const current = {
    search: reduceSearch(searchCurrentRows),
    ga: reduceGa(gaCurrentRows),
    organic: organic(gaCurrentRows),
    columns: columns(ranges.current),
    diagnosis: diagnosis(ranges.current),
    inquiries: inquiry(ranges.current)
  };
  const previous = {
    search: reduceSearch(searchPreviousRows),
    ga: reduceGa(gaPreviousRows),
    organic: organic(gaPreviousRows),
    columns: columns(ranges.previous),
    diagnosis: diagnosis(ranges.previous),
    inquiries: inquiry(ranges.previous)
  };
  const rangeRows = (rows) => select(rows || [], ranges.current);
  const queries = aggregateTable(rangeRows(raw.searchQueryRows), row => row.query, reduceSearch)
    .filter(row => row.name).sort((a, b) => b.clicks - a.clicks).slice(0, 100);
  const pages = aggregateTable(rangeRows(raw.searchPageRows), row => safePath(row.page), reduceSearch)
    .filter(row => row.name).sort((a, b) => b.clicks - a.clicks).slice(0, 100);
  const importantPaths = raw.importantPaths?.length ? raw.importantPaths : DEFAULT_IMPORTANT_PATHS;
  const importantPages = importantPaths.map(path => pages.find(page => page.name === path) || { name: path, clicks: 0, impressions: 0, ctr: 0, position: 0 });
  const articleRows = rangeRows(raw.pageRows).filter(row => safePath(row.pagePath).startsWith("/insights/"));
  const articleAcquisition = rangeRows(raw.articleAcquisitionRows).filter(row => safePath(row.pagePath).startsWith("/insights/"));
  const articleGroups = groupBy(articleRows, row => safePath(row.pagePath));
  const articles = (raw.articles || []).map(article => {
    const path = safePath(article.url);
    const rows = articleGroups[path] || [];
    const sc = pages.find(page => page.name === path) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const total = reduceGa(rows);
    const organicRows = rows.filter(row => String(row.sessionDefaultChannelGroup || "").toLowerCase() === "organic search");
    const socialRows = articleAcquisition.filter(row => safePath(row.pagePath) === path && ["X", "Instagram"].includes(socialNetwork(row)));
    const diagnosisTransitions = (raw.eventRows || []).filter(row => inRange(row.date, ranges.current) && row.eventName === "diagnosis_cta_click" && safePath(row.pagePath) === path)
      .reduce((sum, row) => sum + number(row.events), 0);
    return { ...article, path, ...sc, users: total.users, sessions: total.sessions, pageviews: total.pageviews,
      organicSessions: reduceGa(organicRows).sessions, socialSessions: reduceGa(socialRows).sessions, diagnosisTransitions };
  }).sort((a, b) => b.clicks - a.clicks || b.pageviews - a.pageviews);
  const socialRows = rangeRows(raw.acquisitionRows).filter(row => socialNetwork(row));
  const social = ["X", "Instagram"].map(network => {
    const rows = socialRows.filter(row => socialNetwork(row) === network);
    const totals = reduceGa(rows);
    return {
      network, ...totals,
      posts: aggregateTable(rows, row => row.sessionManualAdContent || row.sessionCampaign || "(UTM contentなし)", reduceGa)
        .sort((a, b) => b.sessions - a.sessions)
    };
  });
  const trend = (raw.searchDaily || []).filter(row => inRange(row.date, ranges.current)).map(row => ({
    date: row.date, clicks: number(row.clicks), impressions: number(row.impressions), ctr: number(row.ctr), position: number(row.position),
    organicUsers: number((raw.gaDaily || []).find(ga => ga.date === row.date && String(ga.sessionDefaultChannelGroup || "").toLowerCase() === "organic search")?.users),
    organicSessions: number((raw.gaDaily || []).find(ga => ga.date === row.date && String(ga.sessionDefaultChannelGroup || "").toLowerCase() === "organic search")?.sessions),
    columnPageviews: columns({ start: row.date, end: row.date }).pageviews,
    diagnosisPageviews: diagnosis({ start: row.date, end: row.date }).pageviews,
    inquiries: inquiry({ start: row.date, end: row.date }).keyEvents
  }));
  const targets = (raw.targetQueries || []).map(query => {
    const rows = (raw.targetQueryRows || []).filter(row => row.query === query);
    return { query, current: reduceSearch(select(rows, ranges.current)), previous: reduceSearch(select(rows, ranges.previous)),
      trend: select(rows, ranges.current).map(row => ({ date: row.date, clicks: number(row.clicks), impressions: number(row.impressions), ctr: number(row.ctr), position: number(row.position) })) };
  });
  return { version: 1, generatedAt: raw.generatedAt, range: { days, ...ranges }, current, previous, changes: {
    clicks: pctChange(current.search.clicks, previous.search.clicks), impressions: pctChange(current.search.impressions, previous.search.impressions),
    ctr: pctChange(current.search.ctr, previous.search.ctr), position: previous.search.position - current.search.position,
    organicUsers: pctChange(current.organic.users, previous.organic.users), organicSessions: pctChange(current.organic.sessions, previous.organic.sessions),
    columnPageviews: pctChange(current.columns.pageviews, previous.columns.pageviews), diagnosisPageviews: pctChange(current.diagnosis.pageviews, previous.diagnosis.pageviews),
    inquiries: pctChange(current.inquiries.keyEvents, previous.inquiries.keyEvents)
  }, health: health(current, previous, days), trend, queries, pages, importantPages, articles, social, initiatives: raw.articles || [], targets, warnings: raw.warnings || [] };
}
