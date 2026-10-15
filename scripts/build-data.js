'use strict';
/**
 * 静态构建：抓取所有源并写入 docs/data.json，供 GitHub Pages 静态页面读取。
 * 用法: node scripts/build-data.js
 */
const fs = require('fs');
const path = require('path');
const { loadAll } = require('../lib/aggregate');

(async () => {
  const data = await loadAll();
  const out = path.join(__dirname, '..', 'docs', 'data.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 0));
  const ok = data.sources.filter((s) => s.ok).length;
  console.log(`已写入 ${data.items.length} 条新闻，源在线 ${ok}/${data.sources.length}`);
  for (const s of data.sources) console.log(`  ${s.ok ? '✓' : '✗'} ${s.name} ${s.count} ${s.error || ''}`);
  if (data.items.length === 0) { console.error('没有任何新闻，构建失败'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
