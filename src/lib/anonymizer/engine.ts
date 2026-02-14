import { getActiveRules } from "@/lib/anonymizer/registry";
import { getTagReplacement, syntheticTemplates } from "@/lib/anonymizer/rules/replacements";
import type {
  AnalyzeOptions,
  AnalyzeResult,
  DetectorMatch,
  EntityType,
  MappingRecord,
  ReplaceMode,
} from "@/lib/anonymizer/types";

function normalizeText(input: string): string {
  return input.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
}

function pushMatches(options: AnalyzeOptions, target: DetectorMatch[]): void {
  const { text, enabledRegions } = options;
  const rules = getActiveRules(enabledRegions);

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null = rule.pattern.exec(text);

    while (match) {
      const source = match[0];
      const start = match.index;
      const end = start + source.length;

      // 1. Context check (custom or hint-based)
      let hintHits = 0;
      if (rule.contextHints && rule.contextHints.length > 0) {
        const windowSize = 40;
        const context = text
          .slice(Math.max(0, start - windowSize), Math.min(text.length, end + windowSize))
          .toLowerCase();

        hintHits = rule.contextHints.filter((hint) => context.includes(hint.toLowerCase())).length;

        if (hintHits === 0) {
          match = rule.pattern.exec(text);
          continue;
        }
      }

      if (rule.contextCheck && !rule.contextCheck(text, start, end)) {
        match = rule.pattern.exec(text);
        continue;
      }

      // 2. Validator check
      if (rule.validator && !rule.validator(source)) {
        match = rule.pattern.exec(text);
        continue;
      }

      // 3. Confidence calculation
      const confidence = Math.min(0.99, (rule.priority + hintHits * 5) / 100);

      target.push({
        type: rule.type,
        start,
        end,
        source,
        ruleId: rule.id,
        region: rule.region,
        confidence,
        confidenceBasis: rule.confidenceBasis,
        detectorSource: rule.region ? "regional" : "universal",
        priority: rule.priority,
      });

      match = rule.pattern.exec(text);
    }
  }
}

function resolveOverlaps(matches: DetectorMatch[]): DetectorMatch[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return b.priority - a.priority;
  });

  const accepted: DetectorMatch[] = [];
  for (const candidate of sorted) {
    const overlappingIndices = accepted
      .map((item, index) => (candidate.start < item.end && candidate.end > item.start ? index : -1))
      .filter((idx) => idx !== -1);

    if (overlappingIndices.length === 0) {
      accepted.push(candidate);
      continue;
    }

    // Check if candidate is stronger than ALL overlapping items
    const allWeaker = overlappingIndices.every((idx) => candidate.priority > accepted[idx].priority);

    if (allWeaker) {
      // Remove all weaker items and add the candidate
      // Sort indices descending to splice safely
      overlappingIndices.sort((a, b) => b - a).forEach((idx) => accepted.splice(idx, 1));
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}

function applyReplacements(
  text: string,
  entities: DetectorMatch[],
  mode: ReplaceMode,
): { anonymizedText: string; entities: DetectorMatch[]; mappings: MappingRecord[] } {
  const mappingBySource = new Map<string, string>();
  const perTypeCounter = new Map<EntityType, number>();

  const withIds = entities.map((entity) => {
    const key = `${entity.type}|${entity.region ?? "-"}|${entity.source}`;
    let replacement = mappingBySource.get(key);

    if (!replacement) {
      const next = (perTypeCounter.get(entity.type) ?? 0) + 1;
      perTypeCounter.set(entity.type, next);

      if (mode === "tag") {
        replacement = getTagReplacement(entity.type, next);
      } else {
        const template = syntheticTemplates[entity.type];
        replacement = template
          ? template(next, entity.region, entity.source)
          : `REDACTED_${next}`;
      }

      mappingBySource.set(key, replacement);
    }

    const entityId = `${entity.type}_${entity.start}_${entity.end}`;
    return {
      ...entity,
      entityId,
      replacement,
    };
  });

  let cursor = 0;
  let output = "";
  for (const entity of withIds) {
    output += text.slice(cursor, entity.start);
    output += entity.replacement ?? entity.source;
    cursor = entity.end;
  }
  output += text.slice(cursor);

  const mappings: MappingRecord[] = withIds.map((entity) => ({
    entityId: entity.entityId ?? "",
    type: entity.type,
    region: entity.region,
    source: entity.source,
    replacement: entity.replacement ?? "",
    ruleId: entity.ruleId,
    confidence: entity.confidence,
    position: {
      start: entity.start,
      end: entity.end,
    },
  }));

  return {
    anonymizedText: output,
    entities: withIds,
    mappings,
  };
}

export function analyzeText(options: AnalyzeOptions): AnalyzeResult {
  const originalText = options.text;
  const text = normalizeText(options.text);
  const matches: DetectorMatch[] = [];

  pushMatches({ ...options, text }, matches);

  const resolved = resolveOverlaps(matches);
  const replaced = applyReplacements(text, resolved, options.replaceMode);

  return {
    originalText,
    anonymizedText: replaced.anonymizedText,
    entities: replaced.entities,
    mappings: replaced.mappings,
  };
}
