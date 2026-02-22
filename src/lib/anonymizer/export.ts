import type { UserRule } from "@/lib/anonymizer/types";

interface UserRulesExportPayload {
  schemaVersion: "1.0";
  kind: "user-rules";
  generatedAt: string;
  total: number;
  rules: UserRule[];
}

export function userRulesToJson(rules: UserRule[]): string {
  const payload: UserRulesExportPayload = {
    schemaVersion: "1.0",
    kind: "user-rules",
    generatedAt: new Date().toISOString(),
    total: rules.length,
    rules,
  };

  return JSON.stringify(payload, null, 2);
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
