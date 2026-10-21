# AI 新闻雷达

编辑部杂志风的资讯面板，聚合多个「免费 API / 公开 RSS 源」，静态托管在 GitHub Pages，由 GitHub Actions 每 30 分钟自动刷新数据。

- 线上：https://wutianjun.github.io/ai-news-radar/
- 新奥集团专题：https://wutianjun.github.io/ai-news-radar/enn.html

## 结构

```
docs/                 部署产物（GitHub Pages 源 = main 分支 /docs）
  index.html          首页
  enn.html            新奥集团专题页
  styles.css          共用样式（编辑部杂志风）
  app.js              首页逻辑
  enn.js              专题页逻辑
  data.json           AI 资讯数据（构建产物）
  enn-data.json       新奥专题数据（构建产物）
lib/aggregate.js      聚合核心：抓取、解析、去重、排序
scripts/build-data.js 构建脚本：生成上面两个 json
server.js             本地预览服务（含实时 /api/news）
.github/workflows/refresh.yml  定时刷新 + 提交数据
```

## 本地运行

```bash
node server.js 8790
# http://localhost:8790
```

## 数据源

全部免注册、免 API Key：Google News RSS（AI 中英文、新奥集团/新奥股份/新奥能源/ENN Group）、TechCrunch、The Verge、Ars Technica、MIT Tech Review、OpenAI、MarkTechPost、Hacker News（Algolia API）、DEV.to API。

单源失败不影响整体，页面底部/侧栏会标出离线源。
