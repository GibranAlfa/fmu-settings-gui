import { Checkbox, Dialog, Tooltip } from "@equinor/eds-core-react";
import { type ColumnDef, EdsDataGrid } from "@equinor/eds-data-grid-react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import type {
  InternalWellboreMappings,
  MatchReplacementRule,
  SmdaWellHeader,
} from "#client";
import { matchPostMatchMutation } from "#client/@tanstack/react-query.gen";
import { ConfirmCloseDialog } from "#components/common";
import { CancelButton, GeneralButton } from "#components/form/button";
import { emptyName } from "#components/project/mapping/utils";
import { applicationLocale } from "#config";
import {
  isSmdaWellboreMapping,
  type SaveWellboreMappings,
} from "#services/mappings";
import type { SmdaWellHeaders } from "#services/smda";
import { EditDialog, InfoBox, PageText } from "#styles/common";
import {
  DataGridFilterContainer,
  DataGridSearch,
  dataGridHeight,
} from "#styles/dataGrid";
import { useConfirmClose } from "#utils/ui";
import {
  applyAutomaticMatchProposals,
  createAutomaticMatchProposals,
  removeSmdaMappings,
  selectedMatchProposalPairs,
  toggleMatchProposal,
  wellboreSmdaTargetPairs,
} from "./functions";
import { MappingAction } from "./MappingAction";
import { RemoveMappingsAction } from "./RemoveMappingsAction";
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
  Medium: 0,
  High: 1,
  Exact: 2,
};
const AUTOMATIC_MATCHING_GRID_MAX_HEIGHT = 391;
const smdaUnavailableReason = "SMDA is not available";
type ColumnFilters = Array<{ id: string; value: unknown }>;

function displayedMatchQuality(
  proposal: AutomaticMatchProposal,
): DisplayedMatchQuality {
  if (proposal.candidate.score === 100) {
    return "Exact";
  }

  return proposal.candidate.confidence === "high" ? "High" : "Medium";
}

function matchesNameSimilarityFilter(
  proposal: AutomaticMatchProposal,
  columnFilters: ColumnFilters,
) {
  const nameSimilarityFilter = columnFilters.find(
    (filter) => filter.id === "nameSimilarity",
  );
  const filterValues = (
    Array.isArray(nameSimilarityFilter?.value)
      ? nameSimilarityFilter.value
      : [nameSimilarityFilter?.value]
  ).filter(Boolean);

  return (
    filterValues.length === 0 ||
    filterValues.includes(displayedMatchQuality(proposal))
  );
}

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
    <EditDialog
      open={true}
      isDismissable={true}
      onClose={closeDialog}
      $width="42em"
    >
      <Dialog.Header>Suggest SMDA names</Dialog.Header>
      <Dialog.CustomContent>
        <PageText>
          This compares each unmapped RMS wellbore name with the available SMDA
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
          RMS wellbore name. The complete SMDA name, including the country
          prefix, is still saved.
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
  unmappedRmsWellboreCount,
  disabled,
  isPending,
  closeDialog,
  applyProposals,
  toggleProposal,
}: {
  proposals: AutomaticMatchProposal[];
  unmappedRmsWellboreCount: number;
  disabled: boolean;
  isPending: boolean;
  closeDialog: () => void;
  applyProposals: () => void;
  toggleProposal: (rmsWellboreName: string) => void;
}) {
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>([
    { id: "nameSimilarity", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>([]);
  const [wellboreFilter, setWellboreFilter] = useState("");
  const selectedCount = proposals.filter(
    (proposal) => proposal.selected,
  ).length;
  const confirmClose = useConfirmClose({
    enable: true,
    determineRequiresConfirmation: () => selectedCount > 0,
    onCloseConfirmed: closeDialog,
  });
  const remainingCount = unmappedRmsWellboreCount - selectedCount;
  const normalizedWellboreFilter = wellboreFilter
    .trim()
    .toLocaleLowerCase(applicationLocale);
  const visibleProposals = useMemo(
    () =>
      normalizedWellboreFilter
        ? proposals.filter((proposal) =>
            proposal.rmsWellboreName
              .toLocaleLowerCase(applicationLocale)
              .includes(normalizedWellboreFilter),
          )
        : proposals,
    [normalizedWellboreFilter, proposals],
  );
  const filteredProposalCount = useMemo(
    () =>
      visibleProposals.filter((proposal) =>
        matchesNameSimilarityFilter(proposal, columnFilters),
      ).length,
    [columnFilters, visibleProposals],
  );
  const selectedSourceByTargetUuid = useMemo(
    () =>
      new Map(
        selectedMatchProposalPairs(proposals).map((pair) => [
          pair.targetUuid,
          pair.sourceId,
        ]),
      ),
    [proposals],
  );
  const columns: ColumnDef<AutomaticMatchProposal>[] = useMemo(
    () => [
      {
        id: "useSuggestion",
        accessorFn: (proposal) => proposal.selected,
        header: "Use",
        enableColumnFilter: false,
        size: 80,
        cell: ({ row }) => {
          const proposal = row.original;
          const selectedRmsWellboreName = selectedSourceByTargetUuid.get(
            proposal.smdaUuid,
          );
          const conflictingRmsWellboreName =
            selectedRmsWellboreName === proposal.rmsWellboreName
              ? undefined
              : selectedRmsWellboreName;

          return (
            <Tooltip
              title={
                conflictingRmsWellboreName
                  ? "This SMDA name is already selected for RMS wellbore " +
                    conflictingRmsWellboreName
                  : ""
              }
            >
              <CenteredColumnContent>
                <Checkbox
                  checked={proposal.selected}
                  disabled={Boolean(conflictingRmsWellboreName)}
                  onChange={() => {
                    toggleProposal(proposal.rmsWellboreName);
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
        accessorKey: "rmsWellboreName",
        header: "Wellbore",
        enableColumnFilter: false,
        size: 195,
      },
      {
        accessorKey: "smdaName",
        header: "Suggested SMDA",
        enableColumnFilter: false,
        size: 236,
        cell: ({ row }) => row.original.smdaName || emptyName,
      },
      {
        id: "nameSimilarity",
        accessorFn: displayedMatchQuality,
        header: "Name similarity",
        size: 225,
        sortingFn: (rowA, rowB) => {
          const qualityA =
            rowA.getValue<DisplayedMatchQuality>("nameSimilarity");
          const qualityB =
            rowB.getValue<DisplayedMatchQuality>("nameSimilarity");

          return MATCH_QUALITY_ORDER[qualityA] - MATCH_QUALITY_ORDER[qualityB];
        },
        cell: ({ getValue }) => {
          const quality = getValue<DisplayedMatchQuality>();

          return (
            <ConfidenceBadge $confidence={quality}>{quality}</ConfidenceBadge>
          );
        },
      },
    ],
    [selectedSourceByTargetUuid, toggleProposal],
  );
  const emptyMessage =
    proposals.length === 0
      ? "No medium or higher similarity suggestions were found."
      : normalizedWellboreFilter && visibleProposals.length === 0
        ? "No wellbores match the filter."
        : "No suggestions match the current filters.";

  return (
    <>
      <ConfirmCloseDialog
        isOpen={confirmClose.confirmCloseDialogOpen}
        handleConfirmCloseDecision={confirmClose.handleDecision}
        title="Discard suggestions"
        description={
          "The selected SMDA names have not been saved. If the review is " +
          "cancelled, the suggestions will be lost."
        }
        question="Do you want to discard the suggestions?"
        confirmLabel="Keep reviewing"
        cancelLabel="Discard suggestions"
      />

      <EditDialog
        open={true}
        isDismissable={true}
        onClose={confirmClose.handleCloseRequest}
        $width="48em"
      >
        <Dialog.Header>Review suggested SMDA names</Dialog.Header>
        <Dialog.CustomContent>
          <PageText>
            Review each suggestion before saving. Name similarity does not
            verify that the RMS and SMDA names refer to the same wellbore.
            Suggestions with low name similarity are not shown.
          </PageText>

          <PageText>
            <span className="emphasis">Exact</span> means a 100% name match and
            is selected by default. Each SMDA name can be mapped to only one RMS
            wellbore.
          </PageText>

          <InfoBox>
            <table>
              <tbody>
                <tr>
                  <th>Suggestions found</th>
                  <td>
                    <span className="emphasis">{proposals.length}</span> of{" "}
                    {unmappedRmsWellboreCount} unmapped non-planned wellbores
                  </td>
                </tr>
                <tr>
                  <th>Selected suggestions</th>
                  <td className="emphasis">{selectedCount}</td>
                </tr>
                <tr>
                  <th>Need manual mapping</th>
                  <td className="emphasis">{remainingCount}</td>
                </tr>
              </tbody>
            </table>
          </InfoBox>

          {proposals.length > 0 && (
            <DataGridFilterContainer>
              <DataGridSearch
                placeholder="Filter wellbores"
                value={wellboreFilter}
                onChange={(event) => {
                  setWellboreFilter(event.target.value);
                }}
              />
              {normalizedWellboreFilter && (
                <PageText $marginBottom="0">
                  Filter is showing{" "}
                  <span className="emphasis">{filteredProposalCount}</span> of{" "}
                  {proposals.length} suggestions.
                </PageText>
              )}
            </DataGridFilterContainer>
          )}

          <MatchingResultsContainer>
            <EdsDataGrid
              stickyHeader
              enableVirtual
              height={dataGridHeight(
                filteredProposalCount,
                AUTOMATIC_MATCHING_GRID_MAX_HEIGHT,
              )}
              rows={visibleProposals}
              columns={columns}
              getRowId={(row) => row.rmsWellboreName}
              headerClass={(column) =>
                column.id === "useSuggestion" ? "centered-column-header" : ""
              }
              enableSorting
              enableColumnFiltering
              columnFiltersState={columnFilters}
              onColumnFiltersChange={setColumnFilters}
              sortingState={sorting}
              onSortingChange={setSorting}
              emptyMessage={emptyMessage}
            />
          </MatchingResultsContainer>
        </Dialog.CustomContent>
        <Dialog.Actions>
          <GeneralButton
            label="Save selected SMDA names"
            disabled={disabled || selectedCount === 0}
            isPending={isPending}
            onClick={applyProposals}
          />
          <CancelButton onClick={confirmClose.handleCloseRequest} />
        </Dialog.Actions>
      </EditDialog>
    </>
  );
}

function suggestionsBlockedReason({
  projectReadOnly,
  savedRmsWellboreNames,
  nonPlannedRmsWellboreNames,
  rmsWellboreNamesMissingSmda,
  availableSmdaHeaders,
  smdaHealthStatus,
  wellHeaders,
}: {
  projectReadOnly: boolean;
  savedRmsWellboreNames: string[];
  nonPlannedRmsWellboreNames: string[];
  rmsWellboreNamesMissingSmda: string[];
  availableSmdaHeaders: SmdaWellHeader[];
  smdaHealthStatus: boolean;
  wellHeaders: SmdaWellHeaders;
}) {
  if (projectReadOnly) {
    return "Project is read-only";
  }
  if (!savedRmsWellboreNames.length) {
    return "Save RMS wellbores before generating SMDA name suggestions";
  }
  if (!nonPlannedRmsWellboreNames.length) {
    return (
      "SMDA mapping is not available because all saved RMS wellbores are " +
      "planned"
    );
  }
  if (!rmsWellboreNamesMissingSmda.length) {
    return "All non-planned RMS wellbores already have an SMDA mapping";
  }
  if (!wellHeaders.hasFields) {
    return "Project masterdata must contain a field";
  }
  if (!smdaHealthStatus) {
    return smdaUnavailableReason;
  }
  if (wellHeaders.isError) {
    return "Some SMDA wellbore names could not be loaded";
  }
  if (wellHeaders.isLoading) {
    return "Loading SMDA wellbore names";
  }
  if (!availableSmdaHeaders.length) {
    return "All available SMDA wellbore names are already mapped";
  }

  return undefined;
}

export function SmdaMappings({
  savedRmsWellboreNames,
  nonPlannedRmsWellboreNames,
  mappings,
  wellHeaders,
  smdaHealthStatus,
  projectReadOnly,
  isSaving,
  saveMappings,
}: {
  savedRmsWellboreNames: string[];
  nonPlannedRmsWellboreNames: string[];
  mappings: InternalWellboreMappings;
  wellHeaders: SmdaWellHeaders;
  smdaHealthStatus: boolean;
  projectReadOnly: boolean;
  isSaving: boolean;
  saveMappings: SaveWellboreMappings;
}) {
  const [automaticMatchProposals, setAutomaticMatchProposals] = useState<
    AutomaticMatchProposal[] | null
  >(null);
  const [automaticMatchingSetupOpen, setAutomaticMatchingSetupOpen] =
    useState(false);
  const matchMutation = useMutation({
    ...matchPostMatchMutation(),
    meta: { errorPrefix: "Could not generate SMDA name suggestions" },
  });
  const { hasSmdaMappings, rmsWellboreNamesMissingSmda } = useMemo(() => {
    const mappedRmsWellboreNames = new Set(
      mappings
        .filter((mapping) => isSmdaWellboreMapping(mapping))
        .map((mapping) => mapping.source_id),
    );

    return {
      hasSmdaMappings: mappedRmsWellboreNames.size > 0,
      rmsWellboreNamesMissingSmda: nonPlannedRmsWellboreNames.filter(
        (rmsWellboreName) => !mappedRmsWellboreNames.has(rmsWellboreName),
      ),
    };
  }, [mappings, nonPlannedRmsWellboreNames]);
  const smdaTargetPairs = useMemo(
    () => wellboreSmdaTargetPairs(mappings),
    [mappings],
  );
  const availableSmdaHeaders = useMemo(() => {
    const mappedUuids = new Set(smdaTargetPairs.map((pair) => pair.targetUuid));

    return wellHeaders.smdaHeaders.filter(
      (header) => !mappedUuids.has(header.wellbore_uuid),
    );
  }, [wellHeaders.smdaHeaders, smdaTargetPairs]);
  const suggestionsBlocked = suggestionsBlockedReason({
    projectReadOnly,
    savedRmsWellboreNames,
    nonPlannedRmsWellboreNames,
    rmsWellboreNamesMissingSmda,
    availableSmdaHeaders,
    smdaHealthStatus,
    wellHeaders,
  });

  const startAutomaticMatching = (replacements: MatchReplacementRule[]) => {
    matchMutation.mutate(
      {
        body: {
          sources: rmsWellboreNamesMissingSmda,
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
        },
      },
    );
  };

  const toggleProposal = useCallback((rmsWellboreName: string) => {
    setAutomaticMatchProposals((proposals) =>
      proposals === null
        ? null
        : toggleMatchProposal(proposals, rmsWellboreName),
    );
  }, []);

  const applyAutomaticMatches = () => {
    if (automaticMatchProposals === null) {
      return;
    }

    saveMappings(
      applyAutomaticMatchProposals(mappings, automaticMatchProposals),
      {
        successMessage: "Selected SMDA names saved",
        onSuccess: () => {
          setAutomaticMatchProposals(null);
        },
      },
    );
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

      {automaticMatchProposals !== null && (
        <AutomaticMatchingDialog
          proposals={automaticMatchProposals}
          unmappedRmsWellboreCount={rmsWellboreNamesMissingSmda.length}
          disabled={projectReadOnly || isSaving}
          isPending={isSaving}
          closeDialog={() => {
            setAutomaticMatchProposals(null);
          }}
          applyProposals={applyAutomaticMatches}
          toggleProposal={toggleProposal}
        />
      )}

      <MappingAction
        title="SMDA names"
        description={
          hasSmdaMappings
            ? "Generate more suggestions or remove the current SMDA names."
            : "Get suggested SMDA names for non-planned RMS wellbores that " +
              "are not yet mapped."
        }
      >
        <GeneralButton
          label="Suggest SMDA names"
          disabled={Boolean(suggestionsBlocked) || matchMutation.isPending}
          isPending={matchMutation.isPending}
          tooltipText={suggestionsBlocked}
          onClick={() => {
            setAutomaticMatchingSetupOpen(true);
          }}
        />
        {hasSmdaMappings && (
          <RemoveMappingsAction
            operation="smda"
            mappingsAfterRemoval={() => removeSmdaMappings(mappings)}
            projectReadOnly={projectReadOnly}
            isSaving={isSaving}
            saveMappings={saveMappings}
          />
        )}
      </MappingAction>

      {suggestionsBlocked === smdaUnavailableReason && (
        <PageText>
          💡 To suggest SMDA names,{" "}
          <Link to="/project/mappings/wellbores" hash="smda-connection-details">
            review the SMDA connection requirements below.
          </Link>
        </PageText>
      )}
    </>
  );
}
