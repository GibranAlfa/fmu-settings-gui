import type {
  ListFieldDiff,
  ListUpdatedEntry,
  ScalarFieldDiff,
} from "#client/types.gen";
import { GenericInnerBox } from "#styles/common";
import { ReadableValue } from "../history/ReadableValue";
import {
  CardStack,
  ChangeValueGrid,
  DiffFieldHeader,
  DiffGroup,
  ValuePanel,
} from "../history/SnapshotHistory.style";
import type { DiffKind } from "../history/types";
import {
  formatFieldPath,
  formatInlineValue,
  getListItemKey,
  getScalarDiffKind,
  isListFieldDiff,
} from "../history/utils";
import { compactMappingValue } from "./diffValues";

function ListFieldGroup({
  kind,
  title,
  values,
}: {
  kind: DiffKind;
  title: string;
  values: Array<Record<string, unknown>>;
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <DiffGroup $kind={kind}>
      <DiffFieldHeader>
        <strong>
          {title} ({String(values.length)})
        </strong>
      </DiffFieldHeader>

      <CardStack>
        {values.map((item, idx) => (
          <ValuePanel key={`${title}-${String(idx)}-${getListItemKey(item)}`}>
            <ReadableValue value={compactMappingValue(item)} />
          </ValuePanel>
        ))}
      </CardStack>
    </DiffGroup>
  );
}

function UpdatedFieldGroup({ updated }: { updated: Array<ListUpdatedEntry> }) {
  if (updated.length === 0) {
    return null;
  }

  return (
    <DiffGroup $kind="updated">
      <DiffFieldHeader>
        <strong>Updated ({String(updated.length)})</strong>
      </DiffFieldHeader>

      <CardStack>
        {updated.map((item, idx) => (
          <GenericInnerBox
            key={`updated-${String(idx)}-${formatInlineValue(item.key)}`}
          >
            <ChangeValueGrid>
              <ValuePanel>
                <strong>Before</strong>
                <ReadableValue value={compactMappingValue(item.before)} />
              </ValuePanel>
              <ValuePanel>
                <strong>After</strong>
                <ReadableValue value={compactMappingValue(item.after)} />
              </ValuePanel>
            </ChangeValueGrid>
          </GenericInnerBox>
        ))}
      </CardStack>
    </DiffGroup>
  );
}

export function ResourceDiffCard({
  diff,
}: {
  diff: ScalarFieldDiff | ListFieldDiff;
}) {
  if (isListFieldDiff(diff)) {
    return (
      <GenericInnerBox>
        <DiffFieldHeader>
          <strong>
            {formatFieldPath(diff.field_path.replace(/\.root$/, ""))}
          </strong>
        </DiffFieldHeader>

        <CardStack>
          <ListFieldGroup kind="added" title="Added" values={diff.added} />
          <ListFieldGroup
            kind="removed"
            title="Removed"
            values={diff.removed}
          />
          <UpdatedFieldGroup updated={diff.updated} />
        </CardStack>
      </GenericInnerBox>
    );
  }

  const kind = getScalarDiffKind(diff);

  return (
    <GenericInnerBox>
      <DiffFieldHeader>
        <strong>{formatFieldPath(diff.field_path)}</strong>
      </DiffFieldHeader>

      <DiffGroup $kind={kind}>
        <DiffFieldHeader>
          <strong>{kind.charAt(0).toUpperCase() + kind.slice(1)} (1)</strong>
        </DiffFieldHeader>

        <ChangeValueGrid>
          <ValuePanel>
            <strong>Before</strong>
            <ReadableValue value={diff.before} />
          </ValuePanel>
          <ValuePanel>
            <strong>After</strong>
            <ReadableValue value={diff.after} />
          </ValuePanel>
        </ChangeValueGrid>
      </DiffGroup>
    </GenericInnerBox>
  );
}
