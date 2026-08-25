import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../docs/scripts/analytics.js", import.meta.url), "utf8");

function loadAnalytics(pathname, storage = new Map()) {
  const listeners = {};
  const sessionStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const window = { location: { pathname }, dataLayer: [], sessionStorage };
  const document = {
    head: { appendChild() {} },
    createElement() { return {}; },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  vm.runInNewContext(source, { window, document, Date });
  return { listeners, events: () => window.dataLayer.filter(([type]) => type === "event").map(args => JSON.parse(JSON.stringify(Array.from(args)))), storage };
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
