import type { InternalWellboreMappings, MatchCandidate } from "#client";

export type DisplayedMatchQuality =
  | Exclude<MatchCandidate["confidence"], "low">
  | "exact";

export type WellboreMappingRow = {
  id: string;
  rmsName: string;
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
  rmsName: string;
  smdaName: string;
  smdaUuid: string;
  candidate: MatchCandidate;
  selected: boolean;
};

export type PendingImport = {
  mappings: InternalWellboreMappings;
  excludedRmsNames: string[];
};
