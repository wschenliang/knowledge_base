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