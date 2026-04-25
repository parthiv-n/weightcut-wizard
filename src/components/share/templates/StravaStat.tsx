// Shared minimal Strava-style stat row used by all share cards.
//
// Layout: small uppercase label centred above a huge bold white value, with
// optional accent colour for the value. Designed to stack vertically.

interface StravaStatProps {
  label: string;
  value: string;
  s: boolean; // story aspect (true = larger sizes)
  transparent?: boolean;
  accentColor?: string;
  /** Optional small unit shown next to the value (e.g. "kg"). */
  unit?: string;
}

export function StravaStat({ label, value, s, transparent, accentColor, unit }: StravaStatProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: s ? 4 : 2,
      }}
    >
      <div
        style={{
          fontSize: s ? 18 : 11,
          fontWeight: 700,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: transparent ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: s ? 96 : 44,
          fontWeight: 800,
          color: accentColor ?? "#ffffff",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: s ? 32 : 18,
              fontWeight: 700,
              color: "rgba(255,255,255,0.45)",
              marginLeft: 6,
              letterSpacing: 0,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

interface StravaPeriodLabelProps {
  text: string;
  s: boolean;
  transparent?: boolean;
}

/** Small uppercase period label, centred at the top of a Strava-style card. */
export function StravaPeriodLabel({ text, s, transparent }: StravaPeriodLabelProps) {
  return (
    <div style={{ marginBottom: s ? 40 : 16, textAlign: "center" }}>
      <div
        style={{
          fontSize: s ? 22 : 13,
          color: transparent ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.6)",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
    </div>
  );
}
