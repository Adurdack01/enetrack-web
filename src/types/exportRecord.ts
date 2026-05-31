export type ExportFormat = "CSV" | "PDF";

export type ExportRecordRow = {
  deviceName: string;
  date: string;
  energy: number;
  cost: number;
  action?: string;
  details?: string;
};

export type ExportRecordSummaryItem = {
  label: string;
  value: string;
};

export type ExportRecord = {
  id: string;
  title: string;
  source: string;
  format: ExportFormat;
  entries: number;
  totalUsage?: number;
  fileName?: string;
  mimeType?: string;
  content?: string;
  rows?: ExportRecordRow[];
  summary?: ExportRecordSummaryItem[];
  notes?: string[];
  createdAt: string;
};
