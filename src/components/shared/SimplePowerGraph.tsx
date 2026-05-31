type Props = {
  value: number;
};

export default function SimplePowerGraph({ value }: Props) {
  const height = Math.min(100, Math.max(10, value));

  return (
    <div className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Live Power Graph
        </h2>
        <span className="text-xs font-medium text-emerald-600">
          {value} W
        </span>
      </div>

      <div className="flex h-32 items-end rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
        <div
          className="w-full rounded-t-2xl bg-gradient-to-t from-emerald-500 to-teal-400 transition-all duration-500"
          style={{ height: `${height}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Temporary graph. We will improve this into a line chart later.
      </p>
    </div>
  );
}