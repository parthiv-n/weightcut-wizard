import type { AchievementCategoryGroup } from "@/hooks/useGamification";
import { SkillTreeCategory } from "./SkillTreeCategory";

interface AchievementSkillTreeProps {
  categories: AchievementCategoryGroup[];
}

export function AchievementSkillTree({ categories }: AchievementSkillTreeProps) {
  let globalIndex = 0;

  return (
    <div className="space-y-6">
      {categories.map((group) => {
        const startIndex = globalIndex;
        globalIndex += group.achievements.length;
        return (
          <SkillTreeCategory
            key={group.category}
            group={group}
            globalIndexStart={startIndex}
          />
        );
      })}
    </div>
  );
}
