import type { AnonymizationRule } from "@/lib/anonymizer/rules/types";

export const euRules: AnonymizationRule[] = [
  {
    id: "eu.passport.alphanumeric_9",
    region: "EU",
    type: "DOC_ID",
    pattern: /\b[A-Z0-9]{9}\b/g,
    contextHints: ["passport", "id card", "document no", "national id"],
    priority: 72,
    confidenceBasis: "format+context",
  },
  {
    id: "eu.vat.number",
    region: "EU",
    type: "DOC_ID",
    pattern: /\b[A-Z]{2}[A-Z0-9]{8,12}\b/g,
    contextHints: ["vat", "tax", "registration"],
    priority: 66,
    confidenceBasis: "format+hint",
  },
  {
    id: "eu.residence_permit_like",
    region: "EU",
    type: "DOC_ID",
    pattern: /\b\d{2}[A-Z]{2}\d{5,7}\b/g,
    contextHints: ["residence", "permit", "id"],
    priority: 64,
    confidenceBasis: "format+hint",
  },
];
