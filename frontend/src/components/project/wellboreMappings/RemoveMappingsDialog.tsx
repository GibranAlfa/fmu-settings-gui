import { Dialog } from "@equinor/eds-core-react";

import { CancelButton, GeneralButton } from "#components/form/button";
import { GenericDialog, PageText } from "#styles/common";
import { wellboreSmdaOptions } from "./functions";

export function RemoveMappingsDialog({
  operation,
  disabled,
  isPending,
  closeDialog,
  removeMappings,
}: {
  operation: "simulator" | "smda";
  disabled: boolean;
  isPending: boolean;
  closeDialog: () => void;
  removeMappings: () => void;
}) {
  const mappingName = operation === "smda" ? "SMDA" : "simulator";
  const removeMappingsDialogContent = {
    header: `Remove all ${mappingName} names`,
    description:
      operation === "smda"
        ? "This clears all SMDA names and “" +
          `${wellboreSmdaOptions.unmappable.label}” selections. RMS and ` +
          "simulator names will stay unchanged."
        : "This clears all simulator names from the wellbore mappings. " +
          "RMS and SMDA names will stay unchanged.",
    question: `Do you want to remove all ${mappingName} names?`,
    buttonLabel: `Remove all ${mappingName} names`,
  };

  return (
    <GenericDialog open={true} $width="34em">
      <Dialog.Header>{removeMappingsDialogContent.header}</Dialog.Header>
      <Dialog.CustomContent>
        <PageText>{removeMappingsDialogContent.description}</PageText>
        <PageText $marginBottom="0">
          {removeMappingsDialogContent.question}
        </PageText>
      </Dialog.CustomContent>
      <Dialog.Actions>
        <GeneralButton
          label={removeMappingsDialogContent.buttonLabel}
          color="danger"
          disabled={disabled}
          isPending={isPending}
          onClick={removeMappings}
        />
        <CancelButton onClick={closeDialog} />
      </Dialog.Actions>
    </GenericDialog>
  );
}
