export type EntityType =
  | "USER"
  | "EMAIL"
  | "PHONE"
  | "CARD"
  | "IBAN"
  | "SWIFT_BIC"
  | "ACCOUNT"
  | "DOC_ID"
  | "PERSON"
  | "ORG"
  | "DATE";

export type RegionCode = "RU" | "AM" | "EU";

export type ReplaceMode = "tag" | "synthetic";

export interface DetectionContext {
  text: string;
  enabledRegions: RegionCode[];
}

export interface DetectorMatch {
  entityId?: string;
  type: EntityType;
  start: number;
  end: number;
  source: string;
  replacement?: string;
  ruleId: string;
  region?: RegionCode;
  confidence: number;
  confidenceBasis: string;
  detectorSource: "universal" | "regional";
  priority: number;
  disabled?: boolean;
}

export interface AnonymizationRule {
  id: string;
  type: EntityType;
  pattern: RegExp;
  region?: RegionCode;
  priority: number;
  confidenceBasis: string;
  contextHints?: string[];
  validator?: (value: string) => boolean;
  contextCheck?: (text: string, start: number, end: number) => boolean;
}

export interface MappingRecord {
  entityId: string;
  type: EntityType;
  region?: RegionCode;
  source: string;
  replacement: string;
  ruleId: string;
  confidence: number;
  position: {
    start: number;
    end: number;
  };
  enabled?: boolean;
}

export interface UserRule {
  source: string;
  type: EntityType;
  matchMode: "exact";
  caseSensitive: true;
}

export interface AnalyzeOptions {
  text: string;
  replaceMode: ReplaceMode;
  enabledRegions: RegionCode[];
}

export interface AnalyzeResult {
  originalText: string;
  anonymizedText: string;
  entities: DetectorMatch[];
  mappings: MappingRecord[];
}
