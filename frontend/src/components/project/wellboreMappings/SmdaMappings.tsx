import { Checkbox, Dialog, Tooltip } from "@equinor/eds-core-react";
import { type ColumnDef, EdsDataGrid } from "@equinor/eds-data-grid-react";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";

import type {
  InternalWellboreMappings,
  MatchReplacementRule,
  RmsWell,
  SmdaWellHeader,
} from "#client";
import { matchPostMatchMutation } from "#client/@tanstack/react-query.gen";
import { CancelButton, GeneralButton } from "#components/form/button";
import {
  emptyName,
  getOtherSourceUsingTargetUuid,
} from "#components/project/mapping/utils";
import type { SaveWellboreMappings } from "#services/mappings";
import { EditDialog, PageText } from "#styles/common";
import {
  applyAutomaticMatchProposals,
  createAutomaticMatchProposals,
  gridHeight,
  isRmsMapping,
  nonPlannedRmsWellNames,
  removeSmdaMappings,
  wellboreSmdaTargetPairs,
} from "./functions";
import { MappingAction } from "./MappingAction";
import { RemoveMappingsDialog } from "./RemoveMappingsDialog";
import {
  CenteredColumnContent,
  ConfidenceBadge,
  MatchingResultsContainer,
} from "./SmdaMappings.style";
import type { AutomaticMatchProposal, DisplayedMatchQuality } from "./types";

const COUNTRY_PREFIX_REPLACEMENTS: MatchReplacementRule[] = [
  { original: "NO", replacement: "" },
  { original: "BR", replacement: "" },
  { original: "CA", replacement: "" },
  { original: "US", replacement: "" },
];
const MATCH_QUALITY_ORDER: Record<DisplayedMatchQuality, number> = {
  medium: 0,
  high: 1,
  exact: 2,
};
const AUTOMATIC_MATCHING_GRID_MAX_HEIGHT = 391;

function AutomaticMatchingSetupDialog({
  disabled,
  isPending,
  closeDialog,
  runMatching,
}: {
  disabled: boolean;
  isPending: boolean;
  closeDialog: () => void;
  runMatching: (rules: MatchReplacementRule[]) => void;
}) {
  const [ignoreCountryPrefixes, setIgnoreCountryPrefixes] = useState(true);

  const submitMatching = () => {
    runMatching(ignoreCountryPrefixes ? COUNTRY_PREFIX_REPLACEMENTS : []);
  };

  return (
    <EditDialog open={true} $width="42em">
      <Dialog.Header>Suggest SMDA names</Dialog.Header>
      <Dialog.CustomContent>
        <PageText>
          This compares each unmapped RMS well name with the available SMDA
          wellbore names and suggests the most similar SMDA name. You can review
          every suggestion before anything is saved.
        </PageText>

        <Checkbox
          label="Ignore common country prefixes when comparing names (recommended)"
          checked={ignoreCountryPrefixes}
          onChange={(event) => {
            setIgnoreCountryPrefixes(event.target.checked);
          }}
        />
        <PageText $marginBottom="0">
          SMDA wellbore names often begin with a two-letter country code.
          Ignoring <code>NO</code>, <code>BR</code>, <code>CA</code>, and{" "}
          <code>US</code> makes the remaining name easier to compare with the
          RMS name. The complete SMDA name, including the country prefix, is
          still saved.
        </PageText>
      </Dialog.CustomContent>
      <Dialog.Actions>
        <GeneralButton
          label="Generate suggestions"
          disabled={disabled}
          isPending={isPending}
          onClick={submitMatching}
        />
        <CancelButton onClick={closeDialog} />
      </Dialog.Actions>
    </EditDialog>
  );
}

function AutomaticMatchingDialog({
  proposals,
  unmappedRmsWellCount,
  disabled,
  isPending,
  closeDialog,
  applyProposals,
  toggleProposal,
}: {
  proposals: AutomaticMatchProposal[];
  unmappedRmsWellCount: number;
  disabled: boolean;
  isPending: boolean;
  closeDialog: () => void;
  applyProposals: () => void;
  toggleProposal: (rmsName: string) => void;
}) {
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>([
    { id: "nameSimilarity", desc: true },
  ]);
  const selectedCount = proposals.filter(
    (proposal) => proposal.selected,
  ).length;
  const remainingCount = unmappedRmsWellCount - selectedCount;
  const selectedPairs = proposals
    .filter((proposal) => proposal.selected)
    .map((proposal) => ({
      sourceId: proposal.rmsName,
      targetUuid: proposal.smdaUuid,
    }));
  const hasDuplicateTargets = selectedPairs.some(
    ({ sourceId, targetUuid }) =>
      getOtherSourceUsingTargetUuid(selectedPairs, targetUuid, sourceId) !==
      undefined,
  );
  const columns: ColumnDef<AutomaticMatchProposal>[] = [
    {
      id: "useSuggestion",
      accessorFn: (proposal) => proposal.selected,
      header: "Use",
      enableColumnFilter: false,
      size: 80,
      cell: ({ row }) => {
        const proposal = row.original;
        const conflictingRmsName = getOtherSourceUsingTargetUuid(
          selectedPairs,
          proposal.smdaUuid,
          proposal.rmsName,
        );

        return (
          <Tooltip
            title={
              conflictingRmsName
                ? "This SMDA name is already selected for RMS well " +
                  conflictingRmsName
                : ""
            }
          >
            <CenteredColumnContent>
              <Checkbox
                checked={proposal.selected}
                disabled={Boolean(conflictingRmsName)}
                onChange={() => {
                  toggleProposal(proposal.rmsName);
                }}
              />
            </CenteredColumnContent>
          </Tooltip>
        );
      },
      sortingFn: (rowA, rowB) =>
        Number(rowA.original.selected) - Number(rowB.original.selected),
    },
    {
      accessorKey: "rmsName",
      header: "RMS",
      size: 195,
    },
    {
      accessorKey: "smdaName",
      header: "Suggested SMDA",
      size: 236,
      cell: ({ row }) => row.original.smdaName || emptyName,
    },
    {
      id: "nameSimilarity",
      accessorFn: (proposal) =>
        proposal.candidate.score === 100
          ? "exact"
          : proposal.candidate.confidence,
      header: "Name similarity",
      size: 215,
      sortingFn: (rowA, rowB) => {
        const qualityA = rowA.getValue<DisplayedMatchQuality>("nameSimilarity");
        const qualityB = rowB.getValue<DisplayedMatchQuality>("nameSimilarity");

        return MATCH_QUALITY_ORDER[qualityA] - MATCH_QUALITY_ORDER[qualityB];
      },
      cell: ({ getValue }) => {
        const quality = getValue<DisplayedMatchQuality>();

        return (
          <ConfidenceBadge $confidence={quality}>{quality}</ConfidenceBadge>
        );
      },
    },
  ];

  return (
    <EditDialog open={true} $width="48em">
      <Dialog.Header>Review suggested SMDA names</Dialog.Header>
      <Dialog.CustomContent>
        <PageText>
          Name similarity shows how closely the RMS name and suggested SMDA name
          resemble each other. It does not confirm they refer to the same well.
        </PageText>

        <PageText>
          Suggestions labeled <span className="emphasis">Exact</span> have 100%
          name similarity using the comparison options selected in the previous
          step. They are selected by default.
        </PageText>

        <PageText>
          Each SMDA name can be selected for only one RMS well.
        </PageText>

        <PageText>
          Selected suggestions:{" "}
          <span className="emphasis">{selectedCount}</span>.{" "}
          {remainingCount > 0 && (
            <>
              RMS wells needing manual mapping:{" "}
              <span className="emphasis">{remainingCount}</span>.
            </>
          )}
        </PageText>

        <MatchingResultsContainer>
          <EdsDataGrid
            stickyHeader
            enableVirtual
            height={gridHeight(
              proposals.length,
              AUTOMATIC_MATCHING_GRID_MAX_HEIGHT,
            )}
            rows={proposals}
            columns={columns}
            getRowId={(row) => row.rmsName}
            headerClass={(column) =>
              column.id === "useSuggestion" ? "centered-column-header" : ""
            }
            enableSorting
            enableColumnFiltering
            sortingState={sorting}
            onSortingChange={setSorting}
          />
        </MatchingResultsContainer>
      </Dialog.CustomContent>
      <Dialog.Actions>
        <GeneralButton
          label="Save selected SMDA names"
          disabled={disabled || selectedCount === 0 || hasDuplicateTargets}
          isPending={isPending}
          onClick={applyProposals}
        />
        <CancelButton onClick={closeDialog} />
      </Dialog.Actions>
    </EditDialog>
  );
}

export function SmdaMappings({
  rmsWells,
  mappings,
  smdaHeaders,
  hasFields,
  smdaHealthStatus,
  wellHeadersLoading,
  wellHeadersError,
  projectReadOnly,
  isSaving,
  saveMappings,
}: {
  rmsWells: RmsWell[];
  mappings: InternalWellboreMappings;
  smdaHeaders: SmdaWellHeader[];
  hasFields: boolean;
  smdaHealthStatus: boolean;
  wellHeadersLoading: boolean;
  wellHeadersError: boolean;
  projectReadOnly: boolean;
  isSaving: boolean;
  saveMappings: SaveWellboreMappings;
}) {
  const [automaticMatchProposals, setAutomaticMatchProposals] = useState<
    AutomaticMatchProposal[]
  >([]);
  const [automaticMatchingSetupOpen, setAutomaticMatchingSetupOpen] =
    useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const matchMutation = useMutation({
    ...matchPostMatchMutation(),
    meta: { errorPrefix: "Could not generate SMDA name suggestions" },
  });
  const nonPlannedRmsNames = useMemo(
    () => nonPlannedRmsWellNames(rmsWells),
    [rmsWells],
  );
  const { hasSmdaMappings, rmsNamesMissingSmda } = useMemo(() => {
    let smdaMappingsExist = false;
    const mappedRmsNames = new Set<string>();

    mappings.forEach((mapping) => {
      if (
        isRmsMapping(mapping, "smda") &&
        (mapping.relation_type === "primary" ||
          mapping.relation_type === "unmappable")
      ) {
        smdaMappingsExist = true;
        mappedRmsNames.add(mapping.source_id);
      }
    });

    return {
      hasSmdaMappings: smdaMappingsExist,
      rmsNamesMissingSmda: nonPlannedRmsNames.filter(
        (rmsName) => !mappedRmsNames.has(rmsName),
      ),
    };
  }, [mappings, nonPlannedRmsNames]);
  const smdaTargetPairs = useMemo(
    () => wellboreSmdaTargetPairs(mappings),
    [mappings],
  );
  const availableSmdaHeaders = useMemo(
    () =>
      smdaHeaders.filter(
        (header) =>
          !smdaTargetPairs.some(
            (pair) => pair.targetUuid === header.wellbore_uuid,
          ),
      ),
    [smdaHeaders, smdaTargetPairs],
  );

  const startAutomaticMatching = (replacements: MatchReplacementRule[]) => {
    matchMutation.mutate(
      {
        body: {
          sources: rmsNamesMissingSmda,
          targets: availableSmdaHeaders.map(
            (header) => header.unique_wellbore_identifier,
          ),
          replacements,
        },
      },
      {
        onSuccess: (results) => {
          const proposals = createAutomaticMatchProposals(
            results,
            availableSmdaHeaders,
          );
          setAutomaticMatchingSetupOpen(false);
          setAutomaticMatchProposals(proposals);
          if (proposals.length === 0) {
            toast.info("No medium or higher similarity suggestions found");
          }
        },
      },
    );
  };

  const applyAutomaticMatches = () => {
    saveMappings(
      applyAutomaticMatchProposals(mappings, automaticMatchProposals),
      {
        successMessage: "Selected SMDA names saved",
        onSuccess: () => {
          setAutomaticMatchProposals([]);
        },
      },
    );
  };

  const removeAllSmdaMappings = () => {
    saveMappings(removeSmdaMappings(mappings), {
      successMessage: "SMDA names removed",
      onSuccess: () => {
        setRemoveDialogOpen(false);
      },
    });
  };

  return (
    <>
      {automaticMatchingSetupOpen && (
        <AutomaticMatchingSetupDialog
          disabled={projectReadOnly || matchMutation.isPending}
          isPending={matchMutation.isPending}
          closeDialog={() => {
            setAutomaticMatchingSetupOpen(false);
          }}
          runMatching={startAutomaticMatching}
        />
      )}

      {automaticMatchProposals.length > 0 && (
        <AutomaticMatchingDialog
          proposals={automaticMatchProposals}
          unmappedRmsWellCount={rmsNamesMissingSmda.length}
          disabled={projectReadOnly || isSaving}
          isPending={isSaving}
          closeDialog={() => {
            setAutomaticMatchProposals([]);
          }}
          applyProposals={applyAutomaticMatches}
          toggleProposal={(rmsName) => {
            setAutomaticMatchProposals((proposals) => {
              const selectedPairs = proposals
                .filter((proposal) => proposal.selected)
                .map((proposal) => ({
                  sourceId: proposal.rmsName,
                  targetUuid: proposal.smdaUuid,
                }));

              return proposals.map((proposal) => {
                if (proposal.rmsName !== rmsName) {
                  return proposal;
                }
                if (
                  !proposal.selected &&
                  getOtherSourceUsingTargetUuid(
                    selectedPairs,
                    proposal.smdaUuid,
                    proposal.rmsName,
                  )
                ) {
                  return proposal;
                }

                return { ...proposal, selected: !proposal.selected };
              });
            });
          }}
        />
      )}

      {removeDialogOpen && (
        <RemoveMappingsDialog
          operation="smda"
          disabled={projectReadOnly || isSaving}
          isPending={isSaving}
          closeDialog={() => {
            setRemoveDialogOpen(false);
          }}
          removeMappings={removeAllSmdaMappings}
        />
      )}

      <MappingAction
        title="SMDA names"
        description={
          hasSmdaMappings
            ? "Generate more suggestions or remove the current SMDA names."
            : "Get suggested SMDA names for non-planned RMS wells that are " +
              "not yet mapped."
        }
      >
        <GeneralButton
          label="Suggest SMDA names"
          disabled={
            projectReadOnly ||
            !nonPlannedRmsNames.length ||
            !rmsNamesMissingSmda.length ||
            !availableSmdaHeaders.length ||
            !hasFields ||
            !smdaHealthStatus ||
            wellHeadersLoading ||
            wellHeadersError ||
            matchMutation.isPending
          }
          isPending={matchMutation.isPending}
          tooltipText={
            projectReadOnly
              ? "Project is read-only"
              : !rmsWells.length
                ? "Save RMS wells before generating SMDA name suggestions"
                : !nonPlannedRmsNames.length
                  ? "SMDA mapping is not available because all saved RMS " +
                    "wells are planned"
                  : !rmsNamesMissingSmda.length
                    ? "All non-planned RMS wells already have an SMDA mapping"
                    : !hasFields
                      ? "Project masterdata must contain a field"
                      : !smdaHealthStatus
                        ? "SMDA is not available"
                        : wellHeadersError
                          ? "SMDA wellbore names could not be loaded for all fields"
                          : !wellHeadersLoading && !availableSmdaHeaders.length
                            ? "All available SMDA wellbore names are already mapped"
                            : undefined
          }
          onClick={() => {
            if (!availableSmdaHeaders.length) {
              toast.info("No SMDA wellbore names are available to compare");
            } else {
              setAutomaticMatchingSetupOpen(true);
            }
          }}
        />
        {hasSmdaMappings && (
          <GeneralButton
            label="Remove all SMDA names"
            variant="outlined"
            color="danger"
            disabled={projectReadOnly}
            tooltipText={projectReadOnly ? "Project is read-only" : undefined}
            onClick={() => {
              setRemoveDialogOpen(true);
            }}
          />
        )}
      </MappingAction>
    </>
  );
}
