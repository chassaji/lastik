"use client";

import { ReviewSidebar } from "@/components/review-sidebar";
import { defaultInput } from "@/lib/anonymizer/default-text";
import { analyzeText } from "@/lib/anonymizer/engine";
import { downloadTextFile, mappingToCsv, mappingToJson } from "@/lib/anonymizer/export";
import type {
  AnalyzeResult,
  DetectorMatch,
  EntityType,
  MappingRecord,
  RegionCode,
  ReplaceMode,
} from "@/lib/anonymizer/types";
import { useMemo, useRef, useState, useTransition, useEffect } from "react";


function getEntityId(entity: AnalyzeResult["entities"][number]): string {
  return entity.entityId ?? `${entity.type}_${entity.start}_${entity.end}`;
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

function buildMappings(entities: DetectorMatch[], disabled: Set<string>): MappingRecord[] {
  return entities
    .filter((entity) => !disabled.has(getEntityId(entity)))
    .map((entity) => ({
      entityId: getEntityId(entity),
      type: entity.type,
      region: entity.region,
      source: entity.source,
      replacement: entity.replacement ?? entity.source,
      ruleId: entity.ruleId,
      confidence: entity.confidence,
      position: {
        start: entity.start,
        end: entity.end,
      },
    }));
}

function renderInteractivePreview(
  text: string,
  entities: AnalyzeResult["entities"],
  disabled: Set<string>,
  onToggle: (entityId: string) => void,
  onToggleLocal: (entityId: string) => void,
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

    parts.push(
      <mark
        key={`entity-${id}-${index}`}
        data-original-start={entity.start}
        role="button"
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle(id);
          }
        }}
        className={`${isDisabled ? "bg-(--highlight-disabled) text-zinc-400" : "bg-(--highlight-active) text-foreground"} cursor-pointer rounded px-1 transition-colors relative group`}
        title={isDisabled ? "Masking disabled (click to enable)" : "Masking enabled (click to disable)"}
      >
        {displayedContent}
        {isManual && count > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocal(id);
            }}
            className={`absolute -top-2 -right-2 flex h-3.5 w-3.5 items-center justify-center rounded-[2px] shadow-md transition-all z-10 ${
              isDisabled ? "bg-(--accent) text-white" : "bg-white text-rose-300 hover:text-rose-400"
            }`}
            title={isDisabled ? "Enable this specific mask" : "Disable this specific mask"}
          >
            <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              {isDisabled ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14" />}
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


export default function Home() {
  const inputEditorRef = useRef<HTMLDivElement | null>(null);
  const outputEditorRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState(defaultInput);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [manualEntities, setManualEntities] = useState<DetectorMatch[]>([]);
  const replaceMode: ReplaceMode = "tag";
  const enabledRegions: RegionCode[] = ["RU", "AM", "EU"];
  const [filterType, setFilterType] = useState("ALL");
  const [filterRegion, setFilterRegion] = useState("ALL");
  const [disabledEntityIds, setDisabledEntityIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number } | null>(null);
  const [activePanel, setActivePanel] = useState<"input" | "output">("input");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const combinedEntities = useMemo(() => {
    const base = result?.entities ?? [];
    const merged = mergeEntities(base, manualEntities);
    return withReplacements(merged, replaceMode);
  }, [result, manualEntities, replaceMode]);

  const outputText = useMemo(() => {
    if (!result) return input || "Run analysis to see results.";
    return buildOutputText(result.originalText, combinedEntities, disabledEntityIds);
  }, [result, input, combinedEntities, disabledEntityIds]);

  // Handle selection popup
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      // Track selection in the Output panel (outputEditorRef)
      if (!selection || selection.isCollapsed || !outputEditorRef.current?.contains(selection.anchorNode)) {
        setSelectionPopup(null);
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setSelectionPopup({
          x: rect.left + rect.width / 2,
          y: rect.top - 40,
        });
      } catch (err) {
        setSelectionPopup(null);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // Sync scroll implementation
  useEffect(() => {
    const inputEl = inputEditorRef.current;
    const outputEl = outputEditorRef.current;
    if (!inputEl || !outputEl) return;

    let isSyncingInput = false;
    let isSyncingOutput = false;

    const handleInputScroll = () => {
      if (isSyncingInput) {
        isSyncingInput = false;
        return;
      }
      isSyncingOutput = true;
      outputEl.scrollTop = inputEl.scrollTop;
      outputEl.scrollLeft = inputEl.scrollLeft;
    };

    const handleOutputScroll = () => {
      if (isSyncingOutput) {
        isSyncingOutput = false;
        return;
      }
      isSyncingInput = true;
      inputEl.scrollTop = outputEl.scrollTop;
      inputEl.scrollLeft = outputEl.scrollLeft;
    };

    inputEl.addEventListener("scroll", handleInputScroll);
    outputEl.addEventListener("scroll", handleOutputScroll);

    return () => {
      inputEl.removeEventListener("scroll", handleInputScroll);
      outputEl.removeEventListener("scroll", handleOutputScroll);
    };
  }, []);

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
      const analyzed = analyzeText({
        text: input,
        replaceMode,
        enabledRegions,
      });
      setDisabledEntityIds(new Set());
      setManualEntities([]);
      setResult(analyzed);
      if (isMobile) setActivePanel("output");
    });
  }

  function handleInputEdit(event: React.FormEvent<HTMLDivElement>) {
    const text = event.currentTarget.innerText;
    setInput(text);
    setResult(null);
    setManualEntities([]);
    setDisabledEntityIds(new Set());
  }

  function handleAddSelectionForReplacement() {
    if (!outputEditorRef.current) return;
    const offsets = getSelectionOffsets(outputEditorRef.current);
    
    if (!offsets) return;

    let { start, end } = offsets;
    
    // Trim trailing whitespace and newlines (fix double-click issue)
    while (end > start && (input[end-1] === '\n' || input[end-1] === '\r' || input[end-1] === ' ')) {
      end--;
    }

    if (start === end) return;

    const source = input.slice(start, end);
    if (!source.trim()) return;

    setErrorMessage("");
    setResult((prev) => prev || { originalText: input, anonymizedText: input, entities: [], mappings: [] });

    setManualEntities((prev) => {
      const newEntities: DetectorMatch[] = [];
      let cursor = 0;
      
      while (true) {
        const idx = input.indexOf(source, cursor);
        if (idx === -1) break;
        
        const itemEnd = idx + source.length;
        const id = `MANUAL_${idx}_${itemEnd}`;
        
        if (!prev.some((item) => getEntityId(item) === id)) {
          newEntities.push({
            entityId: id,
            type: "USER",
            start: idx,
            end: itemEnd,
            source,
            ruleId: "manual.selection",
            confidence: 1,
            confidenceBasis: "user-selection",
            detectorSource: "universal",
            priority: 1000,
          });
        }
        
        cursor = itemEnd;
      }
      
      return [...prev, ...newEntities];
    });
    
    window.getSelection()?.removeAllRanges();
  }

  function handleChangeManualEntityType(entityId: string, entityType: EntityType) {
    setManualEntities((prev) =>
      prev.map((entity) => (getEntityId(entity) !== entityId ? entity : { ...entity, type: entityType, replacement: undefined })),
    );
  }

  function handleCopyOutput() {
    if (!result) return;
    navigator.clipboard.writeText(outputText).then(
      () => setStatusMessage("Copied to clipboard."),
      () => setErrorMessage("Failed to copy."),
    );
  }

  function handleClear() {
    setInput("");
    setResult(null);
    setManualEntities([]);
    setDisabledEntityIds(new Set());
    setErrorMessage("");
    setStatusMessage("Workspace cleared.");
  }

  function removeSingleEntity(entityId: string) {
    setManualEntities((prev) => prev.filter((e) => getEntityId(e) !== entityId));
  }

  function toggleEntity(entityId: string) {
    const targetEntity = combinedEntities.find((e) => getEntityId(e) === entityId);
    if (!targetEntity) return;

    const targetSource = targetEntity.source;
    const isManual = targetEntity.ruleId === "manual.selection";

    if (isManual) {
      setManualEntities((prev) => prev.filter((e) => e.source !== targetSource));
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground font-sans">

      <div className="flex flex-1 overflow-hidden relative">
        {/* Floating Selection Popup */}
        {selectionPopup && (
          <div 
            className="fixed z-[100] -translate-x-1/2 bg-zinc-900 text-white rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
            style={{ left: selectionPopup.x, top: selectionPopup.y }}
          >
            <button 
              onMouseDown={(e) => {
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
              <div className="flex-none border-b border-(--border)/40">
                <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
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
                <div className="px-5 pb-3 flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold uppercase tracking-widest text-(--text-tertiary)">Detections</h2>
                  <span className="text-xs font-semibold bg-(--accent-muted) text-(--accent) px-2 py-0.5 rounded-full">
                    {combinedEntities.length}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <ReviewSidebar
                  entities={combinedEntities}
                  disabledEntityIds={disabledEntityIds}
                  onToggleEntity={toggleEntity}
                  onToggleEntityLocal={toggleEntityLocal}
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
              <div className="flex-none p-4 border-b border-(--border)/40 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-widest text-(--text-tertiary)">Detections</h2>
                <span className="text-xs font-semibold bg-(--accent-muted) text-(--accent) px-2 py-0.5 rounded-full">
                  {combinedEntities.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <ReviewSidebar
                  entities={combinedEntities}
                  disabledEntityIds={disabledEntityIds}
                  onToggleEntity={toggleEntity}
                  onToggleEntityLocal={toggleEntityLocal}
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
              onClick={() => setActivePanel("output")}
              className={`flex-1 flex items-center justify-center text-xs font-semibold uppercase tracking-wider transition-colors ${
                activePanel === "output"
                  ? "text-(--accent) border-b-2 border-(--accent)"
                  : "text-(--text-tertiary)"
              }`}
            >
              Review & Masking
              {result && combinedEntities.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-(--accent-muted) text-(--accent) px-1.5 py-0.5 rounded-full">
                  {combinedEntities.length}
                </span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0 h-full">
            {/* Input Panel */}
            <div className={`flex-col border-r border-(--border) h-full overflow-hidden ${activePanel !== "input" ? "hidden md:flex" : "flex"}`}>
              <div className="flex-none flex items-center justify-between border-b border-(--border)/40 bg-white px-5 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-tertiary)">Editor</h2>
                  <span className="text-[11px] font-semibold text-(--text-tertiary) bg-(--surface-muted) px-2 py-0.5 rounded-md">RAW</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAnalyze}
                    disabled={isPending}
                    className="rounded-lg border border-(--accent) px-4 py-1.5 text-[13px] font-semibold text-(--accent) transition-all hover:bg-(--accent) hover:text-white active:scale-[0.98] disabled:opacity-50"
                  >
                    {isPending ? "Analyzing..." : "Analyze"}
                  </button>
                  {statusMessage && !errorMessage && (
                    <span className="text-xs font-semibold text-(--accent) animate-in fade-in slide-in-from-right-2">
                      {statusMessage}
                    </span>
                  )}
                  <div className="w-px h-4 bg-(--border)" />
                  <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(input);
                      setStatusMessage("Original text copied.");
                    }}
                    className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                    title="Copy text"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          setInput(text);
                          setResult(null);
                          setManualEntities([]);
                          setDisabledEntityIds(new Set());
                        }
                      } catch (err) {
                        setErrorMessage("Clipboard access denied.");
                      }
                    }}
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
                  </div>
                </div>
              </div>
              <textarea
                suppressHydrationWarning
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setResult(null);
                  setManualEntities([]);
                  setDisabledEntityIds(new Set());
                }}
                className="flex-1 resize-none overflow-auto bg-white p-8 font-mono text-sm leading-7 focus:outline-none selection:bg-(--accent)/20 custom-scrollbar border-none"
                placeholder="Enter text here..."
              />
            </div>

            {/* Output Panel */}
            <div className={`flex-col bg-(--surface-muted)/20 h-full overflow-hidden ${activePanel !== "output" ? "hidden md:flex" : "flex"}`}>
              <div className="flex-none flex items-center justify-between border-b border-(--border)/40 bg-white/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-tertiary)">Review & Masking</h2>
                  <span className="text-[11px] font-semibold text-(--text-tertiary) bg-(--surface-muted) px-2 py-0.5 rounded-md">INTERACTIVE</span>
                </div>
                <button
                  onClick={handleCopyOutput}
                  className="p-2 rounded-lg text-(--text-tertiary) hover:text-(--accent) hover:bg-(--accent-muted) active:scale-90 transition-all"
                  title="Copy anonymized result"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
              </div>
              <div
                ref={outputEditorRef}
                className="flex-1 overflow-auto p-8 font-mono text-sm leading-7 whitespace-pre-wrap select-text selection:bg-(--accent)/20 custom-scrollbar"
              >
                {result 
                  ? renderInteractivePreview(result.originalText, combinedEntities, disabledEntityIds, toggleEntity, toggleEntityLocal)
                  : <span className="text-(--text-tertiary)">Run analysis to see interactive preview.</span>}
              </div>
            </div>
          </div>
        </main>
      </div>
      
      {errorMessage && (
        <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 rounded-2xl border border-(--error-border) bg-(--error-bg) px-6 py-3 text-sm font-semibold text-(--error-fg) shadow-2xl animate-in fade-in slide-in-from-bottom-4 text-center">
          {errorMessage}
          <button onClick={() => setErrorMessage("")} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
