import type { JSX } from "react";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import {
  aggregatePositionsByCurrency,
  type CurrencyPairPosition,
} from "@rtc/domain";

import {
  bubblesHeight,
  computeBubbleLayout,
} from "#/ui/analytics/bubbleLayout";
import { NEGATIVE, POSITIVE } from "#/ui/analytics/colours";

const AREA_WIDTH = 320;

export function ExposureBubbles({
  positions,
}: ExposureBubblesProps): JSX.Element {
  const placed = computeBubbleLayout(aggregatePositionsByCurrency(positions), {
    width: AREA_WIDTH,
  });
  const height = bubblesHeight(placed);

  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${AREA_WIDTH} ${height}`}
      preserveAspectRatio="xMidYMin meet"
      testID="exposure-bubbles"
    >
      {placed.map((bubble) => {
        return (
          <Circle
            key={bubble.currency}
            testID={`exposure-bubble-${bubble.currency}`}
            cx={bubble.x}
            cy={bubble.y}
            r={bubble.radius}
            fill={bubble.sign === "pos" ? POSITIVE : NEGATIVE}
            fillOpacity={0.7}
          />
        );
      })}
      {placed.map((bubble) => {
        return (
          <SvgText
            key={`${bubble.currency}-label`}
            x={bubble.x}
            y={bubble.y}
            fontSize={11}
            fill="#ffffff"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {bubble.currency}
          </SvgText>
        );
      })}
    </Svg>
  );
}

interface ExposureBubblesProps {
  positions: readonly CurrencyPairPosition[];
}
