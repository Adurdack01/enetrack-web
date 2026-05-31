import type { Device } from "@/types/device";

export function exportDevicesToCSV(devices: Device[]) {
  const headers = [
    "Name",
    "Room",
    "Status",
    "Power (W)",
    "Voltage (V)",
    "Current (A)",
    "Energy (kWh)",
    "Cost (PHP)",
  ];

  const rows = devices.map((d) => [
    d.name,
    d.room,
    d.status ? "ON" : "OFF",
    d.power,
    d.voltage,
    d.current,
    d.energy,
    d.todayCost,
  ]);

  const csvContent =
    [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "enertrack-devices.csv";
  link.click();

  URL.revokeObjectURL(url);
}