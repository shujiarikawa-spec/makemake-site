const yenNumber = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1 });
let activePeriod = "28";

const el = (id) => document.getElementById(id);
const n = (value) => yenNumber.format(Number(value || 0));
const pct = (value) => value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
const rate = (value) => percent.format(Number(value || 0));
const position = (value) => value ? `${Number(value).toFixed(1)} 位` : "—";
const deltaClass = (value, reverse = false) => value === null || value === undefined ? "na" : (reverse ? value : -value) > 2 ? "up" : (reverse ? value : -value) < -2 ? "down" : "flat";
const delta = (value, reverse = false, suffix = "%") => `<span class="delta ${deltaClass(value, reverse)}">${value === null || value === undefined ? "前月比 —" : `前月比 ${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`}</span>`;

function metrics(data) {
  const items = [
    ["Google検索クリック", data.current.search.clicks, data.changes.clicks, false, n], ["Google検索表示", data.current.search.impressions, data.changes.impressions, false, n],
    ["CTR", data.current.search.ctr, data.changes.ctr, false, rate], ["平均掲載順位", data.current.search.position, data.changes.position, true, position],
    ["オーガニックユーザー", data.current.organic.users, data.changes.organicUsers, false, n], ["オーガニックセッション", data.current.organic.sessions, data.changes.organicSessions, false, n],
    ["コラム閲覧数", data.current.columns.pageviews, data.changes.columnPageviews, false, n], ["診断ページ到達", data.current.diagnosis.pageviews, data.changes.diagnosisPageviews, false, n],
    ["問い合わせ", data.current.inquiries.keyEvents, data.changes.inquiries, false, n]
  ];
  el("metrics").innerHTML = items.map(([label, value, change, reverse, formatter]) => `<article class="metric"><p>${label}</p><strong>${formatter(value)}</strong>${delta(change, reverse, reverse ? " 位" : "%")}</article>`).join("");
}

function health(data) {
  const icon = { improving: "🟢", steady: "🟡", "needs-work": "🔴", insufficient: "⚪" }[data.health.status] || "⚪";
  el("health").className = `health ${data.health.status}`;
  el("health").querySelector("h2").textContent = `${icon} SEO HEALTH：${data.health.label}`;
  el("health").querySelector(".health-reason").textContent = data.health.reason || "検索・流入・順位を前期間と比較しています。";
  const signals = [["検索クリック", data.changes.clicks, "%"], ["自然検索流入", data.changes.organicUsers, "%"], ["平均順位", data.changes.position, " 位改善"], ["コラム流入", data.changes.columnPageviews, "%"]];
  el("health-signals").innerHTML = signals.map(([label, value, suffix]) => `<div class="signal"><b>${value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`}</b><span>${label}</span></div>`).join("");
}

function flow(data) {
  const steps = [["Google検索表示", data.current.search.impressions], ["検索クリック", data.current.search.clicks], ["自然検索セッション", data.current.organic.sessions], ["診断ページ到達", data.current.diagnosis.pageviews], ["問い合わせ", data.current.inquiries.keyEvents]];
  el("flow-steps").innerHTML = steps.map(([label, value], index) => `<div class="flow-step"><span>0${index + 1}</span><b>${n(value)}</b><span>${label}</span></div>`).join("");
}

function chartSvg(rows, field, formatter) {
  const values = rows.map(row => Number(row[field] || 0)); const width = 500; const height = 150; const max = Math.max(...values, 1); const min = Math.min(...values, 0);
  const range = max - min || 1; const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * width},${height - ((value - min) / range) * (height - 10) - 5}`).join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  const latest = values.at(-1) || 0;
  return `<p class="chart-value">直近 ${formatter(latest)}</p><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${field}の推移"><line x1="0" y1="12" x2="${width}" y2="12"/><line x1="0" y1="75" x2="${width}" y2="75"/><line x1="0" y1="${height - 2}" x2="${width}" y2="${height - 2}"/><path class="area" d="M ${area} Z"/><path d="M ${points}"/></svg>`;
}

function charts(data) {
  const items = [["Google検索クリック", "clicks", n], ["Google検索表示", "impressions", n], ["CTR", "ctr", rate], ["平均掲載順位", "position", position], ["オーガニックユーザー", "organicUsers", n], ["オーガニックセッション", "organicSessions", n], ["コラム閲覧", "columnPageviews", n], ["診断到達", "diagnosisPageviews", n], ["問い合わせ", "inquiries", n]];
  el("charts").innerHTML = items.map(([title, field, formatter]) => `<article class="chart"><h3>${title}</h3>${chartSvg(data.trend, field, formatter)}</article>`).join("");
}

function targets(data) {
  const section = el("targets-section");
  section.hidden = !data.targets.length;
  el("targets").innerHTML = data.targets.map(target => `<article class="chart"><h3>${escapeHtml(target.query)}</h3>${chartSvg(target.trend, "position", position)}</article>`).join("");
}

function rows(target, data, render, colspan = 5) {
  el(target).innerHTML = data.length ? data.map(render).join("") : `<tr><td colspan="${colspan}">この期間のデータはありません。</td></tr>`;
}

function searchTables(data) {
  const render = row => `<tr><td title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</td><td>${n(row.clicks)}</td><td>${n(row.impressions)}</td><td>${rate(row.ctr)}</td><td>${position(row.position)}</td></tr>`;
  rows("queries", data.queries, render); rows("important-pages", data.importantPages, render); rows("pages", data.pages, render);
}

function articles(data) {
  rows("articles", data.articles, row => `<tr><td title="${escapeHtml(row.title)}"><a href="${escapeHtml(row.url)}" target="_blank" rel="noopener">${escapeHtml(row.title)}</a></td><td>${row.publishedAt || "未取得"}</td><td>${n(row.clicks)}</td><td>${n(row.impressions)}</td><td>${position(row.position)}</td><td>${n(row.users)}</td><td>${n(row.sessions)}</td><td>${n(row.pageviews)}</td><td>${n(row.organicSessions)}</td><td>${n(row.socialSessions)}</td><td>${n(row.diagnosisTransitions)}</td></tr>`, 11);
}

function social(data) {
  el("social").innerHTML = data.social.map(network => `<article class="social-card"><h3>${network.network}</h3><div class="social-total"><div><b>${n(network.sessions)}</b><span>セッション</span></div><div><b>${n(network.users)}</b><span>ユーザー</span></div></div><ul class="post-list">${network.posts.length ? network.posts.slice(0, 12).map(post => `<li><span>${escapeHtml(post.name)}</span><b>${n(post.sessions)} セッション</b></li>`).join("") : "<li><span>UTM付き流入はありません。</span></li>"}</ul></article>`).join("");
}

function initiatives(data) {
  el("initiatives").innerHTML = data.initiatives.length ? data.initiatives.map(item => `<article class="initiative"><time>${item.publishedAt || "公開日未取得"}</time><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></article>`).join("") : "<p>サイトマップからコラムを取得できませんでした。</p>";
}

function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value || ""); return div.innerHTML; }

function render(data) {
  el("updated").textContent = `最終取得：${new Date(data.generatedAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}`;
  el("range").textContent = `${data.range.current.start} 〜 ${data.range.current.end}（前期間比較）`;
  health(data); metrics(data); flow(data); charts(data); searchTables(data); targets(data); articles(data); social(data); initiatives(data);
  const warning = el("warnings"); const list = warning.querySelector("ul"); list.innerHTML = data.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join(""); warning.hidden = !data.warnings.length;
}

async function load() {
  el("updated").textContent = "データを読み込んでいます";
  try { const response = await fetch(`/api/dashboard?period=${activePeriod}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error); render(data); }
  catch (error) { el("updated").textContent = `表示エラー：${error.message}`; el("health").querySelector("h2").textContent = "⚪ SEO HEALTH：データを取得できません"; el("health").querySelector(".health-reason").textContent = "接続設定または初回更新の状態を確認してください。"; }
}

document.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click", () => { activePeriod = button.dataset.period; document.querySelectorAll("[data-period]").forEach(item => item.classList.toggle("active", item === button)); load(); }));
el("reload").addEventListener("click", load); load();
