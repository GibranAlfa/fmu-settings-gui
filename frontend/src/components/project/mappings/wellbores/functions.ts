import type {
  InternalWellboreIdentifierMapping,
  InternalWellboreMappings,
  MatchResult,
  RmsWell,
  SmdaWellHeader,
} from "#client";
import {
  emptyName,
  getOtherSourceUsingTargetUuid,
  type SourceTargetPair,
} from "#components/project/mapping/utils";
import { isSmdaWellboreMapping } from "#services/mappings";
import type {
  AutomaticMatchProposal,
  PendingImport,
  WellboreMappingFormValue,
  WellboreMappingRow,
} from "./types";

export const wellboreSmdaOptions = {
  empty: {
    value: "",
    label: emptyName,
  },
  unmappable: {
    value: "_unmappableWellbore",
    label: "Wellbore doesn't exist in SMDA",
  },
  divider: {
    value: "_divider",
    label: "",
  },
} as const;

export function isRmsMapping(
  mapping: InternalWellboreIdentifierMapping,
  targetSystem: "rms" | "simulator" | "smda",
) {
  return (
    mapping.source_system === "rms" && mapping.target_system === targetSystem
  );
}

function rmsSelfMapping(
  rmsWellboreName: string,
): InternalWellboreIdentifierMapping {
  return {
    mapping_type: "wellbore",
    source_system: "rms",
    target_system: "rms",
    relation_type: "primary",
    source_id: rmsWellboreName,
    target_id: rmsWellboreName,
  };
}

function mappingIdentityKey(mapping: InternalWellboreIdentifierMapping) {
  return [mapping.source_system, mapping.target_system, mapping.source_id].join(
    ":",
  );
}

function resolveSimulatorMapping(
  rmsWellboreName: string,
  simulatorName: string,
): InternalWellboreIdentifierMapping | undefined {
  const targetId = simulatorName.trim();
  if (!targetId) {
    return undefined;
  }

  return {
    mapping_type: "wellbore",
    source_system: "rms",
    target_system: "simulator",
    relation_type: "primary",
    source_id: rmsWellboreName,
    target_id: targetId,
  };
}

function resolveSmdaMapping(
  rmsWellboreName: string,
  smdaUuid: string,
  smdaHeaders: SmdaWellHeader[],
  existingMapping?: InternalWellboreIdentifierMapping,
): InternalWellboreIdentifierMapping | undefined {
  if (smdaUuid === wellboreSmdaOptions.unmappable.value) {
    return {
      mapping_type: "wellbore",
      source_system: "rms",
      target_system: "smda",
      relation_type: "unmappable",
      source_id: rmsWellboreName,
      target_id: null,
      target_uuid: null,
    };
  }

  if (!smdaUuid) {
    return undefined;
  }

  const smdaHeader = smdaHeaders.find(
    (header) => header.wellbore_uuid === smdaUuid,
  );
  if (smdaHeader) {
    return {
      mapping_type: "wellbore",
      source_system: "rms",
      target_system: "smda",
      relation_type: "primary",
      source_id: rmsWellboreName,
      target_id: smdaHeader.unique_wellbore_identifier,
      target_uuid: smdaHeader.wellbore_uuid,
    };
  }

  return existingMapping?.target_uuid === smdaUuid
    ? existingMapping
    : undefined;
}

export function createWellboreMappingRows(
  rmsWellbores: RmsWell[],
  mappings: InternalWellboreMappings,
): WellboreMappingRow[] {
  const simulatorMappingsByRms = new Map<
    string,
    InternalWellboreIdentifierMapping
  >();
  const smdaMappingsByRms = new Map<
    string,
    InternalWellboreIdentifierMapping
  >();

  mappings.forEach((mapping) => {
    if (
      isRmsMapping(mapping, "simulator") &&
      mapping.relation_type === "primary" &&
      !simulatorMappingsByRms.has(mapping.source_id)
    ) {
      simulatorMappingsByRms.set(mapping.source_id, mapping);
    } else if (
      isSmdaWellboreMapping(mapping) &&
      !smdaMappingsByRms.has(mapping.source_id)
    ) {
      smdaMappingsByRms.set(mapping.source_id, mapping);
    }
  });

  return rmsWellbores.map((wellbore) => {
    const rmsWellboreName = wellbore.name;
    const smdaMapping = wellbore.planned
      ? undefined
      : smdaMappingsByRms.get(rmsWellboreName);

    return {
      rmsWellboreName,
      planned: wellbore.planned ?? false,
      simulatorName:
        simulatorMappingsByRms.get(rmsWellboreName)?.target_id ?? "",
      smdaName: smdaMapping?.target_id ?? "",
      smdaUuid: smdaMapping?.target_uuid ?? "",
      unmappable: smdaMapping?.relation_type === "unmappable",
    };
  });
}

export function updateWellboreMapping(
  mappings: InternalWellboreMappings,
  row: WellboreMappingRow,
  value: WellboreMappingFormValue,
  smdaHeaders: SmdaWellHeader[],
): InternalWellboreMappings {
  const rmsWellboreName = row.rmsWellboreName;
  const existingSmdaMapping = mappings.find(
    (mapping) =>
      mapping.source_id === rmsWellboreName && isRmsMapping(mapping, "smda"),
  );
  const replacementMappings = [
    resolveSimulatorMapping(rmsWellboreName, value.simulatorName),
    resolveSmdaMapping(
      rmsWellboreName,
      value.smdaUuid,
      smdaHeaders,
      existingSmdaMapping,
    ),
  ].filter((mapping) => mapping !== undefined);

  const preservedMappings = mappings.filter((mapping) => {
    if (mapping.source_id !== rmsWellboreName) {
      return true;
    }
    if (isRmsMapping(mapping, "smda")) {
      return false;
    }
    if (
      isRmsMapping(mapping, "simulator") &&
      mapping.relation_type === "primary"
    ) {
      return false;
    }
    if (isRmsMapping(mapping, "rms") && mapping.relation_type === "primary") {
      return false;
    }

    return true;
  });
  const hasPreservedCrossSystemMapping = preservedMappings.some(
    (mapping) =>
      mapping.source_id === rmsWellboreName &&
      mapping.source_system !== mapping.target_system,
  );
  const hasCrossSystemMapping =
    hasPreservedCrossSystemMapping || replacementMappings.length > 0;

  return [
    ...preservedMappings,
    ...(hasCrossSystemMapping ? [rmsSelfMapping(rmsWellboreName)] : []),
    ...replacementMappings,
  ];
}

export function prepareImportedMappings(
  importedMappings: InternalWellboreMappings,
  savedRmsWellboreNames: string[],
): PendingImport {
  const savedNames = new Set(savedRmsWellboreNames);
  const importedRmsWellboreNames = new Set(
    importedMappings
      .filter((mapping) => isRmsMapping(mapping, "simulator"))
      .map((mapping) => mapping.source_id),
  );

  return {
    mappings: importedMappings.filter((mapping) =>
      savedNames.has(mapping.source_id),
    ),
    excludedRmsWellboreNames: [...importedRmsWellboreNames]
      .filter((name) => !savedNames.has(name))
      .sort(),
  };
}

export function mergeImportedMappings(
  currentMappings: InternalWellboreMappings,
  importedMappings: InternalWellboreMappings,
) {
  const importedIdentityKeys = new Set(
    importedMappings.map((mapping) => mappingIdentityKey(mapping)),
  );

  return [
    ...currentMappings.filter(
      (mapping) => !importedIdentityKeys.has(mappingIdentityKey(mapping)),
    ),
    ...importedMappings,
  ];
}

function pruneUnusedSelfMappings(mappings: InternalWellboreMappings) {
  const crossSystemSourceIds = new Set(
    mappings
      .filter((mapping) => mapping.source_system !== mapping.target_system)
      .map((mapping) => mapping.source_id),
  );

  return mappings.filter(
    (mapping) =>
      mapping.source_system !== mapping.target_system ||
      crossSystemSourceIds.has(mapping.source_id),
  );
}

export function removeSimulatorMappings(mappings: InternalWellboreMappings) {
  return pruneUnusedSelfMappings(
    mappings.filter((mapping) => !isRmsMapping(mapping, "simulator")),
  );
}

export function removeSmdaMappings(mappings: InternalWellboreMappings) {
  return pruneUnusedSelfMappings(
    mappings.filter((mapping) => !isRmsMapping(mapping, "smda")),
  );
}

export function wellboreSmdaTargetPairs(
  mappings: InternalWellboreMappings,
): SourceTargetPair[] {
  return mappings.flatMap((mapping) =>
    isRmsMapping(mapping, "smda") &&
    mapping.relation_type === "primary" &&
    mapping.target_uuid
      ? [{ sourceId: mapping.source_id, targetUuid: mapping.target_uuid }]
      : [],
  );
}

export function selectedMatchProposalPairs(
  proposals: AutomaticMatchProposal[],
): SourceTargetPair[] {
  return proposals
    .filter((proposal) => proposal.selected)
    .map((proposal) => ({
      sourceId: proposal.rmsWellboreName,
      targetUuid: proposal.smdaUuid,
    }));
}

export function createAutomaticMatchProposals(
  matchResults: MatchResult[],
  smdaHeaders: SmdaWellHeader[],
): AutomaticMatchProposal[] {
  const headersByIdentifier = new Map(
    smdaHeaders.map((header) => [header.unique_wellbore_identifier, header]),
  );

  const proposals = matchResults.flatMap((result) => {
    const candidate = result.matches[0];
    if (!candidate || candidate.confidence === "low") {
      return [];
    }
    const header = headersByIdentifier.get(candidate.target);
    if (!header) {
      return [];
    }

    return [
      {
        rmsWellboreName: result.source,
        smdaName: header.unique_wellbore_identifier,
        smdaUuid: header.wellbore_uuid,
        candidate,
        selected: candidate.score === 100,
      },
    ];
  });
  const exactMatchPairs = selectedMatchProposalPairs(proposals);

  return proposals.map((proposal) => ({
    ...proposal,
    selected:
      proposal.selected &&
      !getOtherSourceUsingTargetUuid(
        exactMatchPairs,
        proposal.smdaUuid,
        proposal.rmsWellboreName,
      ),
  }));
}

export function toggleMatchProposal(
  proposals: AutomaticMatchProposal[],
  rmsWellboreName: string,
) {
  const selectedPairs = selectedMatchProposalPairs(proposals);

  return proposals.map((proposal) => {
    if (proposal.rmsWellboreName !== rmsWellboreName) {
      return proposal;
    }
    if (
      !proposal.selected &&
      getOtherSourceUsingTargetUuid(
        selectedPairs,
        proposal.smdaUuid,
        proposal.rmsWellboreName,
      )
    ) {
      return proposal;
    }

    return { ...proposal, selected: !proposal.selected };
  });
}

export function applyAutomaticMatchProposals(
  mappings: InternalWellboreMappings,
  proposals: AutomaticMatchProposal[],
) {
  const selectedProposals = proposals.filter((proposal) => proposal.selected);
  const selectedRmsWellboreNames = new Set(
    selectedProposals.map((proposal) => proposal.rmsWellboreName),
  );
  const updated = mappings.filter(
    (mapping) =>
      !(
        selectedRmsWellboreNames.has(mapping.source_id) &&
        isRmsMapping(mapping, "smda")
      ),
  );
  const selfMappedRmsWellboreNames = new Set(
    updated
      .filter(
        (mapping) =>
          isRmsMapping(mapping, "rms") && mapping.relation_type === "primary",
      )
      .map((mapping) => mapping.source_id),
  );

  selectedProposals.forEach((proposal) => {
    if (!selfMappedRmsWellboreNames.has(proposal.rmsWellboreName)) {
      updated.push(rmsSelfMapping(proposal.rmsWellboreName));
      selfMappedRmsWellboreNames.add(proposal.rmsWellboreName);
    }
    updated.push({
      mapping_type: "wellbore",
      source_system: "rms",
      target_system: "smda",
      relation_type: "primary",
      source_id: proposal.rmsWellboreName,
      target_id: proposal.smdaName,
      target_uuid: proposal.smdaUuid,
    });
  });

  return updated;
}
