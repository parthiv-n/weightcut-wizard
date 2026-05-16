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
  /** Font-size multiplier applied to label, value, and unit. Defaults to 1.
   *  Lets a specific card pump up the type (e.g. the gym progress card uses
   *  1.2 for higher Instagram-story legibility) without altering the
   *  baseline that every other share card already depends on. */
  scale?: number;
}

export function StravaStat({ label, value, s, transparent, accentColor, unit, scale = 1 }: StravaStatProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: (s ? 4 : 2) * scale,
      }}
    >
      <div
        style={{
          fontSize: (s ? 18 : 11) * scale,
          fontWeight: 700,
          letterSpacing: "0.15em",
          // `letter-spacing` adds an invisible trailing space after the last
          // glyph that `textAlign: center` treats as part of the inline box,
          // shifting visible characters half the letter-spacing to the left.
          // Padding the same amount on the start cancels the offset so the
          // visible label sits dead-centre above the value below it.
          paddingLeft: "0.15em",
          textTransform: "uppercase",
          color: transparent ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: (s ? 96 : 44) * scale,
          fontWeight: 800,
          color: accentColor ?? "#ffffff",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          // Negative letter-spacing pulls characters left, so visible glyphs
          // sit slightly right of true centre. Matching padding on the right
          // brings them back. Combined with the label's compensating left
          // padding above, the value and its label share a centreline.
          paddingRight: "0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: (s ? 32 : 18) * scale,
              fontWeight: 700,
              color: "rgba(255,255,255,0.45)",
              marginLeft: 6 * scale,
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
