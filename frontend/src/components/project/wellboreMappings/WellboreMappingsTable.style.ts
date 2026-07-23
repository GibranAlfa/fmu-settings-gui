import { tokens } from "@equinor/eds-tokens";
import styled from "styled-components";

export const WellboreMappingsContainer = styled.div`
  width: fit-content;
  max-width: 100%;
  margin-bottom: ${tokens.spacings.comfortable.medium};

  .table-wrapper {
    thead th {
      height: 48px !important;
      vertical-align: middle !important;
    }

    thead th [class*="CellInner"] {
      height: 100% !important;
      padding-block: 0 !important;
      gap: ${tokens.spacings.comfortable.small};
    }

    thead th [class*="SortButton"] {
      width: auto !important;
    }

    thead th.persistent-filter [class*="FilterVisibility"] {
      opacity: 1 !important;
    }
  }

  tbody tr.editable-row {
    cursor: pointer;

    &:hover td {
      background: ${tokens.colors.ui.background__light.hex};
    }
  }
`;

export const MappingEditFields = styled.div`
  display: grid;
  gap: ${tokens.spacings.comfortable.medium};
`;

export const SmdaOptionDivider = styled.hr`
  width: 100%;
  border-top: dashed 1px currentColor;
`;
