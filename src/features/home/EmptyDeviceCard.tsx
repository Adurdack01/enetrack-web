type Props = {
  onAddDevice: () => void;
};

export default function EmptyDeviceCard({ onAddDevice }: Props) {
  return (
    <button
      type="button"
      onClick={onAddDevice}
      className="flex w-full flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-slate-200 bg-white p-8 text-center text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-4xl font-light text-emerald-600 dark:bg-slate-950 dark:text-emerald-300">
        +
      </div>

      <p className="text-base font-semibold text-slate-900 dark:text-white">
        Add a device
      </p>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        No devices added yet. Tap here to pair your first smart plug.
      </p>
    </button>
  );
}