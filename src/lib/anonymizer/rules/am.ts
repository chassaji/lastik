import type { AnonymizationRule } from "@/lib/anonymizer/rules/types";

export const amRules: AnonymizationRule[] = [
  {
    id: "am.passport.alpha_numeric",
    region: "AM",
    type: "DOC_ID",
    pattern: /\b[A-Z]{2}\d{7}\b/g,
    contextHints: ["passport", "անձնագիր", "document"],
    priority: 80,
    confidenceBasis: "format+context",
  },
  {
    id: "am.ssn_like",
    region: "AM",
    type: "DOC_ID",
    pattern: /\b\d{10}\b/g,
    contextHints: ["ssn", "social", "հաշվառում"],
    priority: 65,
    confidenceBasis: "format+hint",
  },
  {
    id: "am.tax_identifier",
    region: "AM",
    type: "DOC_ID",
    pattern: /\b\d{8}\b/g,
    contextHints: ["tin", "tax", "հարկ"],
    priority: 60,
    confidenceBasis: "format+hint",
  },
];
