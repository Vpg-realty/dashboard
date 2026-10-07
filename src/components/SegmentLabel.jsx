import { inkOn } from '../utils/marketShade.js';

// Recharts <LabelList content> for a market segment in a stacked rep bar:
// "AZ 45" centred in the segment, in ink that reads on that segment's shade.
// Recharts hands each label its own segment's Cell fill (and drops empty
// segments, so the label index can't be used to look the fill up). Segments
// too short to hold text stay unlabelled — the tooltip still names them.
export function segmentLabel(marketId, format = (v) => v) {
  return function SegmentLabel({ x, y, width, height, value, fill }) {
    if (!value || height < 15) return null;
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={700}
        fill={inkOn(fill)}
      >
        {width >= 44 ? `${marketId} ${format(value)}` : format(value)}
      </text>
    );
  };
}
