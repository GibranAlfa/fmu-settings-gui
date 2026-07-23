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

const GRID_ROW_HEIGHT = 48;

export function gridHeight(rowCount: number, maxHeight: number) {
  return Math.min((rowCount + 1) * GRID_ROW_HEIGHT, maxHeight);
}

export function isRmsMapping(
  mapping: InternalWellboreIdentifierMapping,
  targetSystem: "rms" | "simulator" | "smda",
) {
  return (
    mapping.source_system === "rms" && mapping.target_system === targetSystem
  );
}

function rmsSelfMapping(rmsName: string): InternalWellboreIdentifierMapping {
  return {
    mapping_type: "wellbore",
    source_system: "rms",
    target_system: "rms",
    relation_type: "primary",
    source_id: rmsName,
    target_id: rmsName,
  };
}

function mappingKey(mapping: InternalWellboreIdentifierMapping) {
  return [
    mapping.source_system,
    mapping.target_system,
    mapping.relation_type,
    mapping.source_id,
    mapping.target_id ?? "",
  ].join(":");
}

function resolveSimulatorMapping(
  rmsName: string,
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
    source_id: rmsName,
    target_id: targetId,
  };
}

function resolveSmdaMapping(
  rmsName: string,
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
      source_id: rmsName,
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
      source_id: rmsName,
      target_id: smdaHeader.unique_wellbore_identifier,
      target_uuid: smdaHeader.wellbore_uuid,
    };
  }

  return existingMapping?.target_uuid === smdaUuid
    ? existingMapping
    : undefined;
}

export function savedRmsWellNames(wells: RmsWell[]) {
  return wells.map((well) => well.name);
}

export function nonPlannedRmsWellNames(wells: RmsWell[]) {
  return wells.filter((well) => !well.planned).map((well) => well.name);
}

export function createWellboreMappingRows(
  rmsWells: RmsWell[],
  mappings: InternalWellboreMappings,
): WellboreMappingRow[] {
  const simulatorMappingsByRms = new Map<
    string,
    InternalWellboreIdentifierMapping[]
  >();
  const smdaMappingsByRms = new Map<
    string,
    InternalWellboreIdentifierMapping
  >();

  mappings.forEach((mapping) => {
    if (
      isRmsMapping(mapping, "simulator") &&
      mapping.relation_type === "primary"
    ) {
      const simulatorMappings =
        simulatorMappingsByRms.get(mapping.source_id) ?? [];
      simulatorMappings.push(mapping);
      simulatorMappingsByRms.set(mapping.source_id, simulatorMappings);
    } else if (
      isRmsMapping(mapping, "smda") &&
      (mapping.relation_type === "primary" ||
        mapping.relation_type === "unmappable") &&
      !smdaMappingsByRms.has(mapping.source_id)
    ) {
      smdaMappingsByRms.set(mapping.source_id, mapping);
    }
  });

  return rmsWells.flatMap((well) => {
    const rmsName = well.name;
    const simulatorMappings = simulatorMappingsByRms.get(rmsName) ?? [];
    const smdaMapping = well.planned
      ? undefined
      : smdaMappingsByRms.get(rmsName);
    const simulatorNames = simulatorMappings.length
      ? simulatorMappings.map((mapping) => mapping.target_id ?? "")
      : [""];

    return simulatorNames.map((simulatorName, index) => ({
      id: `${rmsName}:${simulatorName}:${String(index)}`,
      rmsName,
      planned: well.planned ?? false,
      simulatorName,
      smdaName: smdaMapping?.target_id ?? "",
      smdaUuid: smdaMapping?.target_uuid ?? "",
      unmappable: smdaMapping?.relation_type === "unmappable",
    }));
  });
}

export function updateWellboreMapping(
  mappings: InternalWellboreMappings,
  row: WellboreMappingRow,
  value: WellboreMappingFormValue,
  smdaHeaders: SmdaWellHeader[],
): InternalWellboreMappings {
  const rmsName = row.rmsName;
  const existingSmdaMapping = mappings.find(
    (mapping) => mapping.source_id === rmsName && isRmsMapping(mapping, "smda"),
  );
  const replacementMappings = [
    resolveSimulatorMapping(rmsName, value.simulatorName),
    resolveSmdaMapping(
      rmsName,
      value.smdaUuid,
      smdaHeaders,
      existingSmdaMapping,
    ),
  ].filter((mapping) => mapping !== undefined);

  let simulatorMappingRemoved = false;
  const preservedMappings = mappings.filter((mapping) => {
    if (mapping.source_id !== rmsName) {
      return true;
    }
    if (isRmsMapping(mapping, "smda")) {
      return false;
    }
    if (
      !simulatorMappingRemoved &&
      isRmsMapping(mapping, "simulator") &&
      mapping.relation_type === "primary" &&
      (mapping.target_id ?? "") === row.simulatorName
    ) {
      simulatorMappingRemoved = true;

      return false;
    }
    if (isRmsMapping(mapping, "rms") && mapping.relation_type === "primary") {
      return false;
    }

    return true;
  });
  const hasPreservedCrossSystemMapping = preservedMappings.some(
    (mapping) =>
      mapping.source_id === rmsName &&
      (isRmsMapping(mapping, "simulator") || isRmsMapping(mapping, "smda")),
  );
  const hasCrossSystemMapping =
    hasPreservedCrossSystemMapping || replacementMappings.length > 0;

  return [
    ...preservedMappings,
    ...(hasCrossSystemMapping ? [rmsSelfMapping(rmsName)] : []),
    ...replacementMappings,
  ];
}

export function prepareImportedMappings(
  importedMappings: InternalWellboreMappings,
  savedRmsNames: string[],
): PendingImport {
  const savedNames = new Set(savedRmsNames);
  const importedRmsNames = new Set(
    importedMappings
      .filter((mapping) => isRmsMapping(mapping, "simulator"))
      .map((mapping) => mapping.source_id),
  );

  return {
    mappings: importedMappings.filter((mapping) =>
      savedNames.has(mapping.source_id),
    ),
    excludedRmsNames: [...importedRmsNames]
      .filter((name) => !savedNames.has(name))
      .sort(),
  };
}

export function mergeImportedMappings(
  currentMappings: InternalWellboreMappings,
  importedMappings: InternalWellboreMappings,
) {
  const importedKeys = new Set(
    importedMappings.map((mapping) => mappingKey(mapping)),
  );

  return [
    ...currentMappings.filter(
      (mapping) => !importedKeys.has(mappingKey(mapping)),
    ),
    ...importedMappings,
  ];
}

export function removeSimulatorMappings(mappings: InternalWellboreMappings) {
  return mappings.filter((mapping) => !isRmsMapping(mapping, "simulator"));
}

export function removeSmdaMappings(mappings: InternalWellboreMappings) {
  return mappings.filter((mapping) => !isRmsMapping(mapping, "smda"));
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

export function createAutomaticMatchProposals(
  matchResults: MatchResult[],
  smdaHeaders: SmdaWellHeader[],
): AutomaticMatchProposal[] {
  const headersByIdentifier = new Map(
    smdaHeaders.map((header) => [header.unique_wellbore_identifier, header]),
  );

  const proposals = matchResults.flatMap((result) => {
    const candidate = result.matches[0];
    if (candidate.confidence === "low") {
      return [];
    }
    const header = headersByIdentifier.get(candidate.target);
    if (!header) {
      throw new Error("A suggested wellbore was not found in the SMDA data");
    }

    return [
      {
        rmsName: result.source,
        smdaName: header.unique_wellbore_identifier,
        smdaUuid: header.wellbore_uuid,
        candidate,
        selected: candidate.score === 100,
      },
    ];
  });
  const exactMatchPairs = proposals
    .filter((proposal) => proposal.selected)
    .map((proposal) => ({
      sourceId: proposal.rmsName,
      targetUuid: proposal.smdaUuid,
    }));

  return proposals.map((proposal) => ({
    ...proposal,
    selected:
      proposal.selected &&
      !getOtherSourceUsingTargetUuid(
        exactMatchPairs,
        proposal.smdaUuid,
        proposal.rmsName,
      ),
  }));
}

export function applyAutomaticMatchProposals(
  mappings: InternalWellboreMappings,
  proposals: AutomaticMatchProposal[],
) {
  const selectedProposals = proposals.filter((proposal) => proposal.selected);
  const selectedRmsNames = new Set(
    selectedProposals.map((proposal) => proposal.rmsName),
  );
  const updated = mappings.filter(
    (mapping) =>
      !(
        selectedRmsNames.has(mapping.source_id) && isRmsMapping(mapping, "smda")
      ),
  );
  const selfMappedRmsNames = new Set(
    updated
      .filter(
        (mapping) =>
          isRmsMapping(mapping, "rms") && mapping.relation_type === "primary",
      )
      .map((mapping) => mapping.source_id),
  );

  selectedProposals.forEach((proposal) => {
    if (!selfMappedRmsNames.has(proposal.rmsName)) {
      updated.push(rmsSelfMapping(proposal.rmsName));
      selfMappedRmsNames.add(proposal.rmsName);
    }
    updated.push({
      mapping_type: "wellbore",
      source_system: "rms",
      target_system: "smda",
      relation_type: "primary",
      source_id: proposal.rmsName,
      target_id: proposal.smdaName,
      target_uuid: proposal.smdaUuid,
    });
  });

  return updated;
}
