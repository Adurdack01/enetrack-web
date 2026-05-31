import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type Props = {
  sourceId: string;
  value: number;
  liveEnabled: boolean;
  timeWindow: number;
  unit: string;
};

type DataPoint = {
  time: string;
  timestamp: string;
  value: number;
};

export default function PowerLineChart({
  sourceId,
  value,
  liveEnabled,
  timeWindow,
  unit,
}: Props) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    setData([]);
  }, [sourceId, unit]);

  useEffect(() => {
    if (!liveEnabled) return;

    const now = new Date();

    const newPoint: DataPoint = {
      time: now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      timestamp: now.toLocaleString(),
      value,
    };

    setData((prev) => {
      const updated = [...prev, newPoint];
      return updated.slice(-timeWindow);
    });
  }, [sourceId, value, liveEnabled, timeWindow]);

  const displayData = useMemo(() => data.slice(-timeWindow), [data, timeWindow]);

  return (
    <div className="h-40 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayData}>
          <XAxis hide />
          <YAxis hide />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;

              const point = payload[0].payload as DataPoint;

              return (
                <div className="rounded-2xl bg-white px-3 py-2 text-xs shadow-md dark:bg-slate-900">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {Number(point.value).toFixed(2)} {unit}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {point.timestamp}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
