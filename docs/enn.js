'use strict';

const $ = (s) => document.querySelector(s);
const leadEl = $('#lead');
const grid = $('#grid');
const emptyEl = $('#empty');
const filtersEl = $('#filters');
const statsEl = $('#stats');
const sourcesEl = $('#sources');
const updatedEl = $('#updated');
const streamLabel = $('#streamLabel');
const streamCount = $('#streamCount');
const refreshBtn = $('#refresh');
const autoEl = $('#auto');
const searchEl = $('#search');

let DATA = { items: [], sources: [], updatedAt: null };
let activeSource = 'all';
let query = '';
let timer = null;

/* 媒体名（Google News 的 outlet 优先） */
const srcOf = (it) => it.outlet || it.source || '其他';

(function dateline() {
  const d = new Date();
  const wd = '日一二三四五六'[d.getDay()];
  const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  $('#dateline').textContent = `${date} · 星期${wd}`;
})();

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
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(iso) {
  const t = Date.parse(iso);
  return isNaN(t) ? '' : new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderFilters() {
  const map = new Map();
  for (const it of DATA.items) map.set(srcOf(it), (map.get(srcOf(it)) || 0) + 1);
  const tabs = [`<button class="tab ${activeSource === 'all' ? 'active' : ''}" data-s="all">全部<span class="n">${DATA.items.length}</span></button>`];
  for (const [name, n] of [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    tabs.push(`<button class="tab ${activeSource === name ? 'active' : ''}" data-s="${esc(name)}">${esc(name)}<span class="n">${n}</span></button>`);
  }
  filtersEl.innerHTML = tabs.join('');
}

function renderStats() {
  const ok = DATA.sources.filter((s) => s.ok).length;
  const now = DATA.items.filter((i) => Date.now() - Date.parse(i.time) < 3600 * 1000).length;
  const media = new Set(DATA.items.map(srcOf)).size;
  statsEl.innerHTML = `
    <div class="stat"><b>${DATA.items.length}</b><span>条报道</span></div>
    <div class="stat"><b>${media}</b><span>家媒体</span></div>
    <div class="stat"><b>${now}</b><span>近 1 小时</span></div>
    <div class="stat"><b>${ok}/${DATA.sources.length}</b><span>检索词在线</span></div>`;
}

function renderSources() {
  sourcesEl.innerHTML = DATA.sources.map((s) => `
    <div class="srcrow ${s.ok ? 'ok' : 'bad'}" title="${esc(s.error || '')}">
      <span class="dot"></span><span>${esc(s.name)}</span><span class="cnt">${s.ok ? s.count : '离线'}</span>
    </div>`).join('');
}

function leadCard(it) {
  leadEl.style.display = '';
  leadEl.innerHTML = `
    <article class="lead-card">
      <div class="lead-main">
        <span class="kicker accent">最新报道 / LATEST</span>
        <h2 class="lead-title"><a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></h2>
        ${it.summary ? `<p class="lead-deck">${esc(it.summary)}</p>` : ''}
      </div>
      <div class="lead-meta">
        <span class="src">${esc(srcOf(it))}</span>
        <span>·</span>
        <span>${relTime(it.time)} · ${fmtTime(it.time)}</span>
        <a class="read" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">阅读全文 →</a>
      </div>
    </article>`;
}

function streamItem(it, i) {
  return `<li class="item" style="--i:${i}">
    <span class="idx">${String(i + 1).padStart(2, '0')}</span>
    <div class="body">
      <h3 class="item-title"><a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></h3>
      ${it.summary ? `<p class="item-sum">${esc(it.summary)}</p>` : ''}
      <div class="item-meta">
        <span class="src">${esc(srcOf(it))}</span>
        <span class="time">${relTime(it.time)}</span>
      </div>
    </div>
  </li>`;
}

function render() {
  const q = query.trim().toLowerCase();
  const filtering = activeSource !== 'all' || q.length > 0;
  const list = DATA.items.filter((it) =>
    (activeSource === 'all' || srcOf(it) === activeSource) &&
    (!q || it.title.toLowerCase().includes(q) || srcOf(it).toLowerCase().includes(q)));

  renderFilters(); renderStats(); renderSources();

  if (!list.length) {
    leadEl.style.display = 'none';
    grid.innerHTML = '';
    emptyEl.hidden = false;
    streamLabel.textContent = '最新报道';
    streamCount.textContent = '';
    return;
  }
  emptyEl.hidden = true;

  if (filtering) {
    leadEl.style.display = 'none';
    streamLabel.textContent = activeSource === 'all' ? '搜索结果' : activeSource;
    streamCount.textContent = `${list.length} 条`;
    grid.innerHTML = list.map(streamItem).join('');
  } else {
    const lead = list.find((it) => it.summary && it.summary.length >= 40) || list[0];
    leadCard(lead);
    const rest = list.filter((it) => it !== lead);
    streamLabel.textContent = '最新报道';
    streamCount.textContent = `${rest.length} 条`;
    grid.innerHTML = rest.map(streamItem).join('');
  }
}

async function load(refresh = false) {
  refreshBtn.disabled = true;
  refreshBtn.textContent = refresh ? '抓取中…' : '刷新';
  try {
    const r = await fetch('./enn-data.json' + (refresh ? '?t=' + Date.now() : ''));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DATA = await r.json();
    updatedEl.textContent = '更新于 ' + new Date(DATA.updatedAt).toLocaleString('zh-CN');
    render();
  } catch (e) {
    grid.innerHTML = `<li class="empty">加载失败：${esc(String(e.message || e))}</li>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '刷新';
  }
}

filtersEl.addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  activeSource = t.dataset.s;
  render();
});
searchEl.addEventListener('input', () => { query = searchEl.value; render(); });
refreshBtn.addEventListener('click', () => load(true));
autoEl.addEventListener('change', () => {
  clearInterval(timer);
  if (autoEl.checked) timer = setInterval(() => load(false), 5 * 60 * 1000);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && autoEl.checked) load(false); });

timer = setInterval(() => load(false), 5 * 60 * 1000);
load(false);
