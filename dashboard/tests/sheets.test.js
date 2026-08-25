import test from "node:test";
import assert from "node:assert/strict";
import { makeSheetRows } from "../sheets.js";

test("sheet rows use natural keys and aggregate GA page dimensions", () => {
  const raw = {
    searchDaily: [{ date: "2026-08-20", clicks: 10, impressions: 100, ctr: .1, position: 12 }],
    gaDaily: [{ date: "2026-08-20", sessionDefaultChannelGroup: "Organic Search", users: 8, sessions: 10, pageviews: 14, keyEvents: 1 }],
    searchQueryRows: [{ date: "2026-08-20", query: "売上が伸びない 原因", clicks: 2, impressions: 30, ctr: .06, position: 20 }],
    searchPageRows: [{ date: "2026-08-20", page: "https://makenai-mark.com/insights/sales-not-growing/", clicks: 2, impressions: 30, ctr: .06, position: 20 }],
    pageRollupRows: [{ date: "2026-08-20", pagePath: "/insights/sales-not-growing/", users: 4, sessions: 5, pageviews: 7, keyEvents: 0 }, { date: "2026-08-20", pagePath: "/insights/sales-not-growing/", users: 1, sessions: 1, pageviews: 2, keyEvents: 1 }],
    acquisitionRows: [{ date: "2026-08-20", sessionSource: "x", sessionMedium: "social", sessionCampaignName: "x_launch", sessionManualAdContent: "post03", users: 3, sessions: 4, pageviews: 5, keyEvents: 1 }],
    eventRows: [{ date: "2026-08-20", eventName: "contact_submit_click", pagePath: "/contact/", events: 2 }, { date: "2026-08-20", eventName: "diagnosis_submission_success", pagePath: "/thanks-diagnosis/", events: 1 }],
    articles: [{ url: "https://makenai-mark.com/insights/sales-not-growing/", title: "売上が伸びない原因", publishedAt: "2026-08-22" }]
  };
  const rows = makeSheetRows(raw, "2026-08-20", "2026-08-20", '{"/insights/sales-not-growing/":"売上が伸びない 原因"}');
  assert.deepEqual(rows.daily_summary[0], ["2026-08-20", 10, 100, .1, 12, 8, 10, 14, 1]);
  assert.deepEqual(rows.ga4_pages[0], ["2026-08-20", "/insights/sales-not-growing/", 5, 6, 9, 1]);
  assert.deepEqual(rows.utm_traffic[0], ["2026-08-20", "x", "social", "x_launch", "post03", 3, 4, 5, 1]);
  assert.deepEqual(rows.form_events, [["2026-08-20", "contact_submit_click", "/contact/", 2], ["2026-08-20", "diagnosis_submission_success", "/thanks-diagnosis/", 1]]);
  assert.deepEqual(rows.articles[0].slice(2), ["2026-08-22", "売上が伸びない 原因", "published"]);
  assert.equal(rows.seo_actions.length, 1);
});
