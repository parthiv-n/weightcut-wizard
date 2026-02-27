interface CardWatermarkProps {
  large?: boolean;
}

export function CardWatermark({ large = false }: CardWatermarkProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: large ? 44 : 32,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: large ? 20 : 14,
        fontWeight: 500,
        color: "rgba(255,255,255,0.25)",
        letterSpacing: "0.05em",
        pointerEvents: "none",
      }}
    >
      Made with WeightCut Wizard
    </div>
  );
}
