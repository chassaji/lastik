import type { AnonymizationRule, RegionCode } from "@/lib/anonymizer/types";

export type ReplacementTemplate = (idx: number, region?: RegionCode, source?: string) => string;
export type { AnonymizationRule };
