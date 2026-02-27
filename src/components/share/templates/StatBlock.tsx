interface StatBlockProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  size?: "default" | "medium" | "large";
}

const SIZES = {
  default: { radius: 16, padding: "16px 20px", labelFs: 12, labelMb: 6, valueFs: 28, unitFs: 14, gap: 4, square: false },
  medium:  { radius: 20, padding: "22px 24px", labelFs: 15, labelMb: 8,  valueFs: 34, unitFs: 16, gap: 5, square: false },
  large:   { radius: 24, padding: "28px 28px", labelFs: 16, labelMb: 12, valueFs: 44, unitFs: 20, gap: 6, square: true },
};

export function StatBlock({ label, value, unit, color, size = "default" }: StatBlockProps) {
  const t = SIZES[size];

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: t.radius,
        padding: t.padding,
        border: "1px solid rgba(255,255,255,0.08)",
        aspectRatio: t.square ? "1/1" : undefined,
        display: "flex",
        flexDirection: "column",
        justifyContent: t.square ? "center" : undefined,
      }}
    >
      <div
        style={{
          fontSize: t.labelFs,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.45)",
          marginBottom: t.labelMb,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: t.gap }}>
        <span
          style={{
            fontSize: t.valueFs,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: color ?? "#ffffff",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: t.unitFs,
              fontWeight: 600,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
