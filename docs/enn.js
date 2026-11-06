'use strict';

const labelOf = (it) => it.outlet || it.source || '其他';

mountFeed({
  feed: './enn-data.json',
  streamLabel: '最新报道',
  leadKicker: '最新报道 / LATEST',
  filterLimit: 12,
  labelOf,
  renderStats(data) {
    const ok = data.sources.filter((s) => s.ok).length;
    const now = data.items.filter((i) => Date.now() - Date.parse(i.time) < 3600 * 1000).length;
    const media = new Set(data.items.map(labelOf)).size;
    return `
    <div class="stat"><b>${data.items.length}</b><span>条报道</span></div>
    <div class="stat"><b>${media}</b><span>家媒体</span></div>
    <div class="stat"><b>${now}</b><span>近 1 小时</span></div>
    <div class="stat"><b>${ok}/${data.sources.length}</b><span>检索词在线</span></div>`;
  },
  renderSources(data, esc) {
    return data.sources.map((s) => `
    <div class="srcrow ${s.ok ? 'ok' : 'bad'}" title="${esc(s.error || '')}">
      <span class="dot"></span><span>${esc(s.name)}</span><span class="cnt">${s.ok ? s.count : '离线'}</span>
    </div>`).join('');
  },
});
