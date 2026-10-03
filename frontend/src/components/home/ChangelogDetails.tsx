import type { ChangeInfo } from "#client/types.gen";
import { ResourceDiffCard } from "#components/project/common/ResourceDiffCard";
import {
  CardStack,
  ChangeValueGrid,
  ValuePanel,
} from "#components/project/history/SnapshotHistory.style";
import { getChangelogDetails } from "./changelogDetails";

export function ChangelogDetails({ entry }: { entry: ChangeInfo }) {
  const content = getChangelogDetails(entry);

  return (
    <details>
      <summary>View details</summary>
      {content.kind === "structured" ? (
        content.differences.length === 0 ? (
          <p>No value changes.</p>
        ) : (
          <CardStack>
            {content.differences.map((diff) => (
              <ResourceDiffCard key={diff.field_path} diff={diff} />
            ))}
          </CardStack>
        )
      ) : (
        <>
          <p>{content.details.summary}</p>
          <ChangeValueGrid>
            {content.details.before !== undefined && (
              <ValuePanel>
                <strong>Before</strong>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {content.details.before}
                </pre>
              </ValuePanel>
            )}
            {content.details.after !== undefined && (
              <ValuePanel>
                <strong>After</strong>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {content.details.after}
                </pre>
              </ValuePanel>
            )}
          </ChangeValueGrid>
        </>
      )}
    </details>
  );
}
