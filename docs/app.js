'use strict';

mountFeed({
  feed: './data.json',
  streamLabel: '最新动态',
  leadKicker: '头条 / Lead Story',
  labelOf: (it) => it.source,
  renderStats(data) {
    const ok = data.sources.filter((s) => s.ok).length;
    const now = data.items.filter((i) => Date.now() - Date.parse(i.time) < 3600 * 1000).length;
    return `
    <div class="stat"><b>${data.items.length}</b><span>条资讯</span></div>
    <div class="stat"><b>${ok}/${data.sources.length}</b><span>数据源在线</span></div>
    <div class="stat"><b>${now}</b><span>近 1 小时</span></div>`;
  },
  renderSources(data, esc) {
    return data.sources.map((s) => `
    <div class="srcrow ${s.ok ? 'ok' : 'bad'}" title="${esc(s.error || '')}">
      <span class="dot"></span><span>${esc(s.name)}</span><span class="cnt">${s.ok ? s.count : '离线'}</span>
    </div>`).join('');
  },
});
