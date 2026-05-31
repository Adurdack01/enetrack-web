import { jsPDF } from "jspdf";
import type { Device } from "@/types/device";

export function exportDevicesToPDF(devices: Device[]) {
  const doc = new jsPDF();

  let y = 20;

  doc.setFontSize(16);
  doc.text("EnerTrack Report", 14, y);

  y += 10;

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);

  y += 10;

  doc.setFontSize(12);
  doc.text("Devices Summary", 14, y);

  y += 8;

  devices.forEach((device) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(10);

    doc.text(`Name: ${device.name}`, 14, y);
    y += 5;

    doc.text(`Room: ${device.room}`, 14, y);
    y += 5;

    doc.text(
      `Status: ${(device.relayState ?? device.status) ? "ON" : "OFF"}`,
      14,
      y
    );
    y += 5;

    doc.text(`Power: ${device.power} W`, 14, y);
    y += 5;

    doc.text(`Energy: ${device.energy} kWh`, 14, y);
    y += 5;

    doc.text(`Cost: ₱${device.todayCost}`, 14, y);
    y += 8;
  });

  doc.save("enertrack-report.pdf");
}
