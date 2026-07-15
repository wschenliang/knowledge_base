# 文档在线预览功能设计方案

## 1. 概述

### 1.1 背景

企业知识库系统已支持文档上传、存储和 RAG 索引，但用户无法在界面上直接预览已上传文档的内容。用户需要下载文件到本地才能查看，体验不佳。

### 1.2 目标

实现文档在线预览功能，支持以下格式：
- **PDF** — 保留原始排版、分页、图片
- **DOCX** — 保留基本格式（标题、列表、表格等）
- **Markdown** — 保留结构化格式
- **HTML** — 保留原始网页结构

### 1.3 非目标

- 不支持 .doc（旧版 Word 二进制格式）
- 不支持 Office 宏、复杂图表、嵌入式媒体
- 不支持编辑功能（仅预览）

---

## 2. 技术选型

采用**前端渲染方案（混合方案）**，各格式使用最适合的渲染库：

| 格式 | 渲染库 | 说明 |
|------|--------|------|
| PDF | `pdfjs-dist` (v4.x) | Mozilla PDF.js，Canvas 逐页渲染，支持缩放、分页导航 |
| DOCX | `mammoth` (v1.x) | 将 .docx 转换为 HTML，保留标题、列表、表格等结构 |
| Markdown | `react-markdown` + `remark-gfm` | 支持 GitHub 风格 Markdown 扩展 |
| HTML | `dangerouslySetInnerHTML` + `DOMPurify` | 渲染前进行 XSS 过滤 |
| 兜底 | 纯文本渲染 | 当格式不支持或渲染失败时，展示后端提取的纯文本 |

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Next.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ DocumentList │  │ PreviewModal │  │  FormatRenderers │  │
│  │   (现有)     │──│  (新增弹窗)  │──│  (各格式渲染器)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                          │ PDF │MD │HTML│DOC│
└──────────────────────────────────────────┼─────────────────┘
                                           │
┌──────────────────────────────────────────┼─────────────────┐
│                    后端 (FastAPI)          │                 │
│  ┌──────────────────────────────────────┐ │                 │
│  │  documents.py (新增 /{id}/download)  │◄┘                 │
│  │  documents.py (新增 /{id}/preview)   │                   │
│  └──────────────────────────────────────┘                   │
│                      │                                       │
│              ┌───────┴───────┐                               │
│              │   MinIO /本地  │                               │
│              │   文件存储     │                               │
│              └───────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户点击预览
    │
    ▼
DocumentList 调用 api.downloadDocument(id)
    │
    ▼
后端 GET /api/v1/documents/{id}/download
    - 权限校验 (viewer+)
    - 从 MinIO/本地读取文件
    - 返回文件流 (application/octet-stream)
    │
    ▼
前端获取 ArrayBuffer
    │
    ▼
PreviewModal 根据 file_type 分发到对应渲染器
    │
    ├── PDF  → PdfViewer (pdfjs-dist)
    ├── DOCX → DocxViewer (mammoth)
    ├── MD   → MarkdownViewer (react-markdown)
    ├── HTML → HtmlViewer (DOMPurify + innerHTML)
    └── 其他 → 调用 api.previewDocument(id) 获取纯文本 → TextViewer
```

---

## 4. API 设计

### 4.1 下载文件接口

```
GET /api/v1/documents/{document_id}/download
```

**请求头**：
- `Authorization: Bearer <token>`

**响应**：
- 成功：`200 OK`，`Content-Type: application/octet-stream`，文件二进制流
- 无权限：`403 Forbidden`
- 不存在：`404 Not Found`

**权限**：复用 `require_collection_role(request, min_role="viewer")`

### 4.2 纯文本预览接口（兜底）

```
GET /api/v1/documents/{document_id}/preview
```

**响应**：
```json
{
  "content": "提取的纯文本内容...",
  "format": "text"
}
```

**实现**：后端使用现有库提取纯文本：
- PDF → `pypdf.PdfReader.extract_text()`
- DOCX → `python-docx` 遍历段落
- MD/HTML → 去除标签后的纯文本
- 其他 → 返回 "暂不支持该格式预览"

---

## 5. 前端组件设计

### 5.1 组件清单

| 组件 | 路径 | 职责 |
|------|------|------|
| `PreviewModal` | `components/PreviewModal.tsx` | 预览弹窗容器，管理打开/关闭、加载状态 |
| `PdfViewer` | `components/viewers/PdfViewer.tsx` | PDF 渲染器，支持分页、缩放 |
| `DocxViewer` | `components/viewers/DocxViewer.tsx` | DOCX 转 HTML 渲染 |
| `MarkdownViewer` | `components/viewers/MarkdownViewer.tsx` | Markdown 渲染 |
| `HtmlViewer` | `components/viewers/HtmlViewer.tsx` | HTML 渲染（带 XSS 过滤） |
| `TextViewer` | `components/viewers/TextViewer.tsx` | 纯文本兜底渲染 |

### 5.2 PreviewModal 接口

```typescript
interface PreviewModalProps {
  document: Document;        // 文档元数据
  isOpen: boolean;
  onClose: () => void;
}
```

### 5.3 渲染器分发逻辑

```typescript
function getViewerComponent(fileType: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return PdfViewer;
    case 'docx': return DocxViewer;
    case 'md': return MarkdownViewer;
    case 'html':
    case 'htm': return HtmlViewer;
    default: return TextViewer;
  }
}
```

### 5.4 PdfViewer 设计

- 使用 `pdfjs-dist` 的 `getDocument()` 加载 PDF
- 使用 `PDFPageProxy.render()` 在 Canvas 上逐页渲染
- 支持：上一页/下一页、页码跳转、缩放（fit-width/fit-page/自定义）
- 加载状态：显示旋转 Loading 图标

### 5.5 DocxViewer 设计

- 使用 `mammoth.convertToHtml()` 将 ArrayBuffer 转为 HTML
- 使用 Tailwind 样式覆盖 mammoth 默认样式
- 支持：标题层级、列表、表格、粗体/斜体

### 5.6 MarkdownViewer 设计

- 使用 `react-markdown` 渲染
- 启用 `remark-gfm` 支持表格、任务列表等 GitHub 扩展
- 使用 Tailwind `prose` 样式（或自定义）

### 5.7 HtmlViewer 设计

- 使用 `DOMPurify.sanitize()` 过滤危险标签和属性
- 使用 `dangerouslySetInnerHTML` 渲染
- 限制 iframe、script、style 等危险元素

---

## 6. 交互设计

### 6.1 文档列表增加预览入口

在 `DocumentList` 每行操作区增加"预览"图标按钮（眼睛图标）：

```
文件名          大小      分块    状态      操作
─────────────────────────────────────────────────
report.pdf      2.3 MB    15      已完成    👁 🗑
notes.md        12 KB     3       已完成    👁 🗑
```

### 6.2 预览弹窗布局

```
┌────────────────────────────────────────────┐
│  📄 report.pdf                    [X]      │
├────────────────────────────────────────────┤
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │                                      │  │
│  │         文档内容渲染区域              │  │
│  │                                      │  │
│  │    (PDF分页 / MD滚动 / HTML渲染)    │  │
│  │                                      │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  [◀ 上一页]  第 3 / 10 页  [下一页 ▶]      │  ← PDF 专用
│                                            │
└────────────────────────────────────────────┘
```

- 弹窗宽度：最大 `max-w-4xl`（约 896px），高度 `max-h-[80vh]`
- 点击遮罩或按 ESC 关闭
- 加载时显示 Skeleton/Spinner

---

## 7. 错误处理策略

| 场景 | 处理方式 |
|------|----------|
| 文件不存在 | 弹窗显示 "文档不存在或已被删除" |
| 无权限 | 弹窗显示 "你没有权限预览此文档" |
| 格式不支持 | 自动降级到纯文本预览接口 |
| 渲染失败 | 显示 "预览加载失败，尝试纯文本模式..." → 调用兜底接口 |
| 纯文本也失败 | 显示 "无法预览，请下载后查看" |
| 网络超时 | 显示 "加载超时，请重试" + 重试按钮 |

---

## 8. 安全考虑

1. **XSS 防护**：HTML 预览使用 `DOMPurify` 过滤，移除 `script`、`iframe`、`object` 等标签
2. **权限校验**：所有预览接口复用现有 ACL 权限体系，viewer+ 可预览
3. **CSP 兼容**：预览内容不执行外部脚本，不加载外部资源
4. **文件大小限制**：预览文件大小上限 50MB，超大文件提示下载查看

---

## 9. 性能考虑

1. **PDF 分页**：不一次性渲染全部页面，按需渲染当前页
2. **DOCX 转换**：mammoth 转换在浏览器端完成，无需服务端参与
3. **大文件处理**：超过 10MB 的文本文件，仅展示前 10000 字符，提示"内容已截断"
4. **缓存**：预览内容不缓存，每次打开重新加载（保证内容最新）

---

## 10. 新增依赖

### 前端

```json
{
  "pdfjs-dist": "^4.10.38",
  "mammoth": "^1.9.0",
  "react-markdown": "^9.0.1",
  "remark-gfm": "^4.0.0",
  "isomorphic-dompurify": "^2.21.0"
}
```

### 后端

无需新增依赖，复用现有：
- `pypdf` — PDF 文本提取
- `python-docx` — DOCX 文本提取
- `unstructured` — 通用文档提取

---

## 11. 数据库变更

无需数据库变更。复用现有 `documents` 表的 `file_type`、`filename`、`file_path` 字段。

---

## 12. 测试要点

1. **各格式渲染测试**：PDF、DOCX、MD、HTML 各准备 2-3 个样本文件测试
2. **权限测试**：viewer 可预览、未授权用户不可预览
3. **错误降级测试**：损坏的 PDF、加密的 DOCX、超大文件
4. **XSS 测试**：包含恶意脚本的 HTML 文件
5. **性能测试**：10MB+ 文件的加载和渲染性能

---

## 13. 未来扩展

- 支持 .doc 格式（需后端转换为 .docx 或纯文本）
- 支持图片预览（PNG、JPG、GIF）
- 支持代码文件语法高亮（使用 `react-syntax-highlighter`）
- 支持预览缩放和全屏模式
- 支持文档内搜索（PDF 文本搜索）
