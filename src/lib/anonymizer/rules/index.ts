import { amRules } from "@/lib/anonymizer/rules/am";
import { euRules } from "@/lib/anonymizer/rules/eu";
import { ruRules } from "@/lib/anonymizer/rules/ru";
import { universalRules } from "@/lib/anonymizer/rules/universal";

export const allRules = [...universalRules, ...ruRules, ...amRules, ...euRules];

export { amRules, euRules, ruRules, universalRules };
