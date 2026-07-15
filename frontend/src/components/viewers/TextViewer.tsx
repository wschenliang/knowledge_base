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