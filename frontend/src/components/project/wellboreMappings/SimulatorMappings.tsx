import { Dialog, TextField } from "@equinor/eds-core-react";
import { useMutation } from "@tanstack/react-query";
import { type ChangeEvent, useMemo, useState } from "react";
import { toast } from "react-toastify";

import type { InternalWellboreMappings } from "#client";
import {
  projectPostMappingsExportRmsSimulatorRenamingTableMutation,
  projectPostMappingsImportRmsEclipseCsvMutation,
} from "#client/@tanstack/react-query.gen";
import { OrphanWarningBox } from "#components/common";
import { CancelButton, GeneralButton } from "#components/form/button";
import type { SaveWellboreMappings } from "#services/mappings";
import { EditDialog, GenericDialog, PageText } from "#styles/common";
import {
  isRmsMapping,
  mergeImportedMappings,
  prepareImportedMappings,
  removeSimulatorMappings,
} from "./functions";
import { MappingAction } from "./MappingAction";
import { RemoveMappingsDialog } from "./RemoveMappingsDialog";
import type { PendingImport } from "./types";

const DEFAULT_IMPORT_PATH =
  "rms/input/well_modelling/well_info/rms_eclipse.csv";
const DEFAULT_EXPORT_PATH =
  "rms/input/well_modelling/well_info/rms_simulator.renaming_table";

function MappingFilePathDialog({
  operation,
  disabled,
  isPending,
  closeDialog,
  submitPath,
}: {
  operation: "import" | "export";
  disabled: boolean;
  isPending: boolean;
  closeDialog: () => void;
  submitPath: (path: string) => void;
}) {
  const [path, setPath] = useState("");
  const isImport = operation === "import";
  const defaultPath = isImport ? DEFAULT_IMPORT_PATH : DEFAULT_EXPORT_PATH;

  return (
    <EditDialog open={true} $width="42em">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) {
            submitPath(path.trim());
          }
        }}
      >
        <Dialog.Header>
          {isImport ? (
            <span>
              Import simulator names from <code>rms_eclipse.csv</code>
            </span>
          ) : (
            "Export simulator names to a renaming table"
          )}
        </Dialog.Header>
        <Dialog.CustomContent>
          <PageText>
            {isImport ? (
              <>
                Enter the path to the <code>rms_eclipse.csv</code> file
                containing the simulator names.
              </>
            ) : (
              "Choose where to save the renaming table containing the simulator names."
            )}{" "}
            The path starts from the project root. Leave it empty to use the
            default location shown below.
          </PageText>
          <TextField
            label="File path from project root"
            value={path}
            placeholder={defaultPath}
            helperText={`Default: ${defaultPath}`}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setPath(event.target.value);
            }}
          />
        </Dialog.CustomContent>
        <Dialog.Actions>
          <GeneralButton
            type="submit"
            label={
              isImport ? "Import simulator names" : "Export simulator names"
            }
            disabled={disabled}
            isPending={isPending}
          />
          <CancelButton onClick={closeDialog} />
        </Dialog.Actions>
      </form>
    </EditDialog>
  );
}

function ImportWarningDialog({
  pendingImport,
  disabled,
  isPending,
  closeDialog,
  saveImport,
}: {
  pendingImport: PendingImport;
  disabled: boolean;
  isPending: boolean;
  closeDialog: () => void;
  saveImport: () => void;
}) {
  const hasAcceptedMappings = pendingImport.mappings.some((mapping) =>
    isRmsMapping(mapping, "simulator"),
  );

  return (
    <GenericDialog open={true} $width="38em">
      <Dialog.Header>Some simulator names cannot be imported</Dialog.Header>
      <Dialog.CustomContent>
        <OrphanWarningBox
          message={
            "The file contains RMS wells that are not saved in this project. " +
            "Those rows will be skipped."
          }
          listItems={pendingImport.excludedRmsNames}
        />
        <PageText $marginBottom="0">
          {hasAcceptedMappings ? (
            "Import simulator names will import every simulator name in the " +
            "file that maps to an RMS well saved in this project."
          ) : (
            <>
              None of the RMS wells in <code>rms_eclipse.csv</code> are saved in
              this project, so no simulator names can be imported.
            </>
          )}
        </PageText>
      </Dialog.CustomContent>
      <Dialog.Actions>
        {hasAcceptedMappings ? (
          <>
            <GeneralButton
              label="Import simulator names"
              disabled={disabled}
              isPending={isPending}
              onClick={saveImport}
            />
            <CancelButton onClick={closeDialog} />
          </>
        ) : (
          <GeneralButton label="Close" onClick={closeDialog} />
        )}
      </Dialog.Actions>
    </GenericDialog>
  );
}

export function SimulatorMappings({
  mappings,
  savedRmsNames,
  projectReadOnly,
  isSaving,
  saveMappings,
}: {
  mappings: InternalWellboreMappings;
  savedRmsNames: string[];
  projectReadOnly: boolean;
  isSaving: boolean;
  saveMappings: SaveWellboreMappings;
}) {
  const [mappingFileOperation, setMappingFileOperation] = useState<
    "import" | "export"
  >();
  const [pendingImport, setPendingImport] = useState<PendingImport>();
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const importMutation = useMutation({
    ...projectPostMappingsImportRmsEclipseCsvMutation(),
    meta: { errorPrefix: "Could not import simulator names" },
  });
  const exportMutation = useMutation({
    ...projectPostMappingsExportRmsSimulatorRenamingTableMutation(),
    meta: {
      errorPrefix: "Could not export simulator names to a renaming table",
    },
  });
  const hasSimulatorMappings = useMemo(
    () => mappings.some((mapping) => isRmsMapping(mapping, "simulator")),
    [mappings],
  );

  const saveImportedMappings = (
    importedMappings: PendingImport["mappings"],
  ) => {
    saveMappings(mergeImportedMappings(mappings, importedMappings), {
      successMessage: "Simulator names imported",
      onSuccess: () => {
        setPendingImport(undefined);
      },
    });
  };

  const importMappings = (path: string) => {
    importMutation.mutate(
      { body: path ? { relative_path: path } : null },
      {
        onSuccess: (result) => {
          setMappingFileOperation(undefined);
          const prepared = prepareImportedMappings(
            result.wellbore ?? [],
            savedRmsNames,
          );
          if (prepared.excludedRmsNames.length) {
            setPendingImport(prepared);
          } else if (prepared.mappings.length) {
            saveImportedMappings(prepared.mappings);
          } else {
            toast.info(
              "The file does not contain any RMS wells saved in this project",
            );
          }
        },
      },
    );
  };

  const exportMappings = (path: string) => {
    exportMutation.mutate(
      { body: path ? { relative_path: path } : null },
      {
        onSuccess: (result) => {
          setMappingFileOperation(undefined);
          toast.info(result.message);
        },
      },
    );
  };

  const removeAllSimulatorMappings = () => {
    saveMappings(removeSimulatorMappings(mappings), {
      successMessage: "Simulator names removed",
      onSuccess: () => {
        setRemoveDialogOpen(false);
      },
    });
  };

  return (
    <>
      {pendingImport && (
        <ImportWarningDialog
          pendingImport={pendingImport}
          disabled={projectReadOnly || isSaving}
          isPending={isSaving}
          closeDialog={() => {
            setPendingImport(undefined);
          }}
          saveImport={() => {
            saveImportedMappings(pendingImport.mappings);
          }}
        />
      )}

      {mappingFileOperation && (
        <MappingFilePathDialog
          operation={mappingFileOperation}
          disabled={
            projectReadOnly ||
            (mappingFileOperation === "import"
              ? importMutation.isPending
              : exportMutation.isPending)
          }
          isPending={
            mappingFileOperation === "import"
              ? importMutation.isPending
              : exportMutation.isPending
          }
          closeDialog={() => {
            setMappingFileOperation(undefined);
          }}
          submitPath={
            mappingFileOperation === "import" ? importMappings : exportMappings
          }
        />
      )}

      {removeDialogOpen && (
        <RemoveMappingsDialog
          operation="simulator"
          disabled={projectReadOnly || isSaving}
          isPending={isSaving}
          closeDialog={() => {
            setRemoveDialogOpen(false);
          }}
          removeMappings={removeAllSimulatorMappings}
        />
      )}

      <MappingAction
        title="Simulator names"
        description={
          hasSimulatorMappings ? (
            "Export to a renaming table or clear the names."
          ) : (
            <>
              Import simulator names from an <code>rms_eclipse.csv</code> file.
            </>
          )
        }
      >
        {!hasSimulatorMappings && (
          <GeneralButton
            label="Import simulator names"
            disabled={
              projectReadOnly ||
              !savedRmsNames.length ||
              importMutation.isPending
            }
            isPending={importMutation.isPending}
            tooltipText={projectReadOnly ? "Project is read-only" : undefined}
            onClick={() => {
              setMappingFileOperation("import");
            }}
          />
        )}

        {hasSimulatorMappings && (
          <>
            <GeneralButton
              label="Export simulator names"
              disabled={projectReadOnly || exportMutation.isPending}
              isPending={exportMutation.isPending}
              tooltipText={projectReadOnly ? "Project is read-only" : undefined}
              onClick={() => {
                setMappingFileOperation("export");
              }}
            />
            <GeneralButton
              label="Remove all simulator names"
              variant="outlined"
              color="danger"
              disabled={projectReadOnly}
              tooltipText={projectReadOnly ? "Project is read-only" : undefined}
              onClick={() => {
                setRemoveDialogOpen(true);
              }}
            />
          </>
        )}
      </MappingAction>
    </>
  );
}
