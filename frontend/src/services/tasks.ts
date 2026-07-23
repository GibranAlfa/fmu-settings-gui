import { useQuery } from "@tanstack/react-query";

import { projectGetMappingsOptions } from "#client/@tanstack/react-query.gen";
import { mappingsPaths, useProject } from "#services/project";
import type { FileRouteTypes } from "../routeTree.gen";

export type Task = {
  id: string;
  label: string;
  done: boolean;
  to: FileRouteTypes["to"];
};

export function useTaskList(): Task[] {
  const project = useProject();
  const rmsWells = project.data?.config.rms?.wells ?? [];
  const nonPlannedRmsWellNames = rmsWells
    .filter((well) => !well.planned)
    .map((well) => well.name);
  const { data: stratigraphyMappings } = useQuery({
    ...projectGetMappingsOptions({ path: mappingsPaths.stratigraphyRms }),
    enabled: project.status,
  });
  const { data: wellboreMappings } = useQuery({
    ...projectGetMappingsOptions({ path: mappingsPaths.wellboreRms }),
    enabled: project.status && nonPlannedRmsWellNames.length > 0,
  });

  if (!project.status || !project.data) {
    return [];
  }

  const config = project.data.config;
  const zones = config.rms?.zones ?? [];
  const horizons = config.rms?.horizons ?? [];
  const mappedRmsIds = new Set(
    (stratigraphyMappings?.stratigraphy ?? [])
      .filter(
        (m) =>
          m.source_system === "rms" &&
          m.target_system === "smda" &&
          (m.relation_type === "primary" || m.relation_type === "unmappable"),
      )
      .map((m) => m.source_id),
  );
  const mappedRmsWellNames = new Set(
    (wellboreMappings?.wellbore ?? [])
      .filter(
        (mapping) =>
          mapping.source_system === "rms" &&
          mapping.target_system === "smda" &&
          (mapping.relation_type === "primary" ||
            mapping.relation_type === "unmappable"),
      )
      .map((mapping) => mapping.source_id),
  );

  return [
    {
      id: "model",
      label: "Set model information and access control",
      done: !!(config.model?.name && config.access?.asset.name),
      to: "/project",
    },
    {
      id: "masterdata",
      label: "Set masterdata",
      done: !!config.masterdata?.smda,
      to: "/project/masterdata",
    },
    {
      id: "rms",
      label: "Set RMS project",
      done: !!config.rms?.path,
      to: "/project/rms/overview",
    },
    {
      id: "rms-stratigraphy",
      label: "Set RMS stratigraphy",
      done: zones.length > 0 || horizons.length > 0,
      to: "/project/rms/stratigraphy",
    },
    {
      id: "mappings",
      label: "Set stratigraphy mappings",
      done:
        (zones.length > 0 || horizons.length > 0) &&
        [...zones, ...horizons].every((item) => mappedRmsIds.has(item.name)),
      to: "/project/mappings/stratigraphy",
    },
    {
      id: "wellbore-mappings",
      label: "Set wellbore to SMDA mappings",
      done:
        rmsWells.length > 0 &&
        nonPlannedRmsWellNames.every((name) => mappedRmsWellNames.has(name)),
      to: "/project/mappings/wellbores",
    },
  ];
}

export function useTaskPendingCount(): number {
  const tasks = useTaskList();

  return tasks.filter((t) => !t.done).length;
}
