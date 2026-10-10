export const seedPosts = [
  {
    id: 'seed-life-1',
    slug: 'zhou-mo-sheng-huo-ji-lu',
    title: '周末生活记录：把节奏慢下来',
    summary: '一次普通周末的散步、读书和复盘，把生活从待办事项里拿回来。',
    category: 'life',
    tags: ['生活', '复盘', '阅读'],
    content: `## 今天的节奏

上午整理房间，下午出门走了一段路。没有特别宏大的事情，但能把状态记录下来，本身就是一种稳定。`,
    status: 'published',
    createdAt: '2026-06-01',
    updatedAt: '2026-06-01',
    cover: 'life',
    coverImage: ''
  },
  {
    id: 'seed-src-1',
    slug: 'src-yue-quan-feng-xian-fu-pan',
    title: 'SRC 挖掘案例：一次越权风险复盘',
    summary: '从入口识别、权限边界、请求重放到报告撰写，记录一条脱敏验证链路。',
    category: 'src',
    tags: ['SRC', '越权', '复盘'],
    content: `## 背景

本记录只保留方法论，不包含真实目标、接口、参数和敏感响应。`,
    status: 'published',
    createdAt: '2026-06-03',
    updatedAt: '2026-06-03',
    cover: 'src',
    coverImage: ''
  },
  {
    id: 'seed-study-1',
    slug: 'react-19-xue-xi-bi-ji',
    title: 'React 19 学习笔记',
    summary: '记录组件拆分、状态边界和表单交互里的几个实践点。',
    category: 'study',
    tags: ['React', '前端', '学习'],
    content: `## 组件边界

页面组件负责组织流程，纯函数负责处理数据，表单组件只关心输入和提交。`,
    status: 'published',
    createdAt: '2026-06-05',
    updatedAt: '2026-06-05',
    cover: 'study',
    coverImage: ''
  },
  {
    id: 'seed-notes-1',
    slug: 'chang-yong-ming-ling-su-cha',
    title: '常用命令速查',
    summary: '把常用开发、搜索、构建命令整理成可快速检索的知识卡片。',
    category: 'notes',
    tags: ['命令', '效率', '知识点'],
    content: `## 搜索

\`\`\`
rg "keyword" src
rg --files
\`\`\``,
    status: 'published',
    createdAt: '2026-06-07',
    updatedAt: '2026-06-07',
    cover: 'notes',
    coverImage: ''
  }
];
