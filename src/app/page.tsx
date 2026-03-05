"use client";

import { ReviewSidebar } from "@/components/review-sidebar";
import { defaultInput } from "@/lib/anonymizer/default-text";
import { analyzeText } from "@/lib/anonymizer/engine";
import { downloadTextFile, parseRulesJson, rulesToJson } from "@/lib/anonymizer/export";
import type {
  AnalyzeResult,
  DetectorMatch,
  EntityType,
  MappingRecord,
  RegionCode,
  ReplaceMode,
  UserRule,
} from "@/lib/anonymizer/types";
import { useMemo, useRef, useState, useTransition, useEffect, useLayoutEffect } from "react";

const ENTITY_JUMP_FLASH_MS = 3000;
const DESKTOP_SELECTION_POPUP_OFFSET = 44;
const SELECTION_POPUP_MARGIN = 12;
const SELECTION_POPUP_HALF_WIDTH = 96;

type ViewDirection = "forward" | "reverse";
type ResultMode = "analysis" | "imported";

interface ExportableRuleEntry {
  entityType: EntityType;
  origin: "system" | "user";
  source: string;
  replacement: string;
  region?: RegionCode;
  ruleId?: string;
}

interface ImportApplySummary {
  result: AnalyzeResult;
  appliedCount: number;
  skippedCount: number;
}


function getEntityId(entity: AnalyzeResult["entities"][number]): string {
  return entity.entityId ?? `${entity.type}_${entity.start}_${entity.end}`;
}

const ENTITY_TYPES: EntityType[] = [
  "USER",
  "PERSON",
  "ORG",
  "DOC_ID",
  "EMAIL",
  "PHONE",
  "IP",
  "ADDRESS",
  "CARD",
  "ACCOUNT",
  "IBAN",
  "SWIFT_BIC",
  "DATE",
];

function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && ENTITY_TYPES.includes(value as EntityType);
}

function userRuleKey(rule: Pick<UserRule, "source" | "type">): string {
  return `${rule.source}|${rule.type}`;
}

function createUserRule(source: string, type: EntityType): UserRule {
  return {
    source,
    type,
    matchMode: "exact",
    caseSensitive: true,
  };
}

function dedupeUserRules(rules: UserRule[]): UserRule[] {
  const byKey = new Map<string, UserRule>();
  rules.forEach((rule) => {
    byKey.set(userRuleKey(rule), {
      source: rule.source,
      type: rule.type,
      matchMode: "exact",
      caseSensitive: true,
    });
  });
  return Array.from(byKey.values());
}

function findOccurrences(text: string, source: string): Array<{ start: number; end: number }> {
  if (!source) return [];

  const matches: Array<{ start: number; end: number }> = [];
  let searchFrom = 0;

  while (true) {
    const start = text.indexOf(source, searchFrom);
    if (start === -1) break;
    const end = start + source.length;
    matches.push({ start, end });
    searchFrom = end;
  }

  return matches;
}

function buildManualEntitiesFromRules(text: string, rules: UserRule[]): DetectorMatch[] {
  const entities: DetectorMatch[] = [];
  const uniqueRules = dedupeUserRules(rules);

  uniqueRules.forEach((rule) => {
    const occurrences = findOccurrences(text, rule.source);
    occurrences.forEach((occurrence) => {
      entities.push({
        entityId: `MANUAL_${rule.type}_${occurrence.start}_${occurrence.end}`,
        type: rule.type,
        start: occurrence.start,
        end: occurrence.end,
        source: rule.source,
        ruleId: "manual.selection",
        confidence: 1,
        confidenceBasis: "user-selection",
        detectorSource: "universal",
        priority: 1000,
      });
    });
  });

  return entities;
}

function nextReplacement(type: EntityType, idx: number, mode: ReplaceMode): string {
  if (mode === "tag") {
    if (type === "USER") return `[USER_${idx}]`;
    if (type === "DATE") return `[DATE_${idx}]`;
    return `[${type}_${idx}]`;
  }

  switch (type) {
    case "USER":
      return `USER_${idx}`;
    case "EMAIL":
      return `user${idx}@example.test`;
    case "PHONE":
      return `+0000000${String(idx).padStart(4, "0")}`;
    case "CARD":
      return `4111 **** **** ${String((1000 + idx) % 10000).padStart(4, "0")}`;
    case "IBAN":
      return `DE00TEST0000000000${String(idx).padStart(4, "0")}`;
    case "SWIFT_BIC":
      return `FAKE${String(idx).padStart(4, "0")}`;
    case "ACCOUNT":
      return `***************${String(idx).padStart(5, "0")}`;
    case "DATE":
      return `01.01.1990`;
    case "PERSON":
      return `PERSON_${idx}`;
    case "ORG":
      return `ORG_${idx}`;
    default:
      return `DOC_${String(idx).padStart(5, "0")}`;
  }
}

function parseTagIndex(type: EntityType, replacement: string): number | null {
  if (!replacement.startsWith("[") || !replacement.endsWith("]")) return null;
  const core = replacement.slice(1, -1);
  if (type === "DATE") {
    const m = core.match(/^DATE_(\d+)$/);
    return m ? Number(m[1]) : null;
  }
  const m = core.match(new RegExp(`^${type}_(\\d+)$`));
  return m ? Number(m[1]) : null;
}

function parseSyntheticIndex(type: EntityType, replacement: string): number | null {
  if (type === "USER" || type === "PERSON" || type === "ORG") {
    const m = replacement.match(new RegExp(`^(?:${type})_(\\d+)$`));
    return m ? Number(m[1]) : null;
  }

  if (type === "EMAIL") {
    const m = replacement.match(/^user(\d+)@example\.test$/);
    return m ? Number(m[1]) : null;
  }

  if (type === "PHONE") {
    const m = replacement.match(/^\+0000000(\d{4})$/);
    return m ? Number(m[1]) : null;
  }

  return null;
}

function parseReplacementIndex(type: EntityType, replacement: string, mode: ReplaceMode): number | null {
  return mode === "tag" ? parseTagIndex(type, replacement) : parseSyntheticIndex(type, replacement);
}

function findSmallestFreeIndex(used: Set<number>): number {
  let i = 1;
  while (used.has(i)) i += 1;
  return i;
}

function withReplacements(entities: DetectorMatch[], mode: ReplaceMode): DetectorMatch[] {
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const usedByType = new Map<EntityType, Set<number>>();
  const sourceMap = new Map<string, string>();

  for (const entity of sorted) {
    if (!entity.replacement) continue;
    const key = `${entity.type}|${entity.region ?? "-"}|${entity.source}`;
    sourceMap.set(key, entity.replacement);
    const idx = parseReplacementIndex(entity.type, entity.replacement, mode);
    if (!idx) continue;
    const used = usedByType.get(entity.type) ?? new Set<number>();
    used.add(idx);
    usedByType.set(entity.type, used);
  }

  return sorted.map((entity) => {
    const key = `${entity.type}|${entity.region ?? "-"}|${entity.source}`;
    let replacement = entity.replacement;

    if (replacement) {
      const idx = parseReplacementIndex(entity.type, replacement, mode);
      if (idx) {
        const used = usedByType.get(entity.type) ?? new Set<number>();
        used.add(idx);
        usedByType.set(entity.type, used);
        sourceMap.set(key, replacement);
      } else {
        replacement = undefined;
      }
    }

    if (!replacement) {
      replacement = sourceMap.get(key);
    }

    if (!replacement) {
      const used = usedByType.get(entity.type) ?? new Set<number>();
      const next = findSmallestFreeIndex(used);
      used.add(next);
      usedByType.set(entity.type, used);
      replacement = nextReplacement(entity.type, next, mode);
      sourceMap.set(key, replacement);
    }
    return { ...entity, replacement };
  });
}

function mergeEntities(base: DetectorMatch[], manual: DetectorMatch[]): DetectorMatch[] {
  const all = [...base, ...manual].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return b.priority - a.priority;
  });
  const accepted: DetectorMatch[] = [];

  for (const candidate of all) {
    const overlappingIndices = accepted
      .map((item, index) => (candidate.start < item.end && candidate.end > item.start ? index : -1))
      .filter((idx) => idx !== -1);

    if (overlappingIndices.length === 0) {
      accepted.push(candidate);
      continue;
    }

    const allWeaker = overlappingIndices.every((idx) => candidate.priority > accepted[idx].priority);

    if (allWeaker) {
      overlappingIndices.sort((a, b) => b - a).forEach((idx) => accepted.splice(idx, 1));
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}

function getMappedOffset(node: Node, offset: number): number | null {
  let current: Node | null = node;
  if (current.nodeType === Node.TEXT_NODE) {
    current = current.parentNode;
  }
  
  if (current instanceof HTMLElement && current.hasAttribute("data-original-start")) {
    const start = Number(current.getAttribute("data-original-start"));
    return start + offset;
  }
  return null;
}

function getSelectionOffsets(container: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const start = getMappedOffset(range.startContainer, range.startOffset);
  const end = getMappedOffset(range.endContainer, range.endOffset);

  if (start === null || end === null) return null;
  if (start === end) return null;

  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function renderInteractivePreview(
  text: string,
  entities: AnalyzeResult["entities"],
  disabled: Set<string>,
  onToggle: (entityId: string) => void,
  onToggleLocal: (entityId: string) => void,
  flashEntityId: string | null,
) {
  if (!entities.length) return text;

  // Calculate frequencies to decide whether to show individual remove buttons
  const frequencies = new Map<string, number>();
  entities.forEach((e) => {
    const key = `${e.type}|${e.source}`;
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  });

  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((entity, index) => {
    const id = getEntityId(entity);
    
    // Safety check for overlaps
    if (entity.start < cursor) return;

    if (entity.start > cursor) {
      parts.push(
        <span 
          key={`text-${cursor}-${index}`}
          data-original-start={cursor}
        >
          {text.slice(cursor, entity.start)}
        </span>
      );
    }

    const isDisabled = disabled.has(id);
    const isManual = entity.ruleId === "manual.selection";
    const count = frequencies.get(`${entity.type}|${entity.source}`) ?? 0;
    const displayedContent = isDisabled ? text.slice(entity.start, entity.end) : (entity.replacement ?? entity.source);

    const isFlashing = flashEntityId === id;

    const handleMarkClick = () => {
      if (isManual) {
        onToggleLocal(id);
        return;
      }
      onToggle(id);
    };

    parts.push(
      <mark
        key={`entity-${id}-${index}`}
        data-original-start={entity.start}
        data-entity-id={id}
        role="button"
        tabIndex={0}
        onClick={handleMarkClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleMarkClick();
          }
        }}
        className={`${isDisabled ? "bg-(--highlight-disabled) text-zinc-400" : "bg-(--highlight-active) text-foreground"} ${
          isFlashing ? "ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25)] animate-pulse" : ""
        } cursor-pointer rounded transition-colors relative group`}
        style={
          isFlashing
            ? {
                backgroundColor: "var(--accent-muted)",
                color: "var(--accent)",
                outline: "2px solid var(--accent)",
                outlineOffset: "1px",
                boxShadow: "0 0 0 8px var(--accent-muted), 0 8px 24px rgba(15,23,42,0.16)",
              }
            : undefined
        }
        title={
          isManual
            ? isDisabled
              ? "This manual mask is disabled (click to enable this specific instance)"
              : "This manual mask is enabled (click to disable this specific instance)"
            : isDisabled
              ? "Masking disabled (click to enable)"
              : "Masking enabled (click to disable)"
        }
      >
        {displayedContent}
        {isManual && count > 1 && !isDisabled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(id);
            }}
            className="absolute -top-2 -right-2 flex h-3.5 w-3.5 items-center justify-center rounded-[2px] shadow-md transition-all z-10 bg-white text-rose-300 hover:text-rose-400"
            title="Remove this user rule"
          >
            <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
            </svg>
          </button>
        )}
      </mark>,
    );
    cursor = entity.end;
  });

  if (cursor < text.length) {
    parts.push(
      <span 
        key={`tail-${cursor}`}
        data-original-start={cursor}
      >
        {text.slice(cursor)}
      </span>
    );
  }

  return parts;
}

function buildOutputText(
  originalText: string,
  entities: AnalyzeResult["entities"],
  disabled: Set<string>,
): string {
  if (!entities.length) return originalText;
  const sorted = [...entities].sort((a, b) => a.start - b.start);

  let cursor = 0;
  let output = "";
  for (const entity of sorted) {
    const id = getEntityId(entity);
    output += originalText.slice(cursor, entity.start);
    output += disabled.has(id) ? entity.source : (entity.replacement ?? entity.source);
    cursor = entity.end;
  }
  output += originalText.slice(cursor);
  return output;
}

function collectExportRules(entities: DetectorMatch[], reversePairs: boolean): ExportableRuleEntry[] {
  const seen = new Set<string>();
  const rules: ExportableRuleEntry[] = [];

  entities.forEach((entity) => {
    const rawSource = reversePairs ? entity.replacement : entity.source;
    const rawReplacement = reversePairs ? entity.source : entity.replacement;
    const replacement = rawReplacement?.trim();
    const source = rawSource?.trim();
    if (!replacement || !source) return;

    const origin: "system" | "user" = entity.ruleId === "manual.selection" ? "user" : "system";
    const key = [
      entity.type,
      origin,
      source,
      replacement,
      entity.region ?? "",
      entity.ruleId ?? "",
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    rules.push({
      entityType: entity.type,
      origin,
      source,
      replacement,
      region: entity.region,
      ruleId: entity.ruleId,
    });
  });

  rules.sort((a, b) => {
    if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType);
    if (a.origin !== b.origin) return a.origin.localeCompare(b.origin);
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.replacement.localeCompare(b.replacement);
  });
  return rules;
}

function applyImportedRules(text: string, rules: ExportableRuleEntry[], direction: ViewDirection): ImportApplySummary {
  const matches: DetectorMatch[] = [];
  let entitySeq = 1;
  let matchedRules = 0;

  rules.forEach((rule) => {
    const from = direction === "forward" ? rule.source : rule.replacement;
    const to = direction === "forward" ? rule.replacement : rule.source;
    if (!from || !to || from === to) return;

    const occurrences = findOccurrences(text, from);
    if (occurrences.length === 0) return;
    matchedRules += 1;

    const basePriority = from.length * 100 + (rule.origin === "user" ? 1 : 0);
    occurrences.forEach((occurrence) => {
      matches.push({
        entityId: `IMPORTED_${entitySeq++}`,
        type: rule.entityType,
        start: occurrence.start,
        end: occurrence.end,
        source: from,
        replacement: to,
        ruleId: rule.ruleId ?? `imported.${rule.origin}`,
        region: rule.region,
        confidence: 1,
        confidenceBasis: "imported-rules",
        detectorSource: rule.region ? "regional" : "universal",
        priority: basePriority,
      });
    });
  });

  const resolved = mergeEntities(matches, []);
  const mappings: MappingRecord[] = resolved.map((entity) => ({
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
    result: {
      originalText: text,
      anonymizedText: buildOutputText(text, resolved, new Set()),
      entities: resolved,
      mappings,
    },
    appliedCount: resolved.length,
    skippedCount: Math.max(0, rules.length - matchedRules),
  };
}


export default function Home() {
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewEditorRef = useRef<HTMLDivElement | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const scrollSyncOwnerRef = useRef<"text" | "preview" | null>(null);
  const scrollSyncReleaseRef = useRef<number | null>(null);
  const [input, setInput] = useState(defaultInput);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode>("analysis");
  const [viewDirection, setViewDirection] = useState<ViewDirection>("forward");
  const [importDirection, setImportDirection] = useState<ViewDirection | null>(null);
  const [userRules, setUserRules] = useState<UserRule[]>([]);
  const replaceMode: ReplaceMode = "tag";
  const enabledRegions: RegionCode[] = ["RU", "AM", "EU"];
  const [filterType, setFilterType] = useState("ALL");
  const [filterRegion, setFilterRegion] = useState("ALL");
  const [disabledEntityIds, setDisabledEntityIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; mobile: boolean } | null>(null);
  const [jumpFlashEntityId, setJumpFlashEntityId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"input" | "output">("input");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const isForwardDirection = viewDirection === "forward";
  const editablePanelId: "input" | "output" = isForwardDirection ? "input" : "output";
  const previewPanelId: "input" | "output" = isForwardDirection ? "output" : "input";

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      if (scrollSyncReleaseRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncReleaseRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const textEl = textEditorRef.current;
    const previewEl = previewEditorRef.current;
    if (!textEl || !previewEl) return;
    if (!result) return;

    scrollSyncOwnerRef.current = "text";
    previewEl.scrollTop = textEl.scrollTop;
    previewEl.scrollLeft = textEl.scrollLeft;

    if (scrollSyncReleaseRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncReleaseRef.current);
    }
    scrollSyncReleaseRef.current = window.requestAnimationFrame(() => {
      if (scrollSyncOwnerRef.current === "text") {
        scrollSyncOwnerRef.current = null;
      }
      scrollSyncReleaseRef.current = null;
    });
  }, [result, viewDirection]);

  const manualEntities = useMemo(() => buildManualEntitiesFromRules(input, userRules), [input, userRules]);

  const combinedEntities = useMemo(() => {
    const base = result?.entities ?? [];
    if (resultMode === "imported") {
      return mergeEntities(base, []);
    }
    const merged = mergeEntities(base, manualEntities);
    return withReplacements(merged, replaceMode);
  }, [result, resultMode, manualEntities, replaceMode]);

  const outputText = useMemo(() => {
    if (!result) return input || "Run analysis to see results.";
    return buildOutputText(result.originalText, combinedEntities, disabledEntityIds);
  }, [result, input, combinedEntities, disabledEntityIds]);

  // Handle selection popup
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const previewContainer = previewEditorRef.current;
      // Track selection in the active preview panel.
      if (!selection || selection.isCollapsed || !previewContainer) {
        setSelectionPopup(null);
        return;
      }

      const isAnchorInside = Boolean(selection.anchorNode && previewContainer.contains(selection.anchorNode));
      const isFocusInside = Boolean(selection.focusNode && previewContainer.contains(selection.focusNode));

      if (!isAnchorInside || !isFocusInside) {
        setSelectionPopup(null);
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const isTouchLayout =
          window.matchMedia("(max-width: 767px)").matches ||
          window.matchMedia("(pointer: coarse)").matches ||
          window.matchMedia("(hover: none)").matches;

        if (isTouchLayout) {
          setSelectionPopup({
            x: window.innerWidth / 2,
            y: 0,
            mobile: true,
          });
          return;
        }

        const minX = SELECTION_POPUP_MARGIN + SELECTION_POPUP_HALF_WIDTH;
        const maxX = window.innerWidth - SELECTION_POPUP_MARGIN - SELECTION_POPUP_HALF_WIDTH;
        const x = Math.min(
          Math.max(rect.left + rect.width / 2, minX),
          Math.max(minX, maxX),
        );

        setSelectionPopup({
          x,
          y: Math.max(SELECTION_POPUP_MARGIN, rect.top - DESKTOP_SELECTION_POPUP_OFFSET),
          mobile: false,
        });
      } catch {
        setSelectionPopup(null);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [editablePanelId]);

  // Sync scroll implementation
  useEffect(() => {
    const textEl = textEditorRef.current;
    const previewEl = previewEditorRef.current;
    if (!textEl || !previewEl) return;

    const releaseOwnerNextFrame = (owner: "text" | "preview") => {
      if (scrollSyncReleaseRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncReleaseRef.current);
      }
      scrollSyncReleaseRef.current = window.requestAnimationFrame(() => {
        if (scrollSyncOwnerRef.current === owner) {
          scrollSyncOwnerRef.current = null;
        }
        scrollSyncReleaseRef.current = null;
      });
    };

    const handleInputScroll = () => {
      if (scrollSyncOwnerRef.current === "preview") {
        return;
      }
      scrollSyncOwnerRef.current = "text";
      previewEl.scrollTop = textEl.scrollTop;
      previewEl.scrollLeft = textEl.scrollLeft;
      releaseOwnerNextFrame("text");
    };

    const handleOutputScroll = () => {
      if (scrollSyncOwnerRef.current === "text") {
        return;
      }
      scrollSyncOwnerRef.current = "preview";
      textEl.scrollTop = previewEl.scrollTop;
      textEl.scrollLeft = previewEl.scrollLeft;
      releaseOwnerNextFrame("preview");
    };

    textEl.addEventListener("scroll", handleInputScroll);
    previewEl.addEventListener("scroll", handleOutputScroll);

    return () => {
      textEl.removeEventListener("scroll", handleInputScroll);
      previewEl.removeEventListener("scroll", handleOutputScroll);
      if (scrollSyncReleaseRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncReleaseRef.current);
        scrollSyncReleaseRef.current = null;
      }
      scrollSyncOwnerRef.current = null;
    };
  }, [editablePanelId]);

  function runAnalyze(text: string): AnalyzeResult {
    return analyzeText({
      text,
      replaceMode,
      enabledRegions,
    });
  }

  function focusEntityInEditors(entityId: string) {
    const targetEntity = combinedEntities.find((entity) => getEntityId(entity) === entityId);
    if (!targetEntity) return;

    if (isMobile) {
      setIsMobileSidebarOpen(false);
      setActivePanel(previewPanelId);
    }

    const previewEl = previewEditorRef.current;
    const textEl = textEditorRef.current;

    if (previewEl) {
      const mark = previewEl.querySelector<HTMLElement>(`[data-entity-id="${entityId}"]`);
      if (mark) {
        const outputRect = previewEl.getBoundingClientRect();
        const markRect = mark.getBoundingClientRect();
        const targetTop =
          previewEl.scrollTop +
          (markRect.top - outputRect.top) -
          previewEl.clientHeight / 2 +
          markRect.height / 2;
        const clampedTop = Math.max(0, targetTop);
        scrollSyncOwnerRef.current = "preview";
        previewEl.scrollTop = clampedTop;
        if (textEl) {
          textEl.scrollTop = clampedTop;
        }
        if (scrollSyncReleaseRef.current !== null) {
          window.cancelAnimationFrame(scrollSyncReleaseRef.current);
        }
        scrollSyncReleaseRef.current = window.requestAnimationFrame(() => {
          scrollSyncOwnerRef.current = null;
          scrollSyncReleaseRef.current = null;
        });
      }
    }

    setJumpFlashEntityId(entityId);
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = window.setTimeout(() => {
      setJumpFlashEntityId((current) => (current === entityId ? null : current));
      flashTimeoutRef.current = null;
    }, ENTITY_JUMP_FLASH_MS);
  }

  function handleAnalyze() {
    setErrorMessage("");
    setStatusMessage("");

    if (!input.trim()) {
      setErrorMessage("Input is empty.");
      return;
    }

    if (enabledRegions.length === 0) {
      setErrorMessage("Select at least one region.");
      return;
    }

    startTransition(() => {
      const analyzed = runAnalyze(input);
      setDisabledEntityIds(new Set());
      setResult(analyzed);
      setResultMode("analysis");
      setImportDirection(null);
      if (isMobile) setActivePanel(previewPanelId);
    });
  }

  function handleAddSelectionForReplacement() {
    if (!previewEditorRef.current) return;
    const offsets = getSelectionOffsets(previewEditorRef.current);
    
    if (!offsets) return;

    const start = offsets.start;
    let end = offsets.end;
    
    // Trim trailing whitespace and newlines (fix double-click issue)
    while (end > start && (input[end-1] === '\n' || input[end-1] === '\r' || input[end-1] === ' ')) {
      end--;
    }

    if (start === end) return;

    const source = input.slice(start, end);
    if (!source.trim()) return;

    setErrorMessage("");
    setResult((prev) => prev || { originalText: input, anonymizedText: input, entities: [], mappings: [] });
    setResultMode("analysis");
    setImportDirection(null);
    setUserRules((prev) => dedupeUserRules([...prev, createUserRule(source, "USER")]));
    
    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
  }

  function handleChangeManualEntityType(entityId: string, entityType: EntityType) {
    const target = combinedEntities.find((entity) => getEntityId(entity) === entityId);
    if (!target || target.ruleId !== "manual.selection") return;

    setUserRules((prev) => {
      const withoutOld = prev.filter((rule) => !(rule.source === target.source && rule.type === target.type));
      return dedupeUserRules([...withoutOld, createUserRule(target.source, entityType)]);
    });
  }

  function handleCopyOutput() {
    if (!result) return;
    navigator.clipboard.writeText(outputText).then(
      () => setStatusMessage("Copied to clipboard."),
      () => setErrorMessage("Failed to copy."),
    );
  }

  function handleCopyText() {
    navigator.clipboard.writeText(input).then(
      () => setStatusMessage("Text copied."),
      () => setErrorMessage("Failed to copy."),
    );
  }

  async function handlePasteIntoText() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        setResult(null);
        setResultMode("analysis");
        setImportDirection(null);
        setDisabledEntityIds(new Set());
      }
    } catch {
      setErrorMessage("Clipboard access denied.");
    }
  }

  function handleSwapDirection() {
    const nextDirection: ViewDirection = viewDirection === "forward" ? "reverse" : "forward";
    setViewDirection(nextDirection);
    setSelectionPopup(null);
    if (isMobile) {
      setActivePanel(nextDirection === "forward" ? "input" : "output");
    }
  }

  function handleExportRules() {
    const shouldReversePairs = resultMode === "imported" && importDirection === "reverse";
    const rules = collectExportRules(combinedEntities, shouldReversePairs);
    const json = rulesToJson(rules);
    downloadTextFile("lastik-rules.json", json);
    setStatusMessage(`Exported ${rules.length} ${rules.length === 1 ? "rule" : "rules"}.`);
  }

  async function handleImportRules(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const text = await file.text();
      const parsedRules = parseRulesJson(text);

      const normalizedRules: ExportableRuleEntry[] = parsedRules.map((rule) => {
        if (!isEntityType(rule.entityType)) {
          throw new Error("invalid-rules-file");
        }
        return {
          entityType: rule.entityType,
          origin: rule.origin,
          source: rule.source,
          replacement: rule.replacement,
          region: rule.region,
          ruleId: rule.ruleId,
        };
      });

      const importedUserRules = dedupeUserRules(
        normalizedRules
          .filter((rule) => rule.origin === "user")
          .map((rule) => createUserRule(rule.source, rule.entityType)),
      );

      if (importedUserRules.length > 0) {
        setUserRules((prev) => dedupeUserRules([...prev, ...importedUserRules]));
      }

      const { result: importedResult, appliedCount, skippedCount } = applyImportedRules(
        input,
        normalizedRules,
        viewDirection,
      );

      setDisabledEntityIds(new Set());
      setResult(importedResult);
      setResultMode("imported");
      setImportDirection(viewDirection);
      if (isMobile) {
        setActivePanel(previewPanelId);
      }
      const directionLabel = viewDirection === "forward" ? "Forward" : "Reverse";
      setStatusMessage(
        `Imported ${normalizedRules.length} rules. Direction: ${directionLabel}. Applied ${appliedCount}. Skipped ${skippedCount}.`,
      );
    } catch {
      setErrorMessage("Invalid rules file format.");
    }
  }

  function handleClear() {
    setInput("");
    setResult(null);
    setResultMode("analysis");
    setImportDirection(null);
    setUserRules([]);
    setDisabledEntityIds(new Set());
    setErrorMessage("");
    setStatusMessage("Workspace cleared.");
  }

  function toggleEntity(entityId: string) {
    const targetEntity = combinedEntities.find((e) => getEntityId(e) === entityId);
    if (!targetEntity) return;

    const targetSource = targetEntity.source;
    const isManual = targetEntity.ruleId === "manual.selection";

    if (isManual) {
      setUserRules((prev) => prev.filter((rule) => !(rule.source === targetSource && rule.type === targetEntity.type)));
    } else {
      setDisabledEntityIds((prev) => {
        const next = new Set(prev);
        const sameSourceIds = combinedEntities
          .filter((e) => e.source === targetSource && e.ruleId !== "manual.selection")
          .map((e) => getEntityId(e));

        const isCurrentlyDisabled = next.has(entityId);

        sameSourceIds.forEach((id) => {
          if (isCurrentlyDisabled) {
            next.delete(id);
          } else {
            next.add(id);
          }
        });
        return next;
      });
    }
  }

  function toggleEntityLocal(entityId: string) {
    setDisabledEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }

  const previewContent = result
    ? renderInteractivePreview(
        result.originalText,
        combinedEntities,
        disabledEntityIds,
        toggleEntity,
        toggleEntityLocal,
        jumpFlashEntityId,
      )
    : <span className="text-(--text-tertiary)">Run analysis or import rules to see interactive preview.</span>;
  const rulesActions = (
    <>
      <button
        onClick={handleExportRules}
        className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
        title="Download all rules as JSON"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
      </button>
      <button
        onClick={() => importFileRef.current?.click()}
        className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
        title="Load rules from JSON file"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
      </button>
    </>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground font-sans">

      <div className="flex flex-1 overflow-hidden relative">
        {/* Floating Selection Popup */}
        {selectionPopup && (
          <div 
            className={`fixed z-[100] bg-zinc-900 text-white rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden ${
              selectionPopup.mobile ? "left-1/2 -translate-x-1/2" : "-translate-x-1/2"
            }`}
            style={
              selectionPopup.mobile
                ? { bottom: "max(1rem, calc(env(safe-area-inset-bottom) + 1rem))" }
                : { left: selectionPopup.x, top: selectionPopup.y }
            }
          >
            <button 
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                handleAddSelectionForReplacement();
              }}
              className="px-5 py-2.5 text-[13px] font-semibold hover:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              Replace Selection
            </button>
          </div>
        )}

        {/* Sidebar */}
        <aside
          className={`hidden md:flex flex-none flex-col border-r border-(--border) bg-white transition-all duration-300 relative ${
            isSidebarCollapsed ? "w-14" : "w-85"
          }`}
        >
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-(--border) bg-white text-(--text-tertiary) shadow-sm hover:text-(--text-secondary) hover:scale-105 transition-all"
            title={isSidebarCollapsed ? "Expand Detections" : "Collapse Detections"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isSidebarCollapsed ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
            </svg>
          </button>

          {!isSidebarCollapsed ? (
            <div className="flex flex-1 flex-col overflow-hidden animate-in fade-in duration-500">
              <div className="flex-none flex items-center border-b border-(--border)/40 bg-white px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8 drop-shadow-sm flex-none">
                    <g transform="rotate(-15 50 50)">
                      <path d="M20 40 L60 40 L60 70 L20 70 Z" fill="#E86A5E"/>
                      <path d="M60 40 L85 40 L85 70 L60 70 Z" fill="#4A7BB5"/>
                      <rect x="58" y="40" width="4" height="30" fill="white" opacity="0.3"/>
                    </g>
                  </svg>
                  <div className="flex flex-col leading-none gap-0.5">
                    <h1 className="text-[15px] font-(family-name:--font-logo) font-semibold tracking-normal text-foreground">LASTIK</h1>
                    <span className="text-[9px] font-bold text-(--text-tertiary) uppercase tracking-[0.2em]">De-identification</span>
                  </div>
                </div>
              </div>
              <div className="flex-none flex items-center justify-between gap-2 px-5 py-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-widest text-(--text-tertiary)">Detections</h2>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold bg-(--accent-muted) text-(--accent) px-2 py-0.5 rounded-full">
                    {combinedEntities.length}
                  </span>
                  {rulesActions}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <ReviewSidebar
                  entities={combinedEntities}
                  disabledEntityIds={disabledEntityIds}
                  onToggleEntity={toggleEntity}
                  onToggleEntityLocal={toggleEntityLocal}
                  onSelectEntity={focusEntityInEditors}
                  filterType={filterType}
                  onFilterTypeChange={setFilterType}
                  filterRegion={filterRegion}
                  onFilterRegionChange={setFilterRegion}
                  onChangeEntityType={handleChangeManualEntityType}
                />
              </div>
              <div className="flex-none p-5 border-t border-(--border)/40 bg-(--surface-muted)/50">
                <div className="bg-rose-50/50 rounded-xl p-3 border border-rose-100/50">
                  <p className="text-xs text-center text-(--error-fg) font-semibold leading-relaxed">
                    Local Processing Only<br/>
                    <span className="font-medium opacity-70">Data never leaves your device</span>
                  </p>
                </div>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <a
                    href="https://github.com/chassaji/lastik"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-(--text-tertiary) hover:text-(--text-secondary) transition-colors"
                    aria-label="View on GitHub"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                  </a>
                  <p className="text-xs font-semibold text-(--text-tertiary)">
                    © 2026 Anna Airapetian
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center pt-4 gap-4 text-(--text-tertiary)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-6 h-6">
                <g transform="rotate(-15 50 50)">
                  <path d="M20 40 L60 40 L60 70 L20 70 Z" fill="#E86A5E"/>
                  <path d="M60 40 L85 40 L85 70 L60 70 Z" fill="#4A7BB5"/>
                </g>
              </svg>
              <span className="text-xs font-semibold bg-(--accent-muted) text-(--accent) w-7 h-7 flex items-center justify-center rounded-full shadow-sm animate-in zoom-in duration-300">
                {combinedEntities.length}
              </span>
              <div className="flex flex-col items-center gap-1">
                {rulesActions}
              </div>
              <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-semibold uppercase tracking-[0.3em]">Detections</span>
            </div>
          )}
        </aside>

        {/* Mobile Sidebar Drawer */}
        {isMobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="relative w-[85vw] max-w-sm bg-white flex flex-col shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-(--border)/40 bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-7 h-7 flex-none">
                    <g transform="rotate(-15 50 50)">
                      <path d="M20 40 L60 40 L60 70 L20 70 Z" fill="#E86A5E"/>
                      <path d="M60 40 L85 40 L85 70 L60 70 Z" fill="#4A7BB5"/>
                      <rect x="58" y="40" width="4" height="30" fill="white" opacity="0.3"/>
                    </g>
                  </svg>
                  <div className="flex flex-col leading-none gap-0.5">
                    <h1 className="text-sm font-(family-name:--font-logo) font-semibold tracking-normal text-foreground">LASTIK</h1>
                    <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-[0.2em]">De-identification</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-2 rounded-lg text-(--text-tertiary) hover:text-foreground transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div className="flex-none p-4 border-b border-(--border)/40 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold uppercase tracking-widest text-(--text-tertiary)">Detections</h2>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold bg-(--accent-muted) text-(--accent) px-2 py-0.5 rounded-full">
                    {combinedEntities.length}
                  </span>
                  {rulesActions}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <ReviewSidebar
                  entities={combinedEntities}
                  disabledEntityIds={disabledEntityIds}
                  onToggleEntity={toggleEntity}
                  onToggleEntityLocal={toggleEntityLocal}
                  onSelectEntity={focusEntityInEditors}
                  filterType={filterType}
                  onFilterTypeChange={setFilterType}
                  filterRegion={filterRegion}
                  onFilterRegionChange={setFilterRegion}
                  onChangeEntityType={handleChangeManualEntityType}
                />
              </div>
              <div className="flex-none p-3 border-t border-(--border)/40 bg-(--surface-muted)/50">
                <div className="bg-rose-50/50 rounded-xl p-2.5 border border-rose-100/50 mb-3">
                  <p className="text-[11px] text-center text-(--error-fg) font-semibold leading-relaxed">
                    Local Processing Only<br/>
                    <span className="font-medium opacity-70">Data never leaves your device</span>
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href="https://github.com/chassaji/lastik"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--text-tertiary) hover:text-(--text-secondary) transition-colors"
                    aria-label="View on GitHub"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                  </a>
                  <span className="text-[11px] font-semibold text-(--text-tertiary)">© 2026 Anna Airapetian</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Mobile Tab Bar */}
          <div className="md:hidden flex border-b border-(--border)/40 bg-white flex-none items-stretch h-14">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="flex-none flex items-center justify-center px-3.5 border-r border-(--border)/40 relative"
              title="Detections"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-5 h-5">
                <g transform="rotate(-15 50 50)">
                  <path d="M20 40 L60 40 L60 70 L20 70 Z" fill="#E86A5E"/>
                  <path d="M60 40 L85 40 L85 70 L60 70 Z" fill="#4A7BB5"/>
                </g>
              </svg>
              {combinedEntities.length > 0 && (
                <span className="absolute top-1.5 right-1 text-[9px] font-bold bg-(--accent) text-white min-w-3.5 h-3.5 flex items-center justify-center rounded-full">
                  {combinedEntities.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActivePanel("input")}
              className={`flex-1 flex items-center justify-center text-xs font-semibold uppercase tracking-wider transition-colors ${
                activePanel === "input"
                  ? "text-(--accent) border-b-2 border-(--accent)"
                  : "text-(--text-tertiary)"
              }`}
            >
              Editor
            </button>
            <button
              onClick={handleSwapDirection}
              className="flex-none flex items-center justify-center px-3 border-x border-(--border)/40 text-(--text-tertiary) hover:text-(--accent) transition-colors"
              title="Swap panel direction"
              aria-label="Swap panel direction"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
              </svg>
            </button>
            <button
              onClick={() => setActivePanel("output")}
              className={`flex-1 flex items-center justify-center text-xs font-semibold uppercase tracking-wider transition-colors ${
                activePanel === "output"
                  ? "text-(--accent) border-b-2 border-(--accent)"
                  : "text-(--text-tertiary)"
              }`}
            >
              Review & Masking
            </button>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0 h-full">
            <div className="hidden md:flex absolute left-1/2 top-3 -translate-x-1/2 z-10">
              <button
                type="button"
                onClick={handleSwapDirection}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-(--border) bg-white/95 text-(--text-tertiary) shadow-sm hover:text-(--accent) hover:border-(--accent)/40 transition-colors"
                title="Swap panel direction"
                aria-label="Swap panel direction"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
                </svg>
              </button>
            </div>

            {/* Input Panel */}
            <div className={`flex-col h-full overflow-hidden ${isForwardDirection ? "md:order-1 md:border-r md:border-(--border)" : "md:order-2"} ${activePanel !== "input" ? "hidden md:flex" : "flex"}`}>
              <div className="flex-none flex items-center justify-between border-b border-(--border)/40 bg-white px-5 py-3">
                <div className="flex md:hidden items-center gap-1">
                  {rulesActions}
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-tertiary)">Editor</h2>
                  <span className="text-[11px] font-semibold text-(--text-tertiary) bg-(--surface-muted) px-2 py-0.5 rounded-md">
                    {editablePanelId === "input" ? "EDITABLE" : "INTERACTIVE"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isForwardDirection && (
                    <>
                      <button
                        onClick={handleAnalyze}
                        disabled={isPending}
                        className="rounded-lg border border-(--accent) px-4 py-1.5 text-[13px] font-semibold text-(--accent) transition-all hover:bg-(--accent) hover:text-white active:scale-[0.98] disabled:opacity-50"
                      >
                        {isPending ? "Analyzing..." : "Analyze"}
                      </button>
                      <div className="w-px h-4 bg-(--border)" />
                    </>
                  )}
                  <div className="flex items-center gap-1">
                  {editablePanelId === "input" ? (
                    <>
                      <button
                        onClick={handleCopyText}
                        className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                        title="Copy text"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                      <button
                        onClick={handlePasteIntoText}
                        className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                        title="Paste"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
                      </button>
                      <button
                        onClick={handleClear}
                        className="p-2 rounded-lg text-(--text-tertiary) hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all"
                        title="Clear"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCopyOutput}
                      className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                      title={viewDirection === "forward" ? "Copy masked result" : "Copy restored result"}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    </button>
                  )}
                  </div>
                </div>
              </div>
              {editablePanelId === "input" ? (
                <textarea
                  ref={textEditorRef}
                  suppressHydrationWarning
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setResult(null);
                    setResultMode("analysis");
                    setImportDirection(null);
                    setDisabledEntityIds(new Set());
                  }}
                  className="flex-1 resize-none overflow-auto bg-white p-8 font-mono text-sm leading-7 focus:outline-none selection:bg-(--accent)/20 custom-scrollbar border-none"
                  placeholder="Enter text here..."
                />
              ) : (
                <div
                  ref={previewEditorRef}
                  className="flex-1 overflow-auto p-8 font-mono text-sm leading-7 whitespace-pre-wrap select-text selection:bg-(--accent)/20 custom-scrollbar bg-(--surface-muted)/20"
                >
                  {previewContent}
                </div>
              )}
            </div>

            {/* Output Panel */}
            <div className={`flex-col bg-(--surface-muted)/20 h-full overflow-hidden ${isForwardDirection ? "md:order-2" : "md:order-1 md:border-r md:border-(--border)"} ${activePanel !== "output" ? "hidden md:flex" : "flex"}`}>
              <div className="flex-none flex items-center justify-between border-b border-(--border)/40 bg-white/50 px-5 py-3">
                <div className="flex md:hidden items-center gap-1">
                  {rulesActions}
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-tertiary)">Review & Masking</h2>
                  <span className="text-[11px] font-semibold text-(--text-tertiary) bg-(--surface-muted) px-2 py-0.5 rounded-md">
                    {editablePanelId === "output" ? "EDITABLE" : "INTERACTIVE"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {editablePanelId === "output" ? (
                    <>
                      <button
                        onClick={handleCopyText}
                        className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                        title="Copy text"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                      <button
                        onClick={handlePasteIntoText}
                        className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                        title="Paste text"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
                      </button>
                      <button
                        onClick={handleClear}
                        className="p-2 rounded-lg text-(--text-tertiary) hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all"
                        title="Clear"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCopyOutput}
                      className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                      title={viewDirection === "forward" ? "Copy masked result" : "Copy restored result"}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    </button>
                  )}
                </div>
              </div>
              {editablePanelId === "output" ? (
                <textarea
                  ref={textEditorRef}
                  suppressHydrationWarning
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setResult(null);
                    setResultMode("analysis");
                    setImportDirection(null);
                    setDisabledEntityIds(new Set());
                  }}
                  className="flex-1 resize-none overflow-auto bg-white p-8 font-mono text-sm leading-7 focus:outline-none selection:bg-(--accent)/20 custom-scrollbar border-none"
                  placeholder="Enter text here..."
                />
              ) : (
                <div
                  ref={previewEditorRef}
                  className="flex-1 overflow-auto p-8 font-mono text-sm leading-7 whitespace-pre-wrap select-text selection:bg-(--accent)/20 custom-scrollbar"
                >
                  {previewContent}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportRules}
      />

      {statusMessage && !errorMessage && (
        <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 rounded-2xl border border-(--accent)/20 bg-(--accent-muted) px-6 py-3 text-sm font-semibold text-(--accent) shadow-2xl animate-in fade-in slide-in-from-bottom-4 text-center">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 rounded-2xl border border-(--error-border) bg-(--error-bg) px-6 py-3 text-sm font-semibold text-(--error-fg) shadow-2xl animate-in fade-in slide-in-from-bottom-4 text-center">
          {errorMessage}
          <button onClick={() => setErrorMessage("")} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
