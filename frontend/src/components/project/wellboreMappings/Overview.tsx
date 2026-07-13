import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import type { FieldItem, RmsProject } from "#client";
import { useWellboreMappings } from "#services/mappings";
import { useSmdaWellHeaders } from "#services/smda";
import {
  PageSectionWidthConstrained,
  PageText,
  WarningBox,
} from "#styles/common";
import { nonPlannedRmsWellNames, savedRmsWellNames } from "./functions";
import { MappingActions } from "./Overview.style";
import { SimulatorMappings } from "./SimulatorMappings";
import { SmdaMappings } from "./SmdaMappings";
import { WellboreMappingsTable } from "./WellboreMappingsTable";

export function Overview({
  rmsProject,
  fields,
  smdaHealthStatus,
  projectReadOnly,
}: {
  rmsProject: RmsProject;
  fields: FieldItem[];
  smdaHealthStatus: boolean;
  projectReadOnly: boolean;
}) {
  const rmsWells = useMemo(() => rmsProject.wells ?? [], [rmsProject.wells]);
  const savedRmsNames = useMemo(() => savedRmsWellNames(rmsWells), [rmsWells]);
  const nonPlannedRmsNames = useMemo(
    () => nonPlannedRmsWellNames(rmsWells),
    [rmsWells],
  );

  const { mappings, saveMappings, isSaving } = useWellboreMappings();
  const {
    smdaHeaders,
    isLoading: wellHeadersLoading,
    isError: wellHeadersError,
    hasFields,
  } = useSmdaWellHeaders({
    fields,
    enabled:
      smdaHealthStatus && !projectReadOnly && nonPlannedRmsNames.length > 0,
  });

  return (
    <>
      <PageSectionWidthConstrained>
        <PageText>
          Add simulator names and official SMDA names to the RMS wells saved in
          this project. Planned wells cannot be matched to SMDA names.
        </PageText>
      </PageSectionWidthConstrained>

      <MappingActions>
        <SimulatorMappings
          mappings={mappings}
          savedRmsNames={savedRmsNames}
          projectReadOnly={projectReadOnly}
          isSaving={isSaving}
          saveMappings={saveMappings}
        />
        <SmdaMappings
          rmsWells={rmsWells}
          mappings={mappings}
          smdaHeaders={smdaHeaders}
          hasFields={hasFields}
          smdaHealthStatus={smdaHealthStatus}
          wellHeadersLoading={wellHeadersLoading}
          wellHeadersError={wellHeadersError}
          projectReadOnly={projectReadOnly}
          isSaving={isSaving}
          saveMappings={saveMappings}
        />
      </MappingActions>

      {!hasFields && nonPlannedRmsNames.length > 0 && (
        <PageSectionWidthConstrained>
          <WarningBox>
            <PageText $marginBottom="0">
              No field is set in the masterdata.{" "}
              <Link to="/project/masterdata">Add a field</Link> to enable
              matching RMS wells to SMDA names.
            </PageText>
          </WarningBox>
        </PageSectionWidthConstrained>
      )}

      <WellboreMappingsTable
        rmsWells={rmsWells}
        mappings={mappings}
        smdaHeaders={smdaHeaders}
        projectReadOnly={projectReadOnly}
        isSaving={isSaving}
        saveMappings={saveMappings}
      />
    </>
  );
}
