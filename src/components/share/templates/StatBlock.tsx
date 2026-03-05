interface StatBlockProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  size?: "default" | "medium" | "large";
  transparent?: boolean;
}

const SIZES = {
  default: { radius: 16, padding: "16px 20px", labelFs: 13, labelMb: 6, valueFs: 32, unitFs: 15, gap: 4, square: false },
  medium:  { radius: 20, padding: "22px 24px", labelFs: 16, labelMb: 8,  valueFs: 40, unitFs: 18, gap: 5, square: false },
  large:   { radius: 24, padding: "28px 28px", labelFs: 16, labelMb: 12, valueFs: 44, unitFs: 20, gap: 6, square: true },
};

export function StatBlock({ label, value, unit, color, size = "default", transparent }: StatBlockProps) {
  const t = SIZES[size];

  return (
    <div
      style={{
        background: transparent ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.07)",
        borderRadius: t.radius,
        padding: t.padding,
        border: transparent ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.12)",
        aspectRatio: t.square ? "1/1" : undefined,
        display: "flex",
        flexDirection: "column",
        justifyContent: t.square ? "center" : undefined,
      }}
    >
      <div
        style={{
          fontSize: t.labelFs,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: transparent ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.65)",
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
              fontWeight: 700,
              color: transparent ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.65)",
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
