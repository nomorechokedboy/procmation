import * as m from "@/paraglide/messages";

type Point = { day: string; started: number };

const WIDTH = 600;
const HEIGHT = 160;
const PAD_LEFT = 28;
const PAD_BOTTOM = 20;
const PAD_TOP = 8;
const GRID_LINES = 3;
const GAP = 2;
const MAX_BAR = 16;

function niceMax(value: number): number {
  return Math.max(GRID_LINES, Math.ceil(value / GRID_LINES) * GRID_LINES);
}

// Cases started per day. One series, so no legend; the title names it and the
// table below gives the same numbers for anyone who cannot read the bars.
export function StartedChart({ points }: { points: Point[] }) {
  const top = niceMax(Math.max(0, ...points.map((point) => point.started)));
  const plotWidth = WIDTH - PAD_LEFT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotWidth / Math.max(1, points.length);
  const barWidth = Math.min(MAX_BAR, Math.max(2, slot - GAP));
  const first = points[0]?.day;
  const last = points.at(-1)?.day;

  return (
    <div data-testid="started-chart">
      <svg
        aria-label={m.reports_chart_title()}
        className="w-full"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {Array.from({ length: GRID_LINES + 1 }, (_, index) => {
          const value = (top / GRID_LINES) * index;
          const y = PAD_TOP + plotHeight - (value / top) * plotHeight;
          return (
            <g key={value}>
              <line
                className="stroke-border"
                strokeWidth={1}
                x1={PAD_LEFT}
                x2={WIDTH}
                y1={y}
                y2={y}
              />
              <text
                className="fill-muted-foreground"
                fontSize={10}
                textAnchor="end"
                x={PAD_LEFT - 6}
                y={y + 3}
              >
                {value}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const height = (point.started / top) * plotHeight;
          const x = PAD_LEFT + index * slot + (slot - barWidth) / 2;
          return (
            <g key={point.day}>
              <title>{`${point.day}: ${point.started}`}</title>
              {/* A wide invisible target, so thin bars are easy to hover */}
              <rect
                fill="transparent"
                height={plotHeight}
                width={slot}
                x={PAD_LEFT + index * slot}
                y={PAD_TOP}
              />
              {point.started > 0 ? (
                <rect
                  fill="var(--chart-1)"
                  height={height}
                  rx={Math.min(4, barWidth / 2)}
                  width={barWidth}
                  x={x}
                  y={PAD_TOP + plotHeight - height}
                />
              ) : null}
            </g>
          );
        })}
        <text
          className="fill-muted-foreground"
          fontSize={10}
          x={PAD_LEFT}
          y={HEIGHT - 4}
        >
          {first}
        </text>
        <text
          className="fill-muted-foreground"
          fontSize={10}
          textAnchor="end"
          x={WIDTH}
          y={HEIGHT - 4}
        >
          {last}
        </text>
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          {m.reports_chart_table()}
        </summary>
        <table className="mt-2 w-full max-w-xs">
          <thead>
            <tr className="text-left text-muted-foreground text-xs">
              <th className="font-normal">{m.reports_col_day()}</th>
              <th className="text-right font-normal">
                {m.reports_col_started()}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.day}>
                <td>{point.day}</td>
                <td className="text-right tabular-nums">{point.started}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
