import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import type { FieldItem, RmsProject } from "#client";
import { Loading, SmdaHealthCheckInfo } from "#components/common";
import { Overview } from "#components/project/wellboreMappings/Overview";
import { useProject } from "#services/project";
import { useSmdaHealthCheck } from "#services/smda";
import {
  PageContainerNotWidthConstrained,
  PageHeader,
  PageSectionWidthConstrained,
  PageText,
} from "#styles/common";

export const Route = createFileRoute("/project/mappings/wellbores")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageContainerNotWidthConstrained>
      <PageSectionWidthConstrained>
        <PageHeader>Wellbores</PageHeader>
      </PageSectionWidthConstrained>

      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </PageContainerNotWidthConstrained>
  );
}

function Content() {
  const project = useProject();

  if (!project.status) {
    return (
      <PageSectionWidthConstrained>
        <PageText>Project not set.</PageText>
      </PageSectionWidthConstrained>
    );
  }

  const rmsProject = project.data?.config.rms;
  if (!rmsProject) {
    return (
      <PageSectionWidthConstrained>
        <PageText>No RMS project is selected.</PageText>
      </PageSectionWidthConstrained>
    );
  }

  return (
    <RmsProjectContent
      rmsProject={rmsProject}
      fields={project.data?.config.masterdata?.smda.field ?? []}
      projectReadOnly={!(project.lockStatus?.is_lock_acquired ?? false)}
    />
  );
}

function RmsProjectContent({
  rmsProject,
  fields,
  projectReadOnly,
}: {
  rmsProject: RmsProject;
  fields: FieldItem[];
  projectReadOnly: boolean;
}) {
  const { data: healthCheck } = useSmdaHealthCheck();
  const { setRequestAcquireSsoAccessToken } = Route.useRouteContext();

  return (
    <>
      <Overview
        rmsProject={rmsProject}
        fields={fields}
        smdaHealthStatus={healthCheck.status}
        projectReadOnly={projectReadOnly}
      />

      <PageSectionWidthConstrained>
        {!healthCheck.status && (
          <SmdaHealthCheckInfo
            feature="suggesting SMDA wellbore names"
            healthCheck={healthCheck}
            setRequestAcquireSsoAccessToken={setRequestAcquireSsoAccessToken}
          />
        )}
      </PageSectionWidthConstrained>
    </>
  );
}
