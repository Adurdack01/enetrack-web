import { BarChart3, Home, PlugZap, Settings } from "lucide-react";

type Tab = "home" | "stats" | "devices" | "settings";

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

const navItems = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "stats" as const, label: "Stats", icon: BarChart3 },
  { id: "devices" as const, label: "Devices", icon: PlugZap },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export default function BottomNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950">
      <div className="grid grid-cols-4 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] transition ${
                isActive
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
