import { ReactNode, forwardRef } from "react";
import { CardWatermark } from "./CardWatermark";
import wizardLogo from "@/assets/wizard-logo.png";

export type AspectRatio = "square" | "story";

interface CardShellProps {
  children: ReactNode;
  aspect?: AspectRatio;
  isPremium?: boolean;
}

const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

export const CardShell = forwardRef<HTMLDivElement, CardShellProps>(
  ({ children, aspect = "square", isPremium = false }, ref) => {
    const { width, height } = DIMENSIONS[aspect];
    const s = aspect === "story";

    return (
      <div
        ref={ref}
        style={{
          width,
          height,
          position: "relative",
          overflow: "hidden",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#ffffff",
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(37,99,235,0.15) 0%, transparent 50%), " +
            "radial-gradient(ellipse at 80% 100%, rgba(96,165,250,0.1) 0%, transparent 50%), " +
            "linear-gradient(180deg, #0a0a0a 0%, #080808 50%, #050505 100%)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar: logo + branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: s ? 16 : 12,
            padding: s ? "64px 56px 0" : "40px 40px 0",
          }}
        >
          <img
            src={wizardLogo}
            alt=""
            style={{
              width: s ? 64 : 40,
              height: s ? 64 : 40,
              borderRadius: s ? 16 : 10,
            }}
          />
          <span
            style={{
              fontSize: s ? 28 : 18,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            WeightCut Wizard
          </span>
        </div>

        {/* Card content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: s ? "40px 56px 100px" : "24px 40px 72px",
            justifyContent: s ? "center" : "flex-start",
          }}
        >
          {children}
        </div>

        {/* Watermark for free users */}
        {!isPremium && <CardWatermark large={s} />}
      </div>
    );
  }
);

CardShell.displayName = "CardShell";
