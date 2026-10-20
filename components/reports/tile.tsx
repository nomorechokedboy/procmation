import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type TileProps = {
  label: string;
  value: string;
  note?: string;
  testId: string;
  alert?: boolean;
};

// A headline number. Nothing to plot, so it is a tile and not a chart.
export function Tile({ label, value, note, testId, alert }: TileProps) {
  return (
    <Card className="gap-1 py-4" data-testid={testId}>
      <CardHeader className="gap-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            alert
              ? "font-semibold text-2xl text-destructive tabular-nums"
              : "font-semibold text-2xl tabular-nums"
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      {note ? (
        <CardContent className="text-muted-foreground text-xs">
          {note}
        </CardContent>
      ) : null}
    </Card>
  );
}
