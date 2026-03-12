import { Construction } from "lucide-react";

export default function SkillTree() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)] px-4 text-center">
      <div className="glass-card p-8 rounded-2xl border border-border/50 max-w-sm w-full space-y-4">
        <Construction className="h-12 w-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-bold">Skill Tree</h1>
        <p className="text-muted-foreground text-sm">
          Coming soon — track and visualize your technique progression across disciplines.
        </p>
      </div>
    </div>
  );
}
