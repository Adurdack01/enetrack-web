import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Bell, Loader2, RefreshCw, Search } from "lucide-react";
import BottomNav from "@/components/layout/BottomNav";

type Tab = "home" | "stats" | "devices" | "settings";

type Props = {
  children: ReactNode;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenSearch: () => void;
  userName: string;
  onRefresh?: () => Promise<void> | void;
};

const PULL_REFRESH_TRIGGER_PX = 72;
const PULL_REFRESH_MAX_PX = 108;

function getPageScrollTop() {
  return (
    window.scrollY ??
    document.scrollingElement?.scrollTop ??
    document.documentElement.scrollTop ??
    0
  );
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function AppLayout({
  children,
  activeTab,
  onTabChange,
  unreadCount,
  onOpenNotifications,
  onOpenSearch,
  userName,
  onRefresh,
}: Props) {
  const mainRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const dragActiveRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const canStartPull = (eventTarget: EventTarget | null) => {
    if (!onRefresh || isRefreshing) return false;

    const main = mainRef.current;
    if (!main || getPageScrollTop() > 0) return false;
    if (!(eventTarget instanceof HTMLElement)) return true;

    let current: HTMLElement | null = eventTarget;

    while (current && current !== main) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const scrollable =
        (overflowY === "auto" || overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight + 1;

      if (scrollable && current.scrollTop > 0) {
        return false;
      }

      current = current.parentElement;
    }

    return true;
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1 || !canStartPull(event.target)) {
      startYRef.current = null;
      dragActiveRef.current = false;
      return;
    }

    startYRef.current = event.touches[0].clientY;
    dragActiveRef.current = true;
  };

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (!dragActiveRef.current || startYRef.current === null || isRefreshing) {
      return;
    }

    const deltaY = event.touches[0].clientY - startYRef.current;

    if (deltaY <= 0) {
      setPullDistance(0);
      return;
    }

    if (getPageScrollTop() > 0) {
      dragActiveRef.current = false;
      setPullDistance(0);
      return;
    }

    const easedDistance = Math.min(deltaY * 0.45, PULL_REFRESH_MAX_PX);
    setPullDistance(easedDistance);
  };

  const resetPullState = () => {
    startYRef.current = null;
    dragActiveRef.current = false;
    setPullDistance(0);
  };

  const handleTouchEnd = async () => {
    if (!dragActiveRef.current) {
      resetPullState();
      return;
    }

    const shouldRefresh =
      Boolean(onRefresh) && pullDistance >= PULL_REFRESH_TRIGGER_PX;

    resetPullState();

    if (!shouldRefresh || !onRefresh) {
      return;
    }

    setIsRefreshing(true);

    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const indicatorVisible = isRefreshing || pullDistance > 0;
  const indicatorProgress = Math.min(
    pullDistance / PULL_REFRESH_TRIGGER_PX,
    1
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 dark:bg-slate-950">
        <header className="flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
  <div>
   <p className="text-xs text-slate-500 dark:text-slate-400">
  {getGreeting()}
</p>

<h1 className="text-lg font-bold text-slate-900 dark:text-white">
  {userName}
</h1>
  </div>

  <div className="flex items-center gap-3">
    <button
      onClick={onOpenSearch}
      className="rounded-full bg-white p-3 shadow-sm dark:bg-slate-900"
    >
      <Search className="h-4 w-4 text-slate-600 dark:text-slate-300" />
    </button>

    <button
      onClick={onOpenNotifications}
      className="relative rounded-full bg-white p-3 shadow-sm dark:bg-slate-900"
    >
      <Bell className="h-4 w-4 text-slate-600 dark:text-slate-300" />
      {unreadCount > 0 && (
        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500" />
      )}
    </button>
  </div>
</header>
        <main
          ref={mainRef}
          className="flex-1 px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div
            className={`overflow-hidden transition-[height] duration-200 ease-out ${
              indicatorVisible ? "mb-3" : "mb-0"
            }`}
            style={{
              height: indicatorVisible
                ? isRefreshing
                  ? 56
                  : Math.max(0, Math.round(pullDistance))
                : 0,
            }}
            aria-hidden={!indicatorVisible}
          >
            <div className="flex h-14 items-end justify-center">
              <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/90 dark:text-slate-300 dark:ring-slate-800">
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                ) : (
                  <RefreshCw
                    className="h-4 w-4 text-emerald-600 transition-transform duration-200"
                    style={{
                      transform: `rotate(${indicatorProgress * 180}deg)`,
                    }}
                  />
                )}
                <span>
                  {isRefreshing
                    ? "Refreshing"
                    : pullDistance >= PULL_REFRESH_TRIGGER_PX
                      ? "Release to refresh"
                      : "Pull to refresh"}
                </span>
              </div>
            </div>
          </div>
          {children}
        </main>

        <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </div>
  );
}

