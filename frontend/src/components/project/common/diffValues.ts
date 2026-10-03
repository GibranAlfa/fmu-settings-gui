const MAPPING_FIELDS = [
  "source_system",
  "source_id",
  "source_uuid",
  "target_system",
  "target_id",
  "target_uuid",
  "mapping_type",
  "relation_type",
];

export function compactMappingValue(value: Record<string, unknown>) {
  if (
    !(
      "source_id" in value &&
      "source_system" in value &&
      "target_system" in value
    )
  ) {
    return value;
  }

  return Object.fromEntries(
    MAPPING_FIELDS.filter((field) => field in value).map((field) => [
      field,
      value[field],
    ]),
  );
}
