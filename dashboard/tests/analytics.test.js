import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../docs/scripts/analytics.js", import.meta.url), "utf8");

function loadAnalytics(pathname, storage = new Map(), search = "") {
  const listeners = {};
  const sessionStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const window = { location: { pathname, search }, dataLayer: [], sessionStorage };
  const document = {
    head: { appendChild() {} },
    createElement() { return {}; },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  vm.runInNewContext(source, { window, document, Date, URLSearchParams });
  return {
    listeners,
    calls: () => JSON.parse(JSON.stringify(window.dataLayer.map(args => Array.from(args)))),
    events: () => window.dataLayer.filter(([type]) => type === "event").map(args => JSON.parse(JSON.stringify(Array.from(args)))),
    storage
  };
}

test("form button clicks and successful redirects are measured separately without form values", () => {
  const storage = new Map();
  const contact = loadAnalytics("/contact/", storage);
  const form = { dataset: { analyticsForm: "contact" } };
  const button = { form, closest: selector => selector.includes('button[type="submit"]') ? button : null };
  contact.listeners.click({ target: button });
  contact.listeners.submit({ target: form });

  assert.deepEqual(contact.events().at(-1), ["event", "contact_submit_click", { page_path: "/contact/", form_type: "contact" }]);
  assert.equal(storage.get("makemake_pending_form_submission"), "contact");

  const thanks = loadAnalytics("/thanks-contact/", storage);
  assert.deepEqual(thanks.events().at(-1), ["event", "contact_submission_success", { page_path: "/thanks-contact/", form_type: "contact" }]);
  assert.equal(storage.has("makemake_pending_form_submission"), false);
});

test("a direct thank-you page visit never creates a completion event", () => {
  const thanks = loadAnalytics("/thanks-diagnosis/");
  assert.equal(thanks.events().some(([, name]) => name === "diagnosis_submission_success"), false);
});

test("only deliberate internal-check URLs set GA4 internal traffic", () => {
  const normal = loadAnalytics("/");
  const internal = loadAnalytics("/", new Map(), "?internal_check=1");

  assert.deepEqual(normal.calls().find(([command]) => command === "config"), ["config", "G-4BL0WG5Y3T", {}]);
  assert.deepEqual(internal.calls().find(([command]) => command === "config"), ["config", "G-4BL0WG5Y3T", { traffic_type: "internal" }]);

  const internalButton = { form: null, closest: selector => selector.includes('a[href="/diagnosis/"]') ? internalButton : null, textContent: "診断" };
  internal.listeners.click({ target: internalButton });
  assert.deepEqual(internal.events().at(-1), ["event", "diagnosis_cta_click", {
    page_path: "/",
    traffic_type: "internal",
    link_text: "診断"
  }]);
});
