import type { MappingRecord } from "@/lib/anonymizer/types";

export interface ExportOptions {
  includeSourceValues: boolean;
}

interface MappingExportRow {
  schemaVersion: "1.0";
  entityId: string;
  type: string;
  region: string;
  source: string;
  replacement: string;
  enabled: boolean;
  ruleId: string;
  confidence: string;
  start: string;
  end: string;
  checksum: string;
}

function checksum(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toRows(records: MappingRecord[], options: ExportOptions): MappingExportRow[] {
  return records.map((record) => {
    const source = options.includeSourceValues ? record.source : "[REDACTED]";
    const payload = `${record.entityId}|${record.type}|${record.region ?? ""}|${source}|${record.replacement}|${record.ruleId}|${record.position.start}|${record.position.end}`;
    return {
      schemaVersion: "1.0",
      entityId: record.entityId,
      type: record.type,
      region: record.region ?? "",
      source,
      replacement: record.replacement,
      enabled: record.enabled !== false,
      ruleId: record.ruleId,
      confidence: record.confidence.toFixed(2),
      start: String(record.position.start),
      end: String(record.position.end),
      checksum: checksum(payload),
    };
  });
}

export function mappingToJson(records: MappingRecord[], options: ExportOptions): string {
  return JSON.stringify(
    {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      total: records.length,
      items: toRows(records, options),
    },
    null,
    2,
  );
}

export function mappingToCsv(records: MappingRecord[], options: ExportOptions): string {
  const rows = toRows(records, options);
  const header = [
    "schemaVersion",
    "entityId",
    "type",
    "region",
    "source",
    "replacement",
    "ruleId",
    "confidence",
    "start",
    "end",
    "checksum",
  ];

  const escaped = (value: string) => `"${value.replaceAll("\"", "\"\"")}"`;

  const body = rows.map((row) =>
    [
      row.schemaVersion,
      row.entityId,
      row.type,
      row.region,
      row.source,
      row.replacement,
      row.ruleId,
      row.confidence,
      row.start,
      row.end,
      row.checksum,
    ]
      .map(escaped)
      .join(","),
  );

  return [header.join(","), ...body].join("\n");
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

