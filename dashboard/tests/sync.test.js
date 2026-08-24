import test from "node:test";
import assert from "node:assert/strict";
import { SHEETS, syncSheets } from "../sheets.js";

test("empty sheets receive headers and data begins at row 2", async () => {
  const originalFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("?fields=")) return new Response(JSON.stringify({ sheets: Object.keys(SHEETS).map(title => ({ properties: { title, gridProperties: { rowCount: 1000 } } })) }));
    if (String(url).includes("values:batchGet")) return new Response(JSON.stringify({ valueRanges: Object.keys(SHEETS).map(() => ({ values: [] })) }));
    return new Response(JSON.stringify({}));
  };
  try {
    const result = await syncSheets({ spreadsheetId: "sheet-id", token: "token", rows: { daily_summary: [["2026-08-20", 1, 2, .5, 3, 4, 5, 6, 7]] } });
    assert.equal(result.appendedRows, 1);
    const body = JSON.parse(calls.at(-1).options.body);
    assert.ok(body.data.some(range => range.range === "daily_summary!A1:I1"));
    assert.ok(body.data.some(range => range.range === "daily_summary!A2:I2"));
  } finally { globalThis.fetch = originalFetch; }
});

test("an existing natural key is updated in place instead of appended", async () => {
  const originalFetch = globalThis.fetch; const calls = [];
  const existingDaily = [SHEETS.daily_summary.headers, ["2026-08-20", 1, 2, .5, 3, 4, 5, 6, 7]];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("?fields=")) return new Response(JSON.stringify({ sheets: Object.keys(SHEETS).map(title => ({ properties: { title, gridProperties: { rowCount: 1000 } } })) }));
    if (String(url).includes("values:batchGet")) return new Response(JSON.stringify({ valueRanges: Object.keys(SHEETS).map(name => ({ values: name === "daily_summary" ? existingDaily : [SHEETS[name].headers] })) }));
    return new Response(JSON.stringify({}));
  };
  try {
    const result = await syncSheets({ spreadsheetId: "sheet-id", token: "token", rows: { daily_summary: [["2026-08-20", 8, 9, .8, 10, 11, 12, 13, 14]] } });
    assert.equal(result.updatedRows, 1); assert.equal(result.appendedRows, 0);
    const body = JSON.parse(calls.at(-1).options.body);
    assert.ok(body.data.some(range => range.range === "daily_summary!A2:I2" && range.values[0][1] === 8));
  } finally { globalThis.fetch = originalFetch; }
});
