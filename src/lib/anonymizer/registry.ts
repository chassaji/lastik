import { allRules } from "@/lib/anonymizer/rules";
import type { AnonymizationRule } from "@/lib/anonymizer/rules/types";
import type { RegionCode } from "@/lib/anonymizer/types";

export function getActiveRules(enabledRegions: RegionCode[]): AnonymizationRule[] {
  const enabled = new Set(enabledRegions);
  return allRules.filter((rule) => {
    // Universal rules have no region
    if (!rule.region) return true;
    // Regional rules must be in enabled regions
    return enabled.has(rule.region);
  });
}
