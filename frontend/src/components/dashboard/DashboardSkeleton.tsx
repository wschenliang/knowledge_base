export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-11 w-11 rounded-xl bg-slate-100" />
            <div className="mt-4 h-8 w-20 rounded bg-slate-100" />
            <div className="mt-2 h-4 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      {/* 图表区 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 rounded-2xl border border-slate-200 bg-white lg:col-span-2" />
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}