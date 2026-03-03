import type { EntityType, RegionCode } from "@/lib/anonymizer/types";

export type ExportRuleOrigin = "system" | "user";

export interface ExportRule {
  entityType: EntityType;
  origin: ExportRuleOrigin;
  source: string;
  replacement: string;
  region?: RegionCode;
  ruleId?: string;
}

interface RulesExportPayload {
  schemaVersion: "2.0";
  generatedAt: string;
  total: number;
  rules: ExportRule[];
}

export function rulesToJson(rules: ExportRule[]): string {
  const payload: RulesExportPayload = {
    schemaVersion: "2.0",
    generatedAt: new Date().toISOString(),
    total: rules.length,
    rules,
  };

  return JSON.stringify(payload, null, 2);
}

function toRule(rawRule: unknown): ExportRule | null {
  if (!rawRule || typeof rawRule !== "object") return null;

  const candidate = rawRule as Record<string, unknown>;
  const entityType = candidate.entityType;
  const origin = candidate.origin;
  const source = candidate.source;
  const replacement = candidate.replacement;
  const region = candidate.region;
  const ruleId = candidate.ruleId;

  if (typeof entityType !== "string") return null;
  if (origin !== "system" && origin !== "user") return null;
  if (typeof source !== "string" || !source.trim()) return null;
  if (typeof replacement !== "string" || !replacement.trim()) return null;

  return {
    entityType: entityType as EntityType,
    origin,
    source,
    replacement,
    region: typeof region === "string" ? (region as RegionCode) : undefined,
    ruleId: typeof ruleId === "string" ? ruleId : undefined,
  };
}

export function parseRulesJson(content: string): ExportRule[] {
  const parsed = JSON.parse(content) as Record<string, unknown>;

  if (parsed.schemaVersion !== "2.0" || !Array.isArray(parsed.rules)) {
    throw new Error("invalid-rules-file");
  }

  const rules: ExportRule[] = [];
  parsed.rules.forEach((rawRule) => {
    const rule = toRule(rawRule);
    if (!rule) throw new Error("invalid-rules-file");
    rules.push(rule);
  });

  return rules;
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
