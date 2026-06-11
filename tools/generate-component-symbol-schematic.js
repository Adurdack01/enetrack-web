import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const outDir = path.join(process.cwd(), "docs");
const baseName = "Smart_Plug_Component_Symbol_Schematic_A4_Landscape";
const svgPath = path.join(outDir, `${baseName}.svg`);
const htmlPath = path.join(outDir, `${baseName}_Preview.html`);

const W = 3508;
const H = 2480;

const C = {
  ink: "#111827",
  muted: "#475569",
  grid: "#e5e7eb",
  panel: "#f8fafc",
  acLive: "#dc2626",
  acNeutral: "#2563eb",
  five: "#f59e0b",
  three: "#16a34a",
  gnd: "#111827",
  sig: "#7c3aed",
  uart: "#0891b2",
  spi: "#9333ea",
  border: "#94a3b8",
};

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const parts = [];
const add = (s) => parts.push(s);

function text(x, y, s, opts = {}) {
  const size = opts.size || 22;
  const fill = opts.fill || C.ink;
  const anchor = opts.anchor || "start";
  const weight = opts.weight || 500;
  const family = "Arial, Helvetica, sans-serif";
  add(
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="${family}" font-weight="${weight}">${esc(
      s
    )}</text>`
  );
}

function multiText(x, y, lines, opts = {}) {
  const size = opts.size || 20;
  const line = opts.line || Math.round(size * 1.25);
  const fill = opts.fill || C.ink;
  const weight = opts.weight || 500;
  const anchor = opts.anchor || "start";
  const family = "Arial, Helvetica, sans-serif";
  add(
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="${family}" font-weight="${weight}">`
  );
  lines.forEach((entry, index) => {
    const label = typeof entry === "string" ? entry : entry.text;
    const entryWeight = typeof entry === "string" ? weight : entry.weight || weight;
    const entryFill = typeof entry === "string" ? fill : entry.fill || fill;
    add(
      `<tspan x="${x}" dy="${index === 0 ? 0 : line}" font-weight="${entryWeight}" fill="${entryFill}">${esc(
        label
      )}</tspan>`
    );
  });
  add(`</text>`);
}

function rect(x, y, w, h, opts = {}) {
  add(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opts.rx ?? 8}" fill="${
      opts.fill || "#fff"
    }" stroke="${opts.stroke || C.ink}" stroke-width="${opts.sw || 3}"/>`
  );
}

function line(x1, y1, x2, y2, opts = {}) {
  add(
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${
      opts.stroke || C.ink
    }" stroke-width="${opts.sw || 4}" stroke-linecap="${opts.cap || "round"}"/>`
  );
}

function wire(points, opts = {}) {
  add(
    `<polyline points="${points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${
      opts.stroke || C.ink
    }" stroke-width="${opts.sw || 4}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

function node(x, y, color = C.ink) {
  add(`<circle cx="${x}" cy="${y}" r="7" fill="${color}" stroke="#fff" stroke-width="2"/>`);
}

function pin(x, y, label, side, opts = {}) {
  const color = opts.color || C.ink;
  const len = opts.len || 48;
  if (side === "left") {
    line(x - len, y, x, y, { stroke: color, sw: 3 });
    text(x - len - 8, y + 7, label, { size: opts.size || 17, fill: color, anchor: "end", weight: 700 });
  } else if (side === "right") {
    line(x, y, x + len, y, { stroke: color, sw: 3 });
    text(x + len + 8, y + 7, label, { size: opts.size || 17, fill: color, anchor: "start", weight: 700 });
  } else if (side === "top") {
    line(x, y - len, x, y, { stroke: color, sw: 3 });
    text(x, y - len - 8, label, { size: opts.size || 17, fill: color, anchor: "middle", weight: 700 });
  } else {
    line(x, y, x, y + len, { stroke: color, sw: 3 });
    text(x, y + len + 22, label, { size: opts.size || 17, fill: color, anchor: "middle", weight: 700 });
  }
}

function component(x, y, w, h, ref, name, opts = {}) {
  rect(x, y, w, h, { fill: opts.fill || "#fff", stroke: opts.stroke || C.ink, sw: opts.sw || 3, rx: opts.rx ?? 8 });
  text(x + w / 2, y + 30, ref, { size: opts.refSize || 21, fill: C.muted, anchor: "middle", weight: 800 });
  text(x + w / 2, y + 62, name, { size: opts.nameSize || 27, fill: C.ink, anchor: "middle", weight: 900 });
}

function terminal(x, y, label, color) {
  add(`<circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="${color}" stroke-width="4"/>`);
  text(x, y + 37, label, { size: 17, fill: color, anchor: "middle", weight: 800 });
}

function ground(x, y, color = C.gnd) {
  line(x, y, x, y + 16, { stroke: color, sw: 4 });
  line(x - 24, y + 16, x + 24, y + 16, { stroke: color, sw: 4, cap: "butt" });
  line(x - 16, y + 26, x + 16, y + 26, { stroke: color, sw: 4, cap: "butt" });
  line(x - 8, y + 36, x + 8, y + 36, { stroke: color, sw: 4, cap: "butt" });
}

function resistor(x1, y1, x2, y2, label) {
  // Horizontal resistor only.
  line(x1, y1, x1 + 28, y1, { stroke: C.sig, sw: 4 });
  const x = x1 + 28;
  const seg = 20;
  const pts = [
    [x, y1],
    [x + seg, y1 - 16],
    [x + seg * 2, y1 + 16],
    [x + seg * 3, y1 - 16],
    [x + seg * 4, y1 + 16],
    [x + seg * 5, y1 - 16],
    [x + seg * 6, y1 + 16],
    [x + seg * 7, y1],
  ];
  wire(pts, { stroke: C.sig, sw: 4 });
  line(x + seg * 7, y1, x2, y2, { stroke: C.sig, sw: 4 });
  text((x1 + x2) / 2, y1 - 32, label, { size: 18, fill: C.sig, anchor: "middle", weight: 800 });
}

function led(x, y, label) {
  line(x - 44, y, x - 12, y, { stroke: C.sig, sw: 4 });
  add(`<polygon points="${x - 12},${y - 24} ${x - 12},${y + 24} ${x + 26},${y}" fill="none" stroke="${C.sig}" stroke-width="4"/>`);
  line(x + 26, y - 26, x + 26, y + 26, { stroke: C.sig, sw: 4, cap: "butt" });
  line(x + 26, y, x + 80, y, { stroke: C.sig, sw: 4 });
  line(x + 46, y - 38, x + 75, y - 67, { stroke: C.sig, sw: 3 });
  line(x + 70, y - 38, x + 99, y - 67, { stroke: C.sig, sw: 3 });
  text(x + 30, y + 54, label, { size: 18, fill: C.sig, anchor: "middle", weight: 800 });
}

function pushButton(x, y, label) {
  line(x - 70, y, x - 18, y, { stroke: C.sig, sw: 4 });
  add(`<circle cx="${x - 18}" cy="${y}" r="7" fill="#fff" stroke="${C.sig}" stroke-width="4"/>`);
  add(`<circle cx="${x + 42}" cy="${y}" r="7" fill="#fff" stroke="${C.sig}" stroke-width="4"/>`);
  line(x - 5, y - 28, x + 30, y - 28, { stroke: C.sig, sw: 4 });
  line(x + 42, y, x + 92, y, { stroke: C.sig, sw: 4 });
  ground(x + 92, y, C.gnd);
  text(x + 8, y + 55, label, { size: 18, fill: C.sig, anchor: "middle", weight: 800 });
}

function relayContact(x, y) {
  terminal(x, y, "COM", C.acLive);
  terminal(x + 250, y, "NO", C.acLive);
  line(x + 12, y, x + 70, y, { stroke: C.acLive, sw: 6 });
  line(x + 180, y, x + 238, y, { stroke: C.acLive, sw: 6 });
  line(x + 75, y - 8, x + 165, y - 54, { stroke: C.acLive, sw: 6 });
  text(x + 125, y - 80, "K1 contact", { size: 22, fill: C.acLive, anchor: "middle", weight: 900 });
  text(x + 125, y + 65, "Relay module contact side", { size: 17, fill: C.muted, anchor: "middle", weight: 700 });
}

function fuse(x, y) {
  terminal(x, y, "L IN", C.acLive);
  terminal(x + 210, y, "L OUT", C.acLive);
  line(x + 10, y, x + 58, y, { stroke: C.acLive, sw: 6 });
  rect(x + 58, y - 28, 94, 56, { fill: "#fff7ed", stroke: C.acLive, sw: 4, rx: 8 });
  line(x + 152, y, x + 200, y, { stroke: C.acLive, sw: 6 });
  text(x + 105, y - 50, "F1 FUSE", { size: 24, fill: C.acLive, anchor: "middle", weight: 900 });
}

function ctClamp(x, y) {
  add(`<ellipse cx="${x}" cy="${y}" rx="72" ry="58" fill="#fff7ed" stroke="#b45309" stroke-width="5"/>`);
  text(x, y - 3, "CT", { size: 32, fill: "#b45309", anchor: "middle", weight: 900 });
  text(x, y + 28, "clamp", { size: 17, fill: "#b45309", anchor: "middle", weight: 800 });
}

function speaker(x, y) {
  line(x - 70, y - 24, x - 35, y - 24, { stroke: C.uart, sw: 4 });
  line(x - 70, y + 24, x - 35, y + 24, { stroke: C.uart, sw: 4 });
  rect(x - 35, y - 35, 32, 70, { fill: "#eff6ff", stroke: C.uart, sw: 4, rx: 2 });
  add(`<polygon points="${x - 3},${y - 35} ${x + 58},${y - 72} ${x + 58},${y + 72} ${x - 3},${y + 35}" fill="#eff6ff" stroke="${C.uart}" stroke-width="4"/>`);
  add(`<path d="M ${x + 82} ${y - 42} Q ${x + 126} ${y} ${x + 82} ${y + 42}" fill="none" stroke="${C.uart}" stroke-width="4"/>`);
  text(x + 24, y + 108, "SP1 SPEAKER", { size: 19, fill: C.uart, anchor: "middle", weight: 900 });
}

function arrowLabel(x, y, label, color) {
  rect(x, y, 230, 42, { fill: "#fff", stroke: color, sw: 2, rx: 8 });
  text(x + 115, y + 28, label, { size: 17, fill: color, anchor: "middle", weight: 900 });
}

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
add(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
for (let x = 0; x <= W; x += 50) line(x, 0, x, H, { stroke: "#f8fafc", sw: 1, cap: "butt" });
for (let y = 0; y <= H; y += 50) line(0, y, W, y, { stroke: "#f8fafc", sw: 1, cap: "butt" });
rect(42, 42, W - 84, H - 84, { fill: "none", stroke: C.border, sw: 3, rx: 0 });
text(W / 2, 83, "Smart Plug Component Symbol Schematic", { size: 40, fill: C.ink, anchor: "middle", weight: 900 });
text(W / 2, 122, "HLK-10M05 + PZEM-004T-100A + Relay Module + ESP32 38-Pin + SD + RTC + MP3-TF-16P", {
  size: 21,
  fill: C.muted,
  anchor: "middle",
  weight: 800,
});
text(W - 160, 110, "A4 landscape", { size: 16, fill: C.muted, anchor: "end", weight: 700 });

// AC panel.
rect(72, 158, 3364, 805, { fill: "#fffafa", stroke: "#ef4444", sw: 4, rx: 16 });
text(108, 212, "A. HIGH-VOLTAGE AC SCHEMATIC", { size: 31, fill: "#991b1b", weight: 900 });
text(3330, 210, "Keep isolated from low-voltage electronics", { size: 21, fill: "#991b1b", anchor: "end", weight: 900 });

// AC input and fuse.
component(124, 360, 275, 190, "J1", "AC INPUT", { stroke: C.acLive, fill: "#fff", nameSize: 25 });
pin(124, 425, "L", "left", { color: C.acLive, len: 54, size: 18 });
pin(124, 500, "N", "left", { color: C.acNeutral, len: 54, size: 18 });
multiText(165, 430, ["220 VAC", "Terminal block", "Line / Neutral"], { size: 18, line: 24, fill: C.ink, weight: 650 });
fuse(515, 425);
wire([[399, 425], [515, 425]], { stroke: C.acLive, sw: 6 });
wire([[70, 500], [399, 500], [399, 820], [3275, 820]], { stroke: C.acNeutral, sw: 6 });
node(399, 820, C.acNeutral);

// HLK.
component(860, 338, 420, 260, "PS1", "HLK-10M05", { stroke: "#ea580c", fill: "#fff7ed", nameSize: 27 });
pin(860, 430, "AC-L", "left", { color: C.acLive });
pin(860, 520, "AC-N", "left", { color: C.acNeutral });
pin(1280, 430, "+Vo +5V", "right", { color: C.five, len: 60, size: 17 });
pin(1280, 520, "-Vo GND", "right", { color: C.gnd, len: 60, size: 17 });
multiText(900, 475, ["AC-DC isolated", "power module"], { size: 18, line: 24, fill: C.ink, weight: 650 });

// PZEM.
component(1515, 322, 500, 300, "U2", "PZEM-004T-100A", { stroke: "#16a34a", fill: "#f0fdf4", nameSize: 26 });
pin(1515, 405, "L", "left", { color: C.acLive, len: 60 });
pin(1515, 495, "N", "left", { color: C.acNeutral, len: 60 });
pin(2015, 382, "VCC", "right", { color: C.five, len: 52 });
pin(2015, 430, "GND", "right", { color: C.gnd, len: 52 });
pin(2015, 478, "TX", "right", { color: C.uart, len: 52 });
pin(2015, 526, "RX", "right", { color: C.uart, len: 52 });
pin(1765, 622, "CT+", "bottom", { color: "#b45309", len: 48 });
pin(1865, 622, "CT-", "bottom", { color: "#b45309", len: 48 });
multiText(1550, 565, ["Voltage input before relay", "TTL UART to ESP32", "100A CT sensor"], { size: 17, line: 23, fill: C.ink, weight: 650 });

// Relay contact and load.
relayContact(2240, 425);
component(3075, 344, 300, 235, "J2", "AC LOAD", { stroke: C.acNeutral, fill: "#eff6ff", nameSize: 28 });
pin(3375, 425, "L", "right", { color: C.acLive, len: 50 });
pin(3375, 520, "N", "right", { color: C.acNeutral, len: 50 });
multiText(3115, 462, ["Appliance / outlet", "L from relay NO", "N from mains N"], { size: 18, line: 24, fill: C.ink, weight: 650 });
ctClamp(2855, 425);
text(2855, 344, "CT around switched LIVE only", { size: 19, fill: "#b45309", anchor: "middle", weight: 900 });

// AC wires.
wire([[725, 425], [775, 425], [775, 300], [2240, 300], [2240, 425]], { stroke: C.acLive, sw: 6 });
wire([[812, 300], [812, 430]], { stroke: C.acLive, sw: 6 });
wire([[1455, 300], [1455, 405]], { stroke: C.acLive, sw: 6 });
wire([[399, 820], [835, 820], [835, 520], [860, 520]], { stroke: C.acNeutral, sw: 6 });
wire([[835, 820], [1455, 820], [1455, 495]], { stroke: C.acNeutral, sw: 6 });
node(835, 820, C.acNeutral);
wire([[2490, 425], [2780, 425]], { stroke: C.acLive, sw: 6 });
wire([[2930, 425], [3075, 425]], { stroke: C.acLive, sw: 6 });
wire([[3275, 820], [3275, 579]], { stroke: C.acNeutral, sw: 6 });
wire([[3375, 520], [3430, 520]], { stroke: C.acNeutral, sw: 6 });
wire([[1765, 670], [1765, 735], [2778, 735], [2778, 495]], { stroke: "#b45309", sw: 4 });
wire([[1865, 670], [1865, 770], [2932, 770], [2932, 495]], { stroke: "#b45309", sw: 4 });
text(2350, 715, "CT pair returns to PZEM CT input", { size: 17, fill: "#b45309", anchor: "middle", weight: 800 });

// Notes.
rect(124, 710, 850, 150, { fill: "#fff7ed", stroke: "#f97316", sw: 3, rx: 12 });
multiText(150, 750, [
  { text: "Safety:", weight: 900, fill: "#9a3412" },
  "Fuse the live conductor before relay, HLK, and PZEM.",
  "Use an enclosure, strain relief, proper wire gauge, and insulation.",
], { size: 18, line: 25, fill: "#9a3412", weight: 650 });
rect(1040, 710, 835, 150, { fill: "#fff7ed", stroke: "#f97316", sw: 3, rx: 12 });
multiText(1066, 750, [
  { text: "Relay contact:", weight: 900, fill: "#9a3412" },
  "Use COM and NO for normal smart-plug behavior.",
  "Neutral is not switched; it goes directly to the load.",
], { size: 18, line: 25, fill: "#9a3412", weight: 650 });

// Low-voltage panel.
rect(72, 1005, 3364, 1320, { fill: C.panel, stroke: "#0284c7", sw: 4, rx: 16 });
text(108, 1060, "B. LOW-VOLTAGE COMPONENT SYMBOL SCHEMATIC", { size: 31, fill: "#075985", weight: 900 });
text(3330, 1058, "Module symbols use real pin names and firmware GPIO mapping", { size: 20, fill: "#075985", anchor: "end", weight: 900 });

// ESP32 central.
component(1270, 1165, 880, 910, "U1", "ESP32 38-PIN DEVKIT V1", { stroke: "#0284c7", fill: "#e0f2fe", nameSize: 29 });
multiText(1535, 1270, [
  { text: "Power", weight: 900 },
  "VIN/5V = +5V",
  "3V3 = RTC VCC",
  "GND = common GND",
  "",
  { text: "UART / GPIO / SPI", weight: 900 },
  "GPIO16 RX2 <- PZEM TX",
  "GPIO17 TX2 -> PZEM RX",
  "GPIO26 -> Relay IN",
  "GPIO18 -> SD SCK",
  "GPIO19 <- SD MISO",
  "GPIO23 -> SD MOSI",
  "GPIO5 -> SD CS",
  "",
  { text: "RTC / Audio / Controls", weight: 900 },
  "GPIO21 -> RTC CLK",
  "GPIO22 <-> RTC IO/DAT",
  "GPIO4 -> RTC RST",
  "GPIO32 RX1 <- MP3 TX",
  "GPIO33 TX1 -> MP3 RX",
  "GPIO25 manual button",
  "GPIO27 pairing reset",
  "GPIO2 status LED",
], { size: 18, line: 24, fill: C.ink, weight: 650 });

// ESP pins.
const leftPins = [
  [1218, 1255, "5V/VIN", C.five],
  [1218, 1305, "3V3", C.three],
  [1218, 1355, "GND", C.gnd],
  [1218, 1435, "GPIO16", C.uart],
  [1218, 1485, "GPIO17", C.uart],
  [1218, 1570, "GPIO21", C.sig],
  [1218, 1620, "GPIO22", C.sig],
  [1218, 1670, "GPIO4", C.sig],
  [1218, 1780, "GPIO25", C.sig],
  [1218, 1830, "GPIO27", C.sig],
  [1218, 1880, "GPIO2", C.sig],
];
leftPins.forEach(([x, y, label, color]) => pin(1270, y, label, "left", { color, len: 52, size: 16 }));
const rightPins = [
  [2150, 1430, "GPIO26", C.sig],
  [2150, 1575, "GPIO18", C.spi],
  [2150, 1625, "GPIO19", C.spi],
  [2150, 1675, "GPIO23", C.spi],
  [2150, 1725, "GPIO5", C.spi],
  [2150, 1850, "GPIO32", C.uart],
  [2150, 1900, "GPIO33", C.uart],
];
rightPins.forEach(([x, y, label, color]) => pin(2150, y, label, "right", { color, len: 52, size: 16 }));

// PZEM TTL component symbol.
component(150, 1220, 440, 250, "U2A", "PZEM TTL", { stroke: "#16a34a", fill: "#f0fdf4", nameSize: 26 });
pin(590, 1290, "TX", "right", { color: C.uart, len: 50 });
pin(590, 1340, "RX", "right", { color: C.uart, len: 50 });
pin(150, 1282, "VCC +5V", "left", { color: C.five, len: 45, size: 16 });
pin(150, 1332, "GND", "left", { color: C.gnd, len: 45, size: 16 });
wire([[640, 1290], [1218, 1290], [1218, 1435]], { stroke: C.uart, sw: 4 });
text(925, 1274, "PZEM TX -> GPIO16", { size: 18, fill: C.uart, anchor: "middle", weight: 900 });
wire([[640, 1340], [1170, 1340], [1170, 1485], [1218, 1485]], { stroke: C.uart, sw: 4 });
text(920, 1324, "PZEM RX <- GPIO17", { size: 18, fill: C.uart, anchor: "middle", weight: 900 });

// RTC.
component(150, 1540, 440, 270, "U4", "DS1302 RTC", { stroke: "#16a34a", fill: "#f0fdf4", nameSize: 26 });
pin(590, 1600, "CLK", "right", { color: C.sig, len: 50 });
pin(590, 1650, "IO/DAT", "right", { color: C.sig, len: 50 });
pin(590, 1700, "RST", "right", { color: C.sig, len: 50 });
pin(150, 1590, "VCC 3V3", "left", { color: C.three, len: 45, size: 16 });
pin(150, 1640, "GND", "left", { color: C.gnd, len: 45, size: 16 });
wire([[640, 1600], [1218, 1600], [1218, 1570]], { stroke: C.sig, sw: 4 });
wire([[640, 1650], [1218, 1650], [1218, 1620]], { stroke: C.sig, sw: 4 });
wire([[640, 1700], [1218, 1700], [1218, 1670]], { stroke: C.sig, sw: 4 });
text(920, 1584, "RTC CLK / IO / RST", { size: 18, fill: C.sig, anchor: "middle", weight: 900 });

// Buttons and LED symbols.
rect(150, 1905, 680, 300, { fill: "#fff", stroke: C.border, sw: 3, rx: 12 });
text(490, 1950, "LOCAL CONTROL SYMBOLS", { size: 25, fill: C.ink, anchor: "middle", weight: 900 });
wire([[1218, 1780], [900, 1780], [900, 2012], [292, 2012]], { stroke: C.sig, sw: 4 });
pushButton(360, 2012, "S1 Manual ON/OFF");
wire([[1218, 1830], [935, 1830], [935, 2088], [292, 2088]], { stroke: C.sig, sw: 4 });
pushButton(360, 2088, "S2 Pairing Reset");
wire([[1218, 1880], [980, 1880], [980, 2166], [255, 2166]], { stroke: C.sig, sw: 4 });
resistor(255, 2166, 440, 2166, "R1 220-330 ohm");
led(500, 2166, "D1 Green Status LED");
ground(580, 2166, C.gnd);

// Relay logic module.
component(2530, 1200, 455, 260, "K1A", "RELAY MODULE INPUT", { stroke: "#b45309", fill: "#fffbeb", nameSize: 25 });
pin(2530, 1285, "IN", "left", { color: C.sig, len: 50 });
pin(2985, 1265, "VCC +5V", "right", { color: C.five, len: 48, size: 16 });
pin(2985, 1320, "GND", "right", { color: C.gnd, len: 48, size: 16 });
multiText(2570, 1362, ["5V relay board", "IN driven by GPIO26", "Contact shown as K1 above"], { size: 17, line: 23, fill: C.ink, weight: 650 });
wire([[2202, 1430], [2530, 1430], [2530, 1285]], { stroke: C.sig, sw: 4 });
text(2370, 1415, "GPIO26 -> relay IN", { size: 18, fill: C.sig, anchor: "middle", weight: 900 });

// SD module.
component(2530, 1535, 480, 345, "U5", "MICRO SD MODULE", { stroke: C.spi, fill: "#faf5ff", nameSize: 25 });
pin(2530, 1600, "SCK", "left", { color: C.spi, len: 50 });
pin(2530, 1650, "MISO", "left", { color: C.spi, len: 50 });
pin(2530, 1700, "MOSI", "left", { color: C.spi, len: 50 });
pin(2530, 1750, "CS", "left", { color: C.spi, len: 50 });
pin(3010, 1605, "VCC +5V", "right", { color: C.five, len: 48, size: 16 });
pin(3010, 1660, "GND", "right", { color: C.gnd, len: 48, size: 16 });
multiText(2570, 1810, ["SPI storage for offline logs", "Firmware configured near 1 MHz"], { size: 17, line: 23, fill: C.ink, weight: 650 });
wire([[2202, 1575], [2480, 1575], [2480, 1600]], { stroke: C.spi, sw: 4 });
wire([[2202, 1625], [2480, 1625], [2480, 1650]], { stroke: C.spi, sw: 4 });
wire([[2202, 1675], [2480, 1675], [2480, 1700]], { stroke: C.spi, sw: 4 });
wire([[2202, 1725], [2480, 1725], [2480, 1750]], { stroke: C.spi, sw: 4 });

// MP3 and speaker.
component(2530, 1940, 480, 270, "U6", "MP3-TF-16P", { stroke: C.uart, fill: "#eff6ff", nameSize: 25 });
pin(2530, 2010, "TX", "left", { color: C.uart, len: 50 });
pin(2530, 2060, "RX", "left", { color: C.uart, len: 50 });
pin(3010, 1998, "VCC +5V", "right", { color: C.five, len: 48, size: 16 });
pin(3010, 2048, "GND", "right", { color: C.gnd, len: 48, size: 16 });
pin(3010, 2110, "SPK1", "right", { color: C.uart, len: 48, size: 16 });
pin(3010, 2160, "SPK2", "right", { color: C.uart, len: 48, size: 16 });
wire([[2202, 1850], [2420, 1850], [2420, 2010], [2530, 2010]], { stroke: C.uart, sw: 4 });
wire([[2202, 1900], [2380, 1900], [2380, 2060], [2530, 2060]], { stroke: C.uart, sw: 4 });
text(2350, 1835, "GPIO32 <- MP3 TX", { size: 18, fill: C.uart, anchor: "middle", weight: 900 });
text(2350, 1885, "GPIO33 -> MP3 RX through 1k", { size: 18, fill: C.uart, anchor: "middle", weight: 900 });
speaker(3300, 2140);
wire([[3058, 2110], [3230, 2110], [3230, 2116]], { stroke: C.uart, sw: 4 });
wire([[3058, 2160], [3230, 2160], [3230, 2164]], { stroke: C.uart, sw: 4 });

// Power net bus labels.
rect(2280, 1100, 900, 105, { fill: "#fff", stroke: "#cbd5e1", sw: 2, rx: 10 });
multiText(2302, 1132, [
  { text: "Power nets:", weight: 900 },
  "+5V from HLK feeds ESP32 VIN/5V, relay, PZEM, SD, and MP3.",
  "3V3 from ESP32 feeds RTC only. All GND pins are common.",
], { size: 17, line: 23, fill: C.ink, weight: 650 });

// Legend.
rect(92, 2350, 3320, 85, { fill: "#fff", stroke: "#cbd5e1", sw: 2, rx: 12 });
const legend = [
  [140, C.acLive, "AC live"],
  [430, C.acNeutral, "AC neutral"],
  [770, C.five, "+5V"],
  [1010, C.three, "+3.3V"],
  [1270, C.gnd, "GND"],
  [1510, C.sig, "GPIO / control"],
  [1840, C.uart, "UART / speaker"],
  [2190, C.spi, "SPI"],
];
legend.forEach(([x, color, label]) => {
  line(x, 2392, x + 90, 2392, { stroke: color, sw: 6 });
  text(x + 110, 2400, label, { size: 18, fill: C.ink, weight: 800 });
});
text(3370, 2400, "Verify real module pin labels before wiring or applying mains power.", {
  size: 18,
  fill: C.muted,
  anchor: "end",
  weight: 800,
});

add(`</svg>`);

const svg = parts.join("\n");
fs.writeFileSync(svgPath, svg);
const relSvg = `${baseName}.svg`;
const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Smart Plug Component Symbol Schematic</title>
  <style>
    html, body { margin: 0; background: #f8fafc; }
    .page { width: 100vw; min-height: 100vh; display: grid; place-items: center; }
    img { width: min(100vw, 1400px); height: auto; box-shadow: 0 8px 28px rgba(15, 23, 42, 0.14); background: white; }
  </style>
</head>
<body>
  <div class="page"><img src="${relSvg}" alt="Smart Plug Component Symbol Schematic" /></div>
</body>
</html>`;
fs.writeFileSync(htmlPath, html);

console.log(svgPath);
console.log(htmlPath);
