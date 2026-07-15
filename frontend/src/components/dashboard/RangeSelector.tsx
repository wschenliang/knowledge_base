"use client";

interface Props {
  value: number;
  onChange: (days: number) => void;
}

const options = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
];

export default function RangeSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
            value === opt.value
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}