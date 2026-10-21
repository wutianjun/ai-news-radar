'use strict';
/**
 * AI 新闻聚合核心逻辑（服务端抓取免费 API / RSS 源）。
 * 被 server.js（本地开发）与 scripts/build-data.js（构建静态 data.json）共用。
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

/* ------------------------------ 免费数据源 ------------------------------ */
const FEEDS = [
  { id: 'google-en', name: 'Google News', tag: 'AI · EN',
    url: 'https://news.google.com/rss/search?q=artificial+intelligence&hl=en-US&gl=US&ceid=US:en' },
  { id: 'google-zh', name: 'Google News', tag: '人工智能 · 中文',
    url: 'https://news.google.com/rss/search?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD&hl=zh-CN&gl=CN&ceid=CN:zh-Hans' },
  { id: 'techcrunch', name: 'TechCrunch', tag: 'AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { id: 'theverge', name: 'The Verge', tag: 'Tech',
    url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'arstechnica', name: 'Ars Technica', tag: 'Technology Lab',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { id: 'mit-tr', name: 'MIT Tech Review', tag: 'AI',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { id: 'openai', name: 'OpenAI', tag: '官方博客',
    url: 'https://openai.com/news/rss.xml' },
  { id: 'marktechpost', name: 'MarkTechPost', tag: 'AI',
    url: 'https://www.marktechpost.com/feed/' },
];

const HN_API = 'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=40&query=';
const HN_QUERIES = ['AI', 'LLM', 'machine learning'];
const DEVTO_API = 'https://dev.to/api/articles?tag=ai&per_page=30';

/* ------------------------------ 小工具 ------------------------------ */
function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, application/json, text/xml, */*',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).href, timeoutMs));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function decodeEntities(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(s = '') {
  // 解开 CDATA → 解码实体（暴露被转义的 HTML）→ 剥离标签 → 再解码残留实体
  let t = String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = decodeEntities(t).replace(/<[^>]*>/g, ' ');
  return decodeEntities(t).replace(/\s+/g, ' ').trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1] : '';
}
function pickLink(block) {
  let m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i); // Atom
  if (m) return m[1];
  m = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i); // RSS
  return m ? stripHtml(m[1]) : '';
}

/* --------------------------- RSS / Atom 解析 --------------------------- */
function parseFeed(xml, src) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks.slice(0, 30)) {
    let title = stripHtml(pick(b, 'title'));
    const link = pickLink(b);
    if (!title || !link) continue;
    // Google News 标题形如“标题 - 来源”，拆出媒体名，标题只保留正文
    const isGoogle = src.google === true || src.id.startsWith('google');
    let outlet = '';
    if (isGoogle) {
      let m = title.match(/\s+[-–—]\s*([^-–—]{1,40})$/);
      if (m) {
        outlet = m[1].trim();
        title = title.slice(0, m.index).trim();
      } else {
        // 中文媒体有时不加空格，如“标题-证券之星”
        m = title.match(/([\u4e00-\u9fa5])\s*[-–—]\s*([\u4e00-\u9fa5A-Za-z0-9.]{1,20})$/);
        if (m) {
          outlet = m[2].trim();
          title = title.slice(0, m.index + m[1].length).trim();
        }
      }
    }
    // 去掉中文媒体常见的 SEO 尾巴，如“标题|香港联交所|数据|金额|持股比例”
    const segs = title.split('|').map((x) => x.trim()).filter(Boolean);
    if (segs.length >= 3 && segs.slice(1).every((x) => x.length <= 10)) title = segs[0];
    const dateRaw = pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || pick(b, 'dc:date');
    let ts = Date.parse(stripHtml(dateRaw));
    if (isNaN(ts)) ts = Date.now();
    // 摘要里常见“标题 + 来源”的重复，去掉与标题重复的部分，避免摘要整段重复标题
    let sum = stripHtml(pick(b, 'description') || pick(b, 'summary') || pick(b, 'content'));
    // Google News 的描述就是“标题 + 来源”，冗余，直接不要摘要
    if (isGoogle) sum = '';
    if (sum === title) sum = '';
    else if (sum.startsWith(title)) {
      const rest = sum.slice(title.length).replace(/^[\s\-–—·|]+/, '');
      sum = rest.length >= 16 ? rest : '';
    }
    items.push({
      title, link, source: src.name, outlet, tag: src.tag, sourceId: src.id,
      time: new Date(ts).toISOString(),
      summary: sum.slice(0, 220),
    });
  }
  return items;
}

function dedupe(list) {
  const seen = [];
  const out = [];
  for (const it of list) {
    const key = (it.title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').slice(0, 70) || it.link;
    // 完全重复，或“标题 + 极短后缀”的近似重复（如末尾多了媒体名）
    const dup = seen.some((k) => k === key || (key.startsWith(k) && key.length - k.length <= 8));
    if (dup) continue;
    seen.push(key);
    out.push(it);
  }
  return out;
}

/* ------------------------------ 聚合 ------------------------------ */
async function loadAll() {
  const status = [];
  const jobs = [];

  for (const f of FEEDS) {
    jobs.push(fetchText(f.url)
      .then((xml) => { const items = parseFeed(xml, f); status.push({ id: f.id, name: f.name, ok: true, count: items.length }); return items; })
      .catch((e) => { status.push({ id: f.id, name: f.name, ok: false, count: 0, error: String(e.message || e) }); return []; }));
  }

  jobs.push((async () => {
    try {
      const res = await Promise.all(HN_QUERIES.map((q) =>
        fetchText(HN_API + encodeURIComponent(q)).then((t) => JSON.parse(t).hits || [])));
      const flat = res.flat().map((h) => ({
        title: stripHtml(h.title || ''), link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'Hacker News', tag: '社区', sourceId: 'hn',
        time: new Date((h.created_at_i || 0) * 1000 || Date.now()).toISOString(),
        summary: `${h.points || 0} 分 · ${h.num_comments || 0} 评论 · by ${h.author || 'unknown'}`,
      })).filter((x) => x.title);
      status.push({ id: 'hn', name: 'Hacker News', ok: true, count: flat.length });
      return flat;
    } catch (e) { status.push({ id: 'hn', name: 'Hacker News', ok: false, count: 0, error: String(e.message || e) }); return []; }
  })());

  jobs.push((async () => {
    try {
      const arr = JSON.parse(await fetchText(DEVTO_API));
      const items = arr.map((a) => ({
        title: stripHtml(a.title || ''), link: a.url, source: 'DEV.to', tag: 'AI', sourceId: 'devto',
        time: new Date(a.published_at || Date.now()).toISOString(),
        summary: stripHtml(a.description || '').slice(0, 220) || `${a.positive_reactions_count || 0} reactions`,
      })).filter((x) => x.title);
      status.push({ id: 'devto', name: 'DEV.to', ok: true, count: items.length });
      return items;
    } catch (e) { status.push({ id: 'devto', name: 'DEV.to', ok: false, count: 0, error: String(e.message || e) }); return []; }
  })());

  const results = (await Promise.all(jobs)).flat();
  const items = dedupe(results)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .slice(0, 120);

  return { updatedAt: new Date().toISOString(), items, sources: status.sort((a, b) => a.name.localeCompare(b.name)) };
}

/* ---------------------- 新奥集团专题 ---------------------- */
function googleNewsUrl(q, lang = 'zh-CN', gl = 'CN', ceid = 'CN:zh-Hans') {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${lang}&gl=${gl}&ceid=${ceid}`;
}

const ENN_FEEDS = [
  { id: 'enn-group', name: 'Google News', tag: '新奥集团', google: true, url: googleNewsUrl('"新奥集团"') },
  { id: 'enn-stock', name: 'Google News', tag: '新奥股份', google: true, url: googleNewsUrl('"新奥股份"') },
  { id: 'enn-energy', name: 'Google News', tag: '新奥能源', google: true, url: googleNewsUrl('"新奥能源"') },
  { id: 'enn-en', name: 'Google News', tag: 'ENN Group', google: true, url: googleNewsUrl('"ENN Group"', 'en-US', 'US', 'US:en') },
];

// 过滤股票行情类自动生成的噪音稿件
const ENN_NOISE = /股票行情快报|主力资金|融资融券|龙虎榜|大宗交易|盘后公告|机构调研|ETF|板块|涨停|跌停|盘前|盘中|收盘|指数涨/;

async function loadEnnNews() {
  const status = [];
  const jobs = ENN_FEEDS.map((f) =>
    fetchText(f.url)
      .then((xml) => {
        const items = parseFeed(xml, f);
        status.push({ id: f.id, name: f.tag, ok: true, count: items.length });
        return items;
      })
      .catch((e) => {
        status.push({ id: f.id, name: f.tag, ok: false, count: 0, error: String(e.message || e) });
        return [];
      }));

  const items = dedupe((await Promise.all(jobs)).flat())
    .filter((it) => !ENN_NOISE.test(it.title))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .slice(0, 80);

  return { updatedAt: new Date().toISOString(), items, sources: status };
}

module.exports = { loadAll, loadEnnNews, parseFeed, stripHtml };
