import type { InternalWellboreMappings, MatchCandidate } from "#client";

export type DisplayedMatchQuality = "Exact" | "High" | "Medium";

export type WellboreMappingRow = {
  rmsWellboreName: string;
  planned: boolean;
  simulatorName: string;
  smdaName: string;
  smdaUuid: string;
  unmappable: boolean;
};

export type WellboreMappingFormValue = {
  simulatorName: string;
  smdaUuid: string;
};

export type AutomaticMatchProposal = {
  rmsWellboreName: string;
  smdaName: string;
  smdaUuid: string;
  candidate: MatchCandidate;
  selected: boolean;
};

export type PendingImport = {
  mappings: InternalWellboreMappings;
  excludedRmsWellboreNames: string[];
};
