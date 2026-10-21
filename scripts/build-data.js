'use strict';
/**
 * 静态构建：抓取所有源并写入 docs/data.json（AI 资讯）与 docs/enn-data.json（新奥集团专题）。
 * 用法: node scripts/build-data.js
 */
const fs = require('fs');
const path = require('path');
const { loadAll, loadEnnNews } = require('../lib/aggregate');

function report(label, data, file) {
  const ok = data.sources.filter((s) => s.ok).length;
  console.log(`[${label}] ${data.items.length} 条，源在线 ${ok}/${data.sources.length} → ${file}`);
  for (const s of data.sources) console.log(`  ${s.ok ? '✓' : '✗'} ${s.name} ${s.count} ${s.error || ''}`);
}

(async () => {
  const [ai, enn] = await Promise.allSettled([loadAll(), loadEnnNews()]);

  if (ai.status === 'fulfilled') {
    const out = path.join(__dirname, '..', 'docs', 'data.json');
    fs.writeFileSync(out, JSON.stringify(ai.value));
    report('AI', ai.value, 'docs/data.json');
    if (ai.value.items.length === 0) { console.error('AI 资讯为空，构建失败'); process.exit(1); }
  } else {
    console.error('AI 资讯抓取失败:', ai.reason && ai.reason.message);
    process.exit(1);
  }

  // 专题数据即使为空也写入（页面会显示空状态），不阻断主站构建
  if (enn.status === 'fulfilled') {
    const out = path.join(__dirname, '..', 'docs', 'enn-data.json');
    fs.writeFileSync(out, JSON.stringify(enn.value));
    report('新奥', enn.value, 'docs/enn-data.json');
  } else {
    console.error('新奥专题抓取失败:', enn.reason && enn.reason.message);
  }
})().catch((e) => { console.error(e); process.exit(1); });
