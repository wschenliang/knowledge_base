# 文档在线预览功能开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现文档在线预览功能，支持 PDF、DOCX、Markdown、HTML 四种格式的前端渲染预览。

**Architecture:** 后端新增文件下载和纯文本提取接口，前端新增预览弹窗和各格式渲染组件，采用前端渲染方案（pdfjs-dist + mammoth + react-markdown + DOMPurify）。

**Tech Stack:** FastAPI + Next.js + pdfjs-dist + mammoth + react-markdown + remark-gfm + isomorphic-dompurify

---

## 文件结构

### 后端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/api/documents.py` | 修改 | 新增 `/download` 和 `/preview` 两个 endpoint |
| `backend/app/services/document_service.py` | 修改 | 新增 `download_file` 和 `extract_text` 方法 |
| `backend/app/schemas/document.py` | 修改 | 新增 `PreviewResponse` schema |

### 前端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/package.json` | 修改 | 新增 pdfjs-dist、mammoth、react-markdown、remark-gfm、isomorphic-dompurify |
| `frontend/src/lib/api.ts` | 修改 | 新增 `downloadDocument` 和 `previewDocument` 方法 |
| `frontend/src/types/index.ts` | 修改 | 新增 `PreviewResponse` 类型 |
| `frontend/src/components/PreviewModal.tsx` | 创建 | 预览弹窗容器组件 |
| `frontend/src/components/viewers/PdfViewer.tsx` | 创建 | PDF 渲染器 |
| `frontend/src/components/viewers/DocxViewer.tsx` | 创建 | DOCX 渲染器 |
| `frontend/src/components/viewers/MarkdownViewer.tsx` | 创建 | Markdown 渲染器 |
| `frontend/src/components/viewers/HtmlViewer.tsx` | 创建 | HTML 渲染器 |
| `frontend/src/components/viewers/TextViewer.tsx` | 创建 | 纯文本兜底渲染器 |
| `frontend/src/components/DocumentList.tsx` | 修改 | 每行增加预览按钮，集成 PreviewModal |

---

## Task 1: 后端 - 新增文件下载接口

**Files:**
- Modify: `backend/app/api/documents.py`
- Modify: `backend/app/services/document_service.py`

- [ ] **Step 1: 在 document_service.py 中新增下载方法**

在 `DocumentService` 类中，在 `delete_document` 方法之后添加：

```python
    async def download_file(self, document_id: str, db: AsyncSession) -> tuple[Optional[bytes], Optional[Document]]:
        """下载文件内容"""
        document = await self.get_document(document_id, db)
        if document is None:
            return None, None

        # 从 MinIO 读取
        if self.minio_available and self.minio_client:
            try:
                response = self.minio_client.get_object(
                    bucket_name=settings.MINIO_BUCKET,
                    object_name=document.file_path,
                )
                return response.read(), document
            except Exception as e:
                logger.warning(f"MinIO 读取失败: {e}")

        # 本地文件回退
        local_path = document.file_path.replace("local/", "")
        local_full_path = os.path.join(settings.UPLOAD_DIR or "uploads", local_path)
        if os.path.exists(local_full_path):
            with open(local_full_path, "rb") as f:
                return f.read(), document

        return None, document
```

- [ ] **Step 2: 在 documents.py 中新增下载 endpoint**

在 `get_document` endpoint 之后、`delete_document` endpoint 之前添加：

```python
from fastapi import Response

@router.get("/{document_id}/download")
async def download_document(
    request: Request,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下载文档文件（viewer+）"""
    from sqlalchemy import select
    from app.models.document import Document, Collection

    # 获取文档信息
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )

    # 权限检查
    request.path_params["collection_id"] = document.collection_id
    await require_collection_role(
        request, min_role="viewer", db=db, current_user=current_user
    )

    # 读取文件内容
    file_content, doc = await document_service.download_file(document_id, db)
    if file_content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文件内容不存在",
        )

    return Response(
        content=file_content,
        media_type=doc.file_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{doc.filename}"'
        },
    )
```

- [ ] **Step 3: 验证后端编译无错误**

Run: `cd backend; python -c "from app.api.documents import router; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd d:\workspace\knowledge_base
git add backend/app/api/documents.py backend/app/services/document_service.py
git commit -m "feat: add document download endpoint"
```

---

## Task 2: 后端 - 新增纯文本预览接口（兜底）

**Files:**
- Modify: `backend/app/schemas/document.py`
- Modify: `backend/app/services/document_service.py`
- Modify: `backend/app/api/documents.py`

- [ ] **Step 1: 在 schemas/document.py 中新增 PreviewResponse**

在文件末尾（或 `DocumentList` 之后）添加：

```python
class PreviewResponse(BaseModel):
    """文档预览响应"""
    content: str
    format: str = "text"

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: 在 document_service.py 中新增文本提取方法**

在 `download_file` 方法之后添加：

```python
    async def extract_text(self, document_id: str, db: AsyncSession) -> tuple[str, str]:
        """提取文档纯文本内容，返回 (content, format)"""
        document = await self.get_document(document_id, db)
        if document is None:
            raise ValueError("文档不存在")

        file_content, doc = await self.download_file(document_id, db)
        if file_content is None:
            raise ValueError("文件内容不存在")

        ext = get_extension(doc.filename)

        try:
            if ext == ".pdf":
                from pypdf import PdfReader
                import io
                reader = PdfReader(io.BytesIO(file_content))
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                return text, "text"

            elif ext == ".docx":
                from docx import Document as DocxDocument
                import io
                docx = DocxDocument(io.BytesIO(file_content))
                text = "\n".join(p.text for p in docx.paragraphs if p.text)
                return text, "text"

            elif ext in (".md", ".txt", ".csv", ".json", ".xml", ".yaml", ".yml"):
                return file_content.decode("utf-8", errors="replace"), "text"

            elif ext in (".html", ".htm"):
                from html.parser import HTMLParser
                class TextExtractor(HTMLParser):
                    def __init__(self):
                        super().__init__()
                        self.texts = []
                    def handle_data(self, data):
                        self.texts.append(data)
                parser = TextExtractor()
                parser.feed(file_content.decode("utf-8", errors="replace"))
                return "".join(parser.texts), "text"

            else:
                return "暂不支持该格式预览", "text"

        except Exception as e:
            logger.error(f"文本提取失败: {e}")
            return f"预览加载失败: {str(e)}", "text"
```

- [ ] **Step 3: 在 documents.py 中新增 preview endpoint**

在 `download_document` endpoint 之后添加：

```python
from app.schemas.document import PreviewResponse

@router.get("/{document_id}/preview", response_model=PreviewResponse)
async def preview_document(
    request: Request,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取文档纯文本预览（viewer+）"""
    from sqlalchemy import select
    from app.models.document import Document, Collection

    # 获取文档信息
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )

    # 权限检查
    request.path_params["collection_id"] = document.collection_id
    await require_collection_role(
        request, min_role="viewer", db=db, current_user=current_user
    )

    try:
        content, fmt = await document_service.extract_text(document_id, db)
        return PreviewResponse(content=content, format=fmt)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"预览提取失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="预览加载失败",
        )
```

- [ ] **Step 4: 验证后端编译无错误**

Run: `cd backend; python -c "from app.api.documents import router; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd d:\workspace\knowledge_base
git add backend/app/schemas/document.py backend/app/services/document_service.py backend/app/api/documents.py
git commit -m "feat: add document preview text extraction endpoint"
```

---

## Task 3: 前端 - 安装依赖

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 安装预览相关依赖**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
npm install pdfjs-dist mammoth react-markdown remark-gfm isomorphic-dompurify
```

Expected: 安装成功，无报错

- [ ] **Step 2: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/package.json frontend/package-lock.json
if exist frontend/node_modules\ git add frontend/node_modules\ 2>nul
git commit -m "chore: add document preview dependencies"
```

---

## Task 4: 前端 - 新增 API 方法

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: 在 types/index.ts 中新增 PreviewResponse**

在 `AuditLogQueryParams` 之后添加：

```typescript
// ===== 文档预览 =====

export interface PreviewResponse {
  content: string;
  format: string;
}
```

- [ ] **Step 2: 在 api.ts 中新增下载和预览方法**

在 `deleteDocument` 方法之后添加：

```typescript
  // 文档预览
  async downloadDocument(id: string): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${BASE_URL}/api/v1/documents/${id}/download`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.arrayBuffer();
  }

  async previewDocument(id: string): Promise<PreviewResponse> {
    return this.request<PreviewResponse>(`/api/v1/documents/${id}/preview`);
  }
```

同时更新 `ApiClient` 类顶部的导入类型，在 `AuditLogQueryParams` 后添加 `PreviewResponse`。

- [ ] **Step 3: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/lib/api.ts frontend/src/types/index.ts
git commit -m "feat: add document preview API methods"
```

---

## Task 5: 前端 - 创建各格式渲染器组件

**Files:**
- Create: `frontend/src/components/viewers/PdfViewer.tsx`
- Create: `frontend/src/components/viewers/DocxViewer.tsx`
- Create: `frontend/src/components/viewers/MarkdownViewer.tsx`
- Create: `frontend/src/components/viewers/HtmlViewer.tsx`
- Create: `frontend/src/components/viewers/TextViewer.tsx`

- [ ] **Step 1: 创建 PdfViewer 组件**

Create `frontend/src/components/viewers/PdfViewer.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// 设置 PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface PdfViewerProps {
  data: ArrayBuffer;
}

export default function PdfViewer({ data }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    pdfjsLib.getDocument({ data }).promise
      .then((loadedPdf) => {
        if (cancelled) return;
        setPdf(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setPageNum(1);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError("PDF 加载失败: " + (err.message || "未知错误"));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [data]);

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current) return;

    const page = await pdf.getPage(pageNum);
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
  }, [pdf, pageNum, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const goToPrev = () => setPageNum((p) => Math.max(1, p - 1));
  const goToNext = () => setPageNum((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-slate-500">加载 PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={goToPrev} disabled={pageNum <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm text-slate-600">
          第 {pageNum} / {numPages} 页
        </span>
        <button onClick={goToNext} disabled={pageNum >= numPages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onClick={zoomOut} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-slate-500">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <canvas ref={canvasRef} className="shadow-lg rounded-lg" />
    </div>
  );
}
```

- [ ] **Step 2: 创建 DocxViewer 组件**

Create `frontend/src/components/viewers/DocxViewer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import mammoth from "mammoth";

interface DocxViewerProps {
  data: ArrayBuffer;
}

export default function DocxViewer({ data }: DocxViewerProps) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    mammoth.convertToHtml({ arrayBuffer: data })
      .then((result) => {
        if (cancelled) return;
        setHtml(result.value);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError("DOCX 加载失败: " + (err.message || "未知错误"));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-slate-500">加载 DOCX...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div
      className="prose prose-slate max-w-none p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 3: 创建 MarkdownViewer 组件**

Create `frontend/src/components/viewers/MarkdownViewer.tsx`:

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="prose prose-slate max-w-none p-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: 创建 HtmlViewer 组件**

Create `frontend/src/components/viewers/HtmlViewer.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";

interface HtmlViewerProps {
  content: string;
}

export default function HtmlViewer({ content }: HtmlViewerProps) {
  const sanitized = useMemo(() => {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [
        "p", "br", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li", "a", "strong", "em", "b", "i", "u", "strike",
        "table", "thead", "tbody", "tr", "td", "th", "blockquote", "pre", "code",
        "img", "hr"
      ],
      ALLOWED_ATTR: [
        "href", "title", "src", "alt", "class", "style", "width", "height"
      ],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    });
  }, [content]);

  return (
    <div
      className="p-4"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
```

- [ ] **Step 5: 创建 TextViewer 组件**

Create `frontend/src/components/viewers/TextViewer.tsx`:

```tsx
"use client";

interface TextViewerProps {
  content: string;
}

export default function TextViewer({ content }: TextViewerProps) {
  return (
    <div className="p-4 whitespace-pre-wrap font-mono text-sm text-slate-700 leading-relaxed">
      {content}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/components/viewers/
git commit -m "feat: add document format viewer components"
```

---

## Task 6: 前端 - 创建 PreviewModal 弹窗组件

**Files:**
- Create: `frontend/src/components/PreviewModal.tsx`

- [ ] **Step 1: 创建 PreviewModal 组件**

Create `frontend/src/components/PreviewModal.tsx`:

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { X, FileText, AlertCircle, Loader2 } from "lucide-react";
import type { Document } from "@/types";
import { api } from "@/lib/api";
import PdfViewer from "./viewers/PdfViewer";
import DocxViewer from "./viewers/DocxViewer";
import MarkdownViewer from "./viewers/MarkdownViewer";
import HtmlViewer from "./viewers/HtmlViewer";
import TextViewer from "./viewers/TextViewer";

interface PreviewModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

type ViewerType = "pdf" | "docx" | "markdown" | "html" | "text";

function getViewerType(filename: string): ViewerType {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf": return "pdf";
    case "docx": return "docx";
    case "md": return "markdown";
    case "html":
    case "htm": return "html";
    default: return "text";
  }
}

export default function PreviewModal({ document, isOpen, onClose }: PreviewModalProps) {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fallbackMode, setFallbackMode] = useState(false);

  const viewerType = useMemo(() => {
    if (!document) return "text";
    return getViewerType(document.filename);
  }, [document]);

  useEffect(() => {
    if (!isOpen || !document) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setFallbackMode(false);
    setData(null);
    setTextContent("");

    const loadDocument = async () => {
      try {
        // 对于 text 类型直接走 preview 接口
        if (viewerType === "text") {
          const preview = await api.previewDocument(document.id);
          if (!cancelled) {
            setTextContent(preview.content);
            setLoading(false);
          }
          return;
        }

        // 其他类型先尝试下载原始文件
        const arrayBuffer = await api.downloadDocument(document.id);
        if (!cancelled) {
          setData(arrayBuffer);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        // 下载失败，尝试纯文本兜底
        try {
          const preview = await api.previewDocument(document.id);
          if (!cancelled) {
            setTextContent(preview.content);
            setFallbackMode(true);
            setLoading(false);
          }
        } catch (fallbackErr) {
          if (cancelled) return;
          setError(
            err instanceof Error ? err.message : "加载失败"
          );
          setLoading(false);
        }
      }
    };

    loadDocument();

    return () => { cancelled = true; };
  }, [isOpen, document, viewerType]);

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !document) return null;

  const renderViewer = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-sm text-slate-500">加载文档...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-red-500">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      );
    }

    // 兜底模式显示提示
    if (fallbackMode) {
      return (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-700 mb-4">
            原始格式渲染失败，已切换为纯文本预览。
          </div>
          <TextViewer content={textContent} />
        </div>
      );
    }

    switch (viewerType) {
      case "pdf":
        return data ? <PdfViewer data={data} /> : <TextViewer content={textContent} />;
      case "docx":
        return data ? <DocxViewer data={data} /> : <TextViewer content={textContent} />;
      case "markdown":
        return data ? <MarkdownViewer content={new TextDecoder().decode(data)} /> : <TextViewer content={textContent} />;
      case "html":
        return data ? <HtmlViewer content={new TextDecoder().decode(data)} /> : <TextViewer content={textContent} />;
      case "text":
      default:
        return <TextViewer content={textContent} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 弹窗 */}
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col m-4">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                {document.filename}
              </h3>
              <p className="text-xs text-slate-400">
                {viewerType === "pdf" && "PDF 预览"}
                {viewerType === "docx" && "Word 预览"}
                {viewerType === "markdown" && "Markdown 预览"}
                {viewerType === "html" && "HTML 预览"}
                {viewerType === "text" && "文本预览"}
                {fallbackMode && " (纯文本模式)"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto min-h-0">
          {renderViewer()}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/components/PreviewModal.tsx
git commit -m "feat: add document preview modal component"
```

---

## Task 7: 前端 - 在 DocumentList 中集成预览功能

**Files:**
- Modify: `frontend/src/components/DocumentList.tsx`

- [ ] **Step 1: 导入 PreviewModal 和 Eye 图标**

在 `DocumentList.tsx` 顶部，将：

```typescript
import { Upload, Trash2, CheckCircle, Loader2, AlertCircle, FileText, Clock, HardDrive } from "lucide-react";
```

改为：

```typescript
import { Upload, Trash2, CheckCircle, Loader2, AlertCircle, FileText, Clock, HardDrive, Eye } from "lucide-react";
import PreviewModal from "./PreviewModal";
```

- [ ] **Step 2: 在组件 state 中增加预览相关状态**

在组件内部，在 `const [error, setError] = useState("");` 之后添加：

```typescript
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
```

- [ ] **Step 3: 添加预览打开/关闭处理函数**

在 `handleDelete` 函数之后添加：

```typescript
  const handlePreview = (doc: Document) => {
    setPreviewDoc(doc);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewDoc(null);
  };
```

- [ ] **Step 4: 在操作区增加预览按钮**

在文档列表每行的操作区（删除按钮旁边），将：

```tsx
                  <div className="col-span-1 flex justify-end">
                    {!disabled && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
```

改为：

```tsx
                  <div className="col-span-1 flex justify-end gap-1">
                    <button
                      onClick={() => handlePreview(doc)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                      title="预览"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {!disabled && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
```

- [ ] **Step 5: 在组件底部添加 PreviewModal**

在组件返回的 JSX 最外层 `</div>` 之前（即 `DocumentList` 组件的末尾）添加：

```tsx
      <PreviewModal
        document={previewDoc}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
```

- [ ] **Step 6: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/components/DocumentList.tsx
git commit -m "feat: integrate preview button into document list"
```

---

## Task 8: 验证与测试

**Files:**
- 测试涉及：后端 API、前端组件渲染

- [ ] **Step 1: 启动后端服务**

Run:
```bash
cd d:\workspace\knowledge_base\backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Expected: 服务启动成功，无报错

- [ ] **Step 2: 启动前端服务**

在另一个终端 Run:
```bash
cd d:\workspace\knowledge_base\frontend
npm run dev
```

Expected: 编译成功，无报错

- [ ] **Step 3: 功能测试**

1. 登录系统，进入某个知识库
2. 上传一个 PDF 文件，点击预览按钮，确认 PDF 正确渲染
3. 上传一个 DOCX 文件，点击预览按钮，确认内容正确显示
4. 上传一个 Markdown 文件，点击预览按钮，确认格式正确渲染
5. 上传一个 HTML 文件，点击预览按钮，确认内容安全渲染
6. 测试弹窗关闭（点击 X、点击遮罩、按 ESC）
7. 测试无权限用户无法预览（用 viewer 账号测试可预览，用无权限账号测试应被拒绝）

- [ ] **Step 4: Commit 最终版本**

```bash
cd d:\workspace\knowledge_base
git add -A
git commit -m "feat: complete document online preview feature"
```

---

## 附录：Spec 覆盖检查

对照设计文档检查各需求是否都有对应任务：

| 设计文档需求 | 对应任务 | 状态 |
|-------------|---------|------|
| 后端文件下载接口 | Task 1 | ✅ |
| 后端纯文本提取接口 | Task 2 | ✅ |
| 前端安装依赖 | Task 3 | ✅ |
| 前端 API 封装 | Task 4 | ✅ |
| PDF 渲染器 | Task 5 Step 1 | ✅ |
| DOCX 渲染器 | Task 5 Step 2 | ✅ |
| Markdown 渲染器 | Task 5 Step 3 | ✅ |
| HTML 渲染器 | Task 5 Step 4 | ✅ |
| 纯文本兜底渲染器 | Task 5 Step 5 | ✅ |
| 预览弹窗组件 | Task 6 | ✅ |
| 文档列表集成预览按钮 | Task 7 | ✅ |
| 权限校验 (viewer+) | Task 1 & Task 2 | ✅ |
| 错误降级策略 | Task 6 (fallbackMode) | ✅ |
| XSS 防护 | Task 5 Step 4 (DOMPurify) | ✅ |
| 测试验证 | Task 8 | ✅ |
