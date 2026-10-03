import type { ChangeInfo } from "#client/types.gen";

export type LegacyChangeDetails = {
  summary: string;
  before?: string;
  after?: string;
};

export function parseLegacyChange(change: string): LegacyChangeDetails {
  const oldMarker = ". Old value: ";
  const newMarker = " -> New value: ";
  const oldIndex = change.indexOf(oldMarker);
  if (oldIndex !== -1) {
    const valueStart = oldIndex + oldMarker.length;
    const newIndex = change.indexOf(newMarker, valueStart);
    if (newIndex !== -1) {
      return {
        summary: change.slice(0, oldIndex),
        before: change.slice(valueStart, newIndex),
        after: change.slice(newIndex + newMarker.length),
      };
    }
  }

  const addedMarker = ". New value: ";
  const addedIndex = change.indexOf(addedMarker);
  if (addedIndex !== -1) {
    return {
      summary: change.slice(0, addedIndex),
      after: change.slice(addedIndex + addedMarker.length),
    };
  }

  return { summary: change };
}

export function getChangelogDetails(
  entry: Pick<ChangeInfo, "change" | "structured_diff">,
) {
  if (entry.structured_diff !== undefined && entry.structured_diff !== null) {
    return { kind: "structured" as const, differences: entry.structured_diff };
  }

  return { kind: "legacy" as const, details: parseLegacyChange(entry.change) };
}
