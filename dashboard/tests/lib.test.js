import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, health } from "../lib.js";

test("new or sparse data is never labelled needs-work", () => {
  const result = health({ search: { clicks: 0, impressions: 4, position: 0 }, organic: { users: 0, sessions: 0 } }, { search: { clicks: 0, impressions: 0, position: 0 }, organic: { users: 0, sessions: 0 } }, 7);
  assert.equal(result.status, "insufficient");
});

test("dashboard joins query, column, social and diagnosis data for selected period", () => {
  const raw = {
    generatedAt: "2026-08-24T00:00:00.000Z", latestDate: "2026-08-20",
    searchDaily: [{ date: "2026-08-20", clicks: 12, impressions: 100, ctr: .12, position: 8 }, { date: "2026-07-23", clicks: 7, impressions: 80, ctr: .0875, position: 11 }],
    gaDaily: [{ date: "2026-08-20", sessionDefaultChannelGroup: "Organic Search", users: 20, sessions: 24, pageviews: 31, keyEvents: 1 }, { date: "2026-07-23", sessionDefaultChannelGroup: "Organic Search", users: 11, sessions: 12, pageviews: 19, keyEvents: 0 }],
    searchQueryRows: [{ date: "2026-08-20", query: "売上が伸びない 原因", clicks: 5, impressions: 30, ctr: .16, position: 7 }],
    searchPageRows: [{ date: "2026-08-20", page: "https://makenai-mark.com/insights/sales-not-growing/", clicks: 6, impressions: 35, ctr: .17, position: 6 }],
    pageRows: [{ date: "2026-08-20", pagePath: "/insights/sales-not-growing/", sessionDefaultChannelGroup: "Organic Search", users: 10, sessions: 12, pageviews: 18 }, { date: "2026-08-20", pagePath: "/diagnosis/", users: 4, sessions: 4, pageviews: 6 }],
    articleAcquisitionRows: [{ date: "2026-08-20", pagePath: "/insights/sales-not-growing/", sessionSource: "x", sessionManualAdContent: "post03", users: 3, sessions: 4 }],
    acquisitionRows: [{ date: "2026-08-20", sessionSource: "x", sessionManualAdContent: "post03", users: 3, sessions: 4 }],
    eventRows: [{ date: "2026-08-20", eventName: "diagnosis_cta_click", pagePath: "/insights/sales-not-growing/", events: 2 }, { date: "2026-08-20", eventName: "generate_lead", pagePath: "/thanks-diagnosis/", events: 1 }],
    articles: [{ url: "https://makenai-mark.com/insights/sales-not-growing/", title: "売上が伸びない原因", publishedAt: "2026-08-22" }], targetQueries: ["売上が伸びない 原因"], targetQueryRows: [{ date: "2026-08-20", query: "売上が伸びない 原因", clicks: 5, impressions: 30, ctr: .16, position: 7 }], warnings: []
  };
  const data = buildDashboard(raw, "28");
  assert.equal(data.current.search.clicks, 12);
  assert.equal(data.articles[0].socialSessions, 4);
  assert.equal(data.articles[0].diagnosisTransitions, 2);
  assert.equal(data.social[0].posts[0].name, "post03");
  assert.equal(data.targets[0].current.position, 7);
});
