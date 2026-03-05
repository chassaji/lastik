import type { EntityType } from "@/lib/anonymizer/types";
import type { ReplacementTemplate } from "@/lib/anonymizer/rules/types";

function syntheticDateLike(source: string, idx: number): string {
  const ddmmyyyy = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/;
  const yyyymmdd = /^(\d{4})([./-])(\d{1,2})\2(\d{1,2})$/;

  const m1 = source.match(ddmmyyyy);
  if (m1) {
    const sep = m1[2];
    const day = String(((idx - 1) % 28) + 1).padStart(2, "0");
    const month = String((((idx - 1) >> 1) % 12) + 1).padStart(2, "0");
    const year = String(1990 + ((idx - 1) % 25));
    return `${day}${sep}${month}${sep}${year}`;
  }

  const m2 = source.match(yyyymmdd);
  if (m2) {
    const sep = m2[2];
    const year = String(1990 + ((idx - 1) % 25));
    const month = String((((idx - 1) >> 1) % 12) + 1).padStart(2, "0");
    const day = String(((idx - 1) % 28) + 1).padStart(2, "0");
    return `${year}${sep}${month}${sep}${day}`;
  }

  return "01.01.1990";
}

export const syntheticTemplates: Record<EntityType, ReplacementTemplate> = {
  USER: (idx) => `USER_${idx}`,
  EMAIL: (idx) => `user${idx}@example.test`,
  PHONE: (idx) => `+0000000${String(idx).padStart(4, "0")}`,
  IP: (idx) => `10.0.0.${Math.min(254, idx)}`,
  ADDRESS: (idx) => `ADDRESS_${idx}`,
  CARD: (idx) => `4111 **** **** ${String((1000 + idx) % 10000).padStart(4, "0")}`,
  IBAN: (idx) => `DE00TEST0000000000${String(idx).padStart(4, "0")}`,
  SWIFT_BIC: (idx) => `FAKE${String(idx).padStart(4, "0")}`,
  ACCOUNT: (idx) => `***************${String(idx).padStart(5, "0")}`,
  DOC_ID: (idx, region) => `${region ?? "XX"}-DOC-${String(idx).padStart(5, "0")}`,
  PERSON: (idx) => `PERSON_${idx}`,
  ORG: (idx) => `ORG_${idx}`,
  DATE: (idx, _region, source) => syntheticDateLike(source ?? "", idx),
};

export function getTagReplacement(type: EntityType, idx: number): string {
  if (type === "USER") {
    return `[USER_${idx}]`;
  }
  if (type === "DATE") {
    return `[DATE_${idx}]`;
  }
  return `[${type}_${idx}]`;
}
