import type { GraphEdge } from "@/types/technique";

interface EdgePathProps {
  edge: GraphEdge;
}

export function EdgePath({ edge }: EdgePathProps) {
  const { sourceX, sourceY, targetX, targetY } = edge;
  const midY = (sourceY + targetY) / 2;

  const d = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;

  return (
    <path
      d={d}
      fill="none"
      stroke="hsl(var(--border) / 0.4)"
      strokeWidth={1.5}
      markerEnd="url(#arrowhead)"
    />
  );
}

export function ArrowheadDef() {
  return (
    <defs>
      <marker
        id="arrowhead"
        viewBox="0 0 10 7"
        refX="9"
        refY="3.5"
        markerWidth="8"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <polygon
          points="0 0, 10 3.5, 0 7"
          fill="hsl(var(--border) / 0.4)"
        />
      </marker>
    </defs>
  );
}
