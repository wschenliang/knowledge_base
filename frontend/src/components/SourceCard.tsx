"use client";

import type { SourceItem } from "@/types";

interface Props {
  source: SourceItem;
}

export default function SourceCard({ source }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center justify-center rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
          #{source.index + 1}
        </span>
        <span className="text-xs font-medium text-gray-600 truncate">
          {source.source}
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {source.score.toFixed(3)}
        </span>
      </div>
      <p className="text-gray-700 line-clamp-3">{source.text}</p>
    </div>
  );
}
