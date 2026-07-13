import { Autocomplete, Dialog, List } from "@equinor/eds-core-react";
import { type ColumnDef, EdsDataGrid } from "@equinor/eds-data-grid-react";
import { createFormHook } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { z } from "zod";

import type {
  InternalWellboreMappings,
  RmsWell,
  SmdaWellHeader,
} from "#client";
import { ConfirmCloseDialog } from "#components/common";
import { CancelButton, SubmitButton } from "#components/form/button";
import { type OptionProps, TextField } from "#components/form/field";
import {
  emptyName,
  getOtherSourceUsingTargetUuid,
  noWellboreName,
  type SourceTargetPair,
} from "#components/project/mapping/utils";
import type { SaveWellboreMappings } from "#services/mappings";
import {
  EditDialog,
  PageCode,
  PageList,
  PageSectionWidthConstrained,
  PageText,
} from "#styles/common";
import { fieldContext, formContext } from "#utils/form";
import { stringCompare } from "#utils/string";
import { useConfirmClose } from "#utils/ui";
import {
  createWellboreMappingRows,
  gridHeight,
  isRmsMapping,
  updateWellboreMapping,
  wellboreSmdaOptions,
  wellboreSmdaTargetPairs,
} from "./functions";
import type { WellboreMappingFormValue, WellboreMappingRow } from "./types";
import {
  MappingEditFields,
  SmdaOptionDivider,
  WellboreMappingsContainer,
} from "./WellboreMappingsTable.style";

const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { CancelButton, SubmitButton },
});

type ColumnFilters = Array<{ id: string; value: unknown }>;
const WELLBORE_MAPPINGS_GRID_MAX_HEIGHT = 480;

function wellboreMappingDisplayValue(
  row: WellboreMappingRow,
  columnId: string,
) {
  if (columnId === "rmsName") {
    return row.rmsName;
  }
  if (columnId === "simulatorName") {
    return row.simulatorName || emptyName;
  }

  return row.unmappable ? noWellboreName : row.smdaName || emptyName;
}

function matchesColumnFilters(
  row: WellboreMappingRow,
  columnFilters: ColumnFilters,
) {
  return columnFilters.every(({ id, value }) => {
    const filterValues = (Array.isArray(value) ? value : [value]).filter(
      Boolean,
    );

    return (
      filterValues.length === 0 ||
      filterValues.includes(wellboreMappingDisplayValue(row, id))
    );
  });
}

function smdaOptions(
  row: WellboreMappingRow,
  headers: SmdaWellHeader[],
): OptionProps[] {
  const options: OptionProps[] = [
    wellboreSmdaOptions.empty,
    wellboreSmdaOptions.unmappable,
  ];

  if (headers.length) {
    options.push(wellboreSmdaOptions.divider);
  }

  if (
    row.smdaUuid &&
    !headers.some((header) => header.wellbore_uuid === row.smdaUuid)
  ) {
    options.push({
      value: row.smdaUuid,
      label: `${row.smdaName} (not available in current SMDA results)`,
    });
  }

  return [
    ...options,
    ...headers
      .map((header) => ({
        value: header.wellbore_uuid,
        label: header.unique_wellbore_identifier,
      }))
      .sort((a, b) => stringCompare(a.label, b.label)),
  ];
}

function EditMappingDialog({
  row,
  mappings,
  smdaHeaders,
  smdaTargetPairs,
  projectReadOnly,
  isPending,
  closeDialog,
  saveMapping,
}: {
  row: WellboreMappingRow;
  mappings: InternalWellboreMappings;
  smdaHeaders: SmdaWellHeader[];
  smdaTargetPairs: SourceTargetPair[];
  projectReadOnly: boolean;
  isPending: boolean;
  closeDialog: () => void;
  saveMapping: (
    row: WellboreMappingRow,
    value: WellboreMappingFormValue,
  ) => void;
}) {
  const form = useAppForm({
    defaultValues: {
      simulatorName: row.simulatorName,
      smdaUuid: row.unmappable
        ? wellboreSmdaOptions.unmappable.value
        : row.smdaUuid,
    },
    onSubmit: ({ value }) => {
      if (!projectReadOnly) {
        saveMapping(row, value);
      }
    },
  });
  const confirmClose = useConfirmClose({
    enable: !projectReadOnly,
    determineRequiresConfirmation: () =>
      !projectReadOnly && !form.state.isDefaultValue,
    onCloseConfirmed: () => {
      form.reset();
      closeDialog();
    },
  });
  const options = useMemo(
    () => smdaOptions(row, smdaHeaders),
    [row, smdaHeaders],
  );
  const simulatorNameValidation = z
    .string()
    .refine(
      (simulatorName) =>
        !simulatorName.trim() ||
        !mappings.some(
          (mapping) =>
            mapping.source_id !== row.rmsName &&
            isRmsMapping(mapping, "simulator") &&
            mapping.relation_type === "primary" &&
            mapping.target_id === simulatorName.trim(),
        ),
      {
        error: "This simulator name is already mapped to another RMS well",
      },
    );

  return (
    <>
      <ConfirmCloseDialog
        isOpen={confirmClose.confirmCloseDialogOpen}
        handleConfirmCloseDecision={confirmClose.handleDecision}
      />

      <EditDialog
        open={true}
        isDismissable={true}
        onClose={confirmClose.handleCloseRequest}
        $width="26em"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <Dialog.Header>Edit mappings for {row.rmsName}</Dialog.Header>

          <Dialog.CustomContent>
            <MappingEditFields>
              <form.AppField
                name="simulatorName"
                validators={{
                  onMount: simulatorNameValidation,
                  onBlur: simulatorNameValidation,
                  onSubmit: simulatorNameValidation,
                }}
              >
                {(field) => (
                  <field.TextField
                    label="Simulator name"
                    placeholder={emptyName}
                  />
                )}
              </form.AppField>

              <form.AppField name="smdaUuid">
                {(field) => {
                  const selectedOption = options.find(
                    (option) => option.value === field.state.value,
                  );

                  return (
                    <Autocomplete<OptionProps>
                      label="SMDA name"
                      options={options}
                      disabled={row.planned}
                      helperText={
                        row.planned
                          ? "SMDA mapping is disabled because this is a planned well."
                          : smdaTargetPairs.some(
                                (pair) => pair.sourceId !== row.rmsName,
                              )
                            ? "SMDA names that are already mapped to another " +
                              "RMS well cannot be selected."
                            : undefined
                      }
                      selectedOptions={selectedOption ? [selectedOption] : []}
                      optionLabel={(option) => option.label}
                      optionComponent={(option) =>
                        option.value === wellboreSmdaOptions.divider.value ? (
                          <SmdaOptionDivider />
                        ) : undefined
                      }
                      optionDisabled={(option) =>
                        option.value === wellboreSmdaOptions.divider.value ||
                        Boolean(
                          getOtherSourceUsingTargetUuid(
                            smdaTargetPairs,
                            option.value,
                            row.rmsName,
                          ),
                        )
                      }
                      itemToKey={(option) => option?.value}
                      noOptionsText="No SMDA names found"
                      autoWidth={true}
                      dropdownHeight={400}
                      onOptionsChange={({ selectedItems }) => {
                        field.handleChange(selectedItems[0]?.value ?? "");
                      }}
                      onClear={() => {
                        field.handleChange("");
                      }}
                    />
                  );
                }}
              </form.AppField>
            </MappingEditFields>
          </Dialog.CustomContent>

          <Dialog.Actions>
            <form.AppForm>
              <form.Subscribe
                selector={(state) => [state.isDefaultValue, state.canSubmit]}
              >
                {([isDefaultValue, canSubmit]) => (
                  <>
                    <form.SubmitButton
                      label="Save"
                      disabled={
                        isDefaultValue ||
                        !canSubmit ||
                        projectReadOnly ||
                        isPending
                      }
                      isPending={isPending}
                      helperTextDisabled={
                        projectReadOnly
                          ? "Project is read-only"
                          : "Form can be saved when the values have changed"
                      }
                    />
                    <form.CancelButton
                      onClick={(event) => {
                        event.preventDefault();
                        confirmClose.handleCloseRequest();
                      }}
                    />
                  </>
                )}
              </form.Subscribe>
            </form.AppForm>
          </Dialog.Actions>
        </form>
      </EditDialog>
    </>
  );
}

export function WellboreMappingsTable({
  rmsWells,
  mappings,
  smdaHeaders,
  projectReadOnly,
  isSaving,
  saveMappings,
}: {
  rmsWells: RmsWell[];
  mappings: InternalWellboreMappings;
  smdaHeaders: SmdaWellHeader[];
  projectReadOnly: boolean;
  isSaving: boolean;
  saveMappings: SaveWellboreMappings;
}) {
  const [activeRow, setActiveRow] = useState<WellboreMappingRow>();
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>(
    [],
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>([]);
  const rows = useMemo(
    () => createWellboreMappingRows(rmsWells, mappings),
    [rmsWells, mappings],
  );
  const smdaTargetPairs = useMemo(
    () => wellboreSmdaTargetPairs(mappings),
    [mappings],
  );
  const filteredRowCount = useMemo(
    () => rows.filter((row) => matchesColumnFilters(row, columnFilters)).length,
    [columnFilters, rows],
  );
  const columns: ColumnDef<WellboreMappingRow>[] = [
    {
      accessorKey: "rmsName",
      header: "RMS",
      size: 210,
    },
    {
      id: "simulatorName",
      accessorFn: (row) => wellboreMappingDisplayValue(row, "simulatorName"),
      header: "Simulator",
      size: 210,
      cell: ({ getValue }) => getValue<string>(),
    },
    {
      id: "smdaName",
      accessorFn: (row) => wellboreMappingDisplayValue(row, "smdaName"),
      header: "SMDA",
      size: 210,
      sortingFn: (rowA, rowB) => {
        const valueForSorting = (row: WellboreMappingRow) => {
          if (!row.smdaName && !row.unmappable) {
            return { rank: 0, name: "" };
          }
          if (row.unmappable) {
            return {
              rank: 1,
              name: noWellboreName,
            };
          }

          return { rank: 2, name: row.smdaName };
        };
        const valueA = valueForSorting(rowA.original);
        const valueB = valueForSorting(rowB.original);

        return (
          valueA.rank - valueB.rank || stringCompare(valueA.name, valueB.name)
        );
      },
      cell: ({ getValue }) => getValue<string>(),
    },
  ];

  const saveEditedMapping = (
    row: WellboreMappingRow,
    value: WellboreMappingFormValue,
  ) => {
    saveMappings(updateWellboreMapping(mappings, row, value, smdaHeaders), {
      successMessage: "Wellbore mappings saved",
      onSuccess: () => {
        setActiveRow(undefined);
      },
    });
  };

  return (
    <>
      {activeRow && (
        <EditMappingDialog
          key={activeRow.id}
          row={activeRow}
          mappings={mappings}
          smdaHeaders={smdaHeaders}
          smdaTargetPairs={smdaTargetPairs}
          projectReadOnly={projectReadOnly}
          isPending={isSaving}
          closeDialog={() => {
            setActiveRow(undefined);
          }}
          saveMapping={saveEditedMapping}
        />
      )}

      {!projectReadOnly && rows.length > 0 && (
        <PageSectionWidthConstrained>
          <PageText>
            Select a row to edit its simulator and SMDA names. SMDA mapping is
            disabled for planned wells.
          </PageText>
        </PageSectionWidthConstrained>
      )}

      {rows.length ? (
        <>
          <WellboreMappingsContainer>
            <EdsDataGrid
              stickyHeader
              enableVirtual
              height={gridHeight(
                filteredRowCount,
                WELLBORE_MAPPINGS_GRID_MAX_HEIGHT,
              )}
              rows={rows}
              columns={columns}
              getRowId={(row) => row.id}
              headerClass={(column) =>
                column.id === "rmsName" ? "persistent-filter" : ""
              }
              enableSorting
              sortingState={sorting}
              onSortingChange={setSorting}
              enableColumnFiltering
              columnFiltersState={columnFilters}
              onColumnFiltersChange={setColumnFilters}
              rowClass={() => (projectReadOnly ? "" : "editable-row")}
              onRowClick={(selectedRow) => {
                if (!projectReadOnly) {
                  setActiveRow(selectedRow.original);
                }
              }}
              emptyMessage="No RMS wells are available for mapping."
            />
          </WellboreMappingsContainer>

          <PageSectionWidthConstrained>
            <PageText $marginBottom="0">💡 Tips</PageText>
            <PageList>
              <List.Item>Select a column title to sort the table.</List.Item>
              <List.Item>
                Hover over a column title and select the filter icon to filter
                its values.
              </List.Item>
              <List.Item>
                For example, filter SMDA by{" "}
                <span className="emphasis">{emptyName}</span> to find wells
                without an SMDA mapping.
              </List.Item>
            </PageList>
          </PageSectionWidthConstrained>
        </>
      ) : (
        <PageSectionWidthConstrained>
          <PageCode>
            No RMS wells are currently included for wellbore mapping.
          </PageCode>
        </PageSectionWidthConstrained>
      )}
    </>
  );
}
