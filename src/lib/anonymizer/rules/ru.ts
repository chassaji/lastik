import type { AnonymizationRule } from "@/lib/anonymizer/rules/types";

export const ruRules: AnonymizationRule[] = [
  {
    id: "ru.passport.series_number",
    region: "RU",
    type: "DOC_ID",
    pattern: /\b\d{2}\s?\d{2}\s?\d{6}\b/g,
    contextHints: ["паспорт", "серия", "номер", "выдан"],
    priority: 80,
    confidenceBasis: "format+context",
  },
  {
    id: "ru.inn.person_or_company",
    region: "RU",
    type: "DOC_ID",
    pattern: /\b\d{10}(?:\d{2})?\b/g,
    contextHints: ["инн", "налог"],
    priority: 70,
    confidenceBasis: "format+hint",
  },
  {
    id: "ru.snils",
    region: "RU",
    type: "DOC_ID",
    pattern: /\b\d{3}-\d{3}-\d{3}\s\d{2}\b/g,
    contextHints: ["снилс"],
    priority: 75,
    confidenceBasis: "exact-format",
  },
];
