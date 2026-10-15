'use strict';

const $ = (s) => document.querySelector(s);
const grid = $('#grid');
const emptyEl = $('#empty');
const filtersEl = $('#filters');
const statsEl = $('#stats');
const sourcesEl = $('#sources');
const updatedEl = $('#updated');
const refreshBtn = $('#refresh');
const autoEl = $('#auto');
const searchEl = $('#search');

let DATA = { items: [], sources: [], updatedAt: null };
let activeSource = 'all';
let query = '';
let timer = null;

function relTime(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 7) return Math.floor(d / 86400) + ' 天前';
  return new Date(t).toLocaleDateString('zh-CN');
}

function esc(s = '') {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function skeletons(n = 9) {
  grid.innerHTML = Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
}

function renderFilters() {
  const map = new Map();
  for (const it of DATA.items) {
    if (!map.has(it.source)) map.set(it.source, { source: it.source, n: 0 });
    map.get(it.source).n++;
  }
  const chips = [`<button class="chip ${activeSource === 'all' ? 'active' : ''}" data-s="all">全部 (${DATA.items.length})</button>`];
  for (const v of [...map.values()].sort((a, b) => b.n - a.n)) {
    chips.push(`<button class="chip ${activeSource === v.source ? 'active' : ''}" data-s="${esc(v.source)}">${esc(v.source)} (${v.n})</button>`);
  }
  filtersEl.innerHTML = chips.join('');
}

function renderStats() {
  const ok = DATA.sources.filter((s) => s.ok).length;
  const total = DATA.sources.length;
  const now = DATA.items.filter((i) => Date.now() - Date.parse(i.time) < 3600 * 1000).length;
  statsEl.innerHTML = `
    <div class="stat"><b>${DATA.items.length}</b><span>条新闻</span></div>
    <div class="stat"><b>${ok}/${total}</b><span>数据源在线</span></div>
    <div class="stat"><b>${now}</b><span>近 1 小时</span></div>`;
}

function renderSources() {
  sourcesEl.innerHTML = DATA.sources.map((s) =>
    s.ok ? `<span class="srcok">● ${esc(s.name)} · ${s.count}</span>`
         : `<span class="srcbad" title="${esc(s.error || '')}">● ${esc(s.name)} · 离线</span>`).join('');
}

function renderGrid() {
  const q = query.trim().toLowerCase();
  const list = DATA.items.filter((it) =>
    (activeSource === 'all' || it.source === activeSource) &&
    (!q || it.title.toLowerCase().includes(q) || it.source.toLowerCase().includes(q)));

  emptyEl.hidden = list.length > 0;
  grid.innerHTML = list.map((it) => `
    <article class="card">
      <h3><a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></h3>
      ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ''}
      <div class="foot">
        <span class="src"><i class="dot"></i>${esc(it.source)}</span>
        <span class="time">${relTime(it.time)}</span>
      </div>
    </article>`).join('');
}

function render() { renderStats(); renderFilters(); renderGrid(); renderSources(); }

async function load(refresh = false) {
  refreshBtn.disabled = true;
  refreshBtn.textContent = refresh ? '↻ 抓取中…' : '↻ 刷新';
  if (!DATA.items.length) skeletons();
  try {
    const r = await fetch('./data.json' + (refresh ? '?t=' + Date.now() : ''));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DATA = await r.json();
    updatedEl.textContent = '更新于 ' + new Date(DATA.updatedAt).toLocaleString('zh-CN');
    render();
  } catch (e) {
    grid.innerHTML = `<p class="empty">加载失败：${esc(String(e.message || e))}</p>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ 刷新';
  }
}

filtersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  activeSource = btn.dataset.s;
  render();
});
searchEl.addEventListener('input', () => { query = searchEl.value; renderGrid(); });
refreshBtn.addEventListener('click', () => load(true));
autoEl.addEventListener('change', () => {
  clearInterval(timer);
  if (autoEl.checked) timer = setInterval(() => load(false), 5 * 60 * 1000);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && autoEl.checked) load(false); });

timer = setInterval(() => load(false), 5 * 60 * 1000);
load(false);
