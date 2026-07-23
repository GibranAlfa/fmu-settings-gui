import { tokens } from "@equinor/eds-tokens";
import styled from "styled-components";

import type { DisplayedMatchQuality } from "./types";

export const MatchingResultsContainer = styled.div`
  .table-wrapper {
    width: 100%;

    thead th {
      height: 48px !important;
      vertical-align: middle !important;
    }

    thead th [class*="CellInner"] {
      height: 100% !important;
      padding-block: 0 !important;
    }

  }

  .centered-column-header [class*="CellInner"] {
    justify-content: center;
  }
`;

export const CenteredColumnContent = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
`;

export const ConfidenceBadge = styled.span<{
  $confidence: DisplayedMatchQuality;
}>`
  display: inline-block;
  min-width: 4.5rem;
  padding-block: ${tokens.spacings.comfortable.x_small};
  padding-inline: ${tokens.spacings.comfortable.small};
  border-radius: ${tokens.shape.corners.borderRadius};
  background: ${({ $confidence }) => {
    if ($confidence === "exact") {
      return tokens.colors.ui.background__info.hex;
    }
    if ($confidence === "high") {
      return tokens.colors.interactive.success__highlight.hex;
    }

    return tokens.colors.ui.background__warning.hex;
  }};
  color: ${tokens.colors.text.static_icons__default.hex};
  font-weight: 500;
  text-align: center;
  text-transform: capitalize;
`;
