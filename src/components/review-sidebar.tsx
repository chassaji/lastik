import type { DetectorMatch, EntityType } from "@/lib/anonymizer/types";

interface ReviewSidebarProps {
  entities: DetectorMatch[];
  disabledEntityIds: Set<string>;
  onToggleEntity: (entityId: string) => void;
  onToggleEntityLocal: (entityId: string) => void;
  onSelectEntity: (entityId: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterRegion: string;
  onFilterRegionChange: (value: string) => void;
  onChangeEntityType: (entityId: string, entityType: EntityType) => void;
}

export function ReviewSidebar({
  entities,
  disabledEntityIds,
  onToggleEntity,
  onToggleEntityLocal,
  onSelectEntity,
  filterType,
  onFilterTypeChange,
  filterRegion,
  onFilterRegionChange,
  onChangeEntityType,
}: ReviewSidebarProps) {
  const editableTypes: EntityType[] = [
    "USER",
    "PERSON",
    "ORG",
    "DOC_ID",
    "EMAIL",
    "PHONE",
    "CARD",
    "ACCOUNT",
    "IBAN",
    "SWIFT_BIC",
    "DATE",
  ];
  const types = Array.from(new Set(entities.map((e) => e.type)));
  const regions = Array.from(new Set(entities.map((e) => e.region).filter(Boolean))) as string[];

  const filtered = entities.filter((e) => {
    if (filterType !== "ALL" && e.type !== filterType) return false;
    if (filterRegion !== "ALL" && (e.region ?? "") !== filterRegion) return false;
    return true;
  });

  // Group entities by type and source to avoid duplicates and allow global actions
  const orderedGroups: { key: string; items: DetectorMatch[] }[] = [];
  filtered.forEach((entity) => {
    const key = `${entity.type}|${entity.source}`;
    let group = orderedGroups.find((g) => g.key === key);
    if (!group) {
      group = { key, items: [] };
      orderedGroups.push(group);
    }
    group.items.push(entity);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <select
          className="w-full rounded-xl border border-(--border) bg-(--surface-muted) px-2.5 py-2 text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-(--accent)"
          value={filterType}
          onChange={(event) => onFilterTypeChange(event.target.value)}
        >
          <option value="ALL">All Types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          className="w-full rounded-xl border border-(--border) bg-(--surface-muted) px-2.5 py-2 text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-(--accent)"
          value={filterRegion}
          onChange={(event) => onFilterRegionChange(event.target.value)}
        >
          <option value="ALL">All Regions</option>
          {regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3.5">
        {orderedGroups.length === 0 && (
          <div className="rounded-xl border border-dashed border-(--border) p-4 text-center">
            <p className="text-[13px] font-medium text-(--text-tertiary)">No entities found</p>
          </div>
        )}

        {orderedGroups.map((group) => {
          const first = group.items[0];
          const isManual = first.ruleId === "manual.selection";
          const allDisabled = group.items.every((item) =>
            disabledEntityIds.has(item.entityId ?? `${item.type}_${item.start}_${item.end}`),
          );

          return (
            <div
              key={group.key}
              className={`rounded-xl border transition-all ${
                allDisabled ? "border-(--border)/50 bg-(--surface-muted)/50" : "border-(--border) bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              }`}
            >
              {/* Group Header: Type | Region | Global Toggle */}
              <div className="flex items-center justify-between border-b border-(--border)/40 p-2.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isManual && !allDisabled ? (
                    <select
                      className="rounded-lg border border-(--border) bg-white px-1.5 py-1 text-xs font-medium focus:outline-none"
                      value={first.type}
                      onChange={(event) => {
                        const newType = (event.target as HTMLSelectElement).value as EntityType;
                        group.items.forEach(item => onChangeEntityType(item.entityId!, newType));
                      }}
                    >
                      {editableTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`truncate text-xs font-semibold uppercase tracking-wider ${allDisabled ? "text-(--text-tertiary)" : "text-(--accent)"}`}>
                      {first.type}
                    </span>
                  )}
                  <span className="text-xs font-medium text-(--text-tertiary)">| {first.region ?? "Global"}</span>
                  <span className="text-[11px] font-medium text-(--text-secondary) bg-(--surface-muted) px-1.5 rounded-full ml-1">{group.items.length}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleEntity(first.entityId!)}
                  className={`flex h-6 w-6 items-center justify-center rounded-lg transition-all ${
                    allDisabled
                      ? "bg-(--accent-muted) text-(--accent) hover:bg-(--accent-muted)"
                      : "bg-rose-50 text-rose-500 hover:bg-rose-100"
                  }`}
                  title={allDisabled ? "Enable all" : isManual ? "Remove all" : "Exclude all identical"}
                >
                  {isManual ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  ) : allDisabled ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                  )}
                </button>
              </div>

              {/* Group Body: Individual Instances */}
              <div className="p-2 space-y-1">
                {group.items.map((entity) => {
                  const id = entity.entityId ?? `${entity.type}_${entity.start}_${entity.end}`;
                  const isDisabled = disabledEntityIds.has(id);
                  return (
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectEntity(id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectEntity(id);
                        }
                      }}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                        isDisabled ? "bg-transparent opacity-50" : "hover:bg-(--surface-muted)"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="truncate font-mono text-xs text-(--text-secondary) flex-1">
                          {entity.source}
                        </span>
                        {!isDisabled && (
                          <>
                            <span className="text-(--text-tertiary) text-xs">→</span>
                            <span className="truncate font-mono text-xs font-semibold text-(--accent) flex-1">
                              {entity.replacement}
                            </span>
                          </>
                        )}
                      </div>
                      {group.items.length > 1 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleEntityLocal(id);
                          }}
                          className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                            isDisabled
                              ? "text-(--accent) hover:bg-(--accent-muted) hover:text-(--accent)"
                              : "text-(--text-tertiary) hover:bg-rose-50 hover:text-rose-500"
                          }`}
                          title={isDisabled ? "Enable this specific instance" : "Disable this specific instance"}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            {isDisabled ? (
                              <>
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                              </>
                            ) : (
                              <path d="M5 12h14" />
                            )}
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
