import assert from "node:assert/strict";
import test from "node:test";
import { getChangelogDetails, parseLegacyChange } from "../src/components/home/changelogDetails.ts";
import { compactMappingValue } from "../src/components/project/common/diffValues.ts";

test("structured values take precedence over embedded legacy text", () => {
  const differences = [{ field_path: "flag", before: false, after: true }];
  assert.deepEqual(getChangelogDetails({
    change: "Updated field 'flag'. Old value: wrong -> New value: wrong",
    structured_diff: differences,
  }), { kind: "structured", differences });
});

test("an empty structured diff never falls back to the string parser", () => {
  assert.deepEqual(getChangelogDetails({
    change: "Old value: misleading -> New value: misleading", structured_diff: [],
  }), { kind: "structured", differences: [] });
});

test("missing and null structured fields both use legacy values", () => {
  const change = "Updated field 'name'. Old value: O'Brien -> New value: None.";
  for (const entry of [{ change }, { change, structured_diff: null }]) {
    assert.deepEqual(getChangelogDetails(entry), {
      kind: "legacy", details: {
        summary: "Updated field 'name'", before: "O'Brien", after: "None.",
      },
    });
  }
});

test("legacy additions and events preserve the original text", () => {
  assert.deepEqual(parseLegacyChange("Added field 'x'. New value: False"), {
    summary: "Added field 'x'", after: "False",
  });
  assert.deepEqual(parseLegacyChange("Copied project revision."), {
    summary: "Copied project revision.",
  });
});

test("mapping values keep identifiers, UUIDs, systems and relationship context", () => {
  const item = {
    source_system: "rms", source_id: "A", source_uuid: null,
    target_system: "smda", target_id: null, target_uuid: null,
    mapping_type: "wellbore", relation_type: "unmappable", unrelated: "hidden",
  };
  const { unrelated, ...expected } = item;
  assert.deepEqual(compactMappingValue(item), expected);
  assert.deepEqual(compactMappingValue({ name: "A", uuid: "B" }), { name: "A", uuid: "B" });
});
