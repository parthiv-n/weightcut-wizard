/**
 * Calculate daily calorie target based on profile data
 * Priority order: Manual Override > AI Recommended > Calculated
 */
export function calculateCalorieTarget(profileData: any): number {
  // Check if manual override is active - manual values are stored in ai_recommended_* fields
  if (profileData?.manual_nutrition_override && profileData?.ai_recommended_calories) {
    return profileData.ai_recommended_calories;
  }

  // Check if AI recommendations exist (when override is false), use them if available
  if (profileData?.ai_recommended_calories) {
    return profileData.ai_recommended_calories;
  }

  // Fallback to calculated target if no manual override or AI recommendations
  const currentWeight = profileData?.current_weight_kg || 70;
  const goalWeight = profileData?.goal_weight_kg || 65;
  const tdee = profileData?.tdee || 2000;
  const daysToGoal = Math.ceil(
    (new Date(profileData?.target_date || new Date()).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  // If no valid target date or days to goal is 0 or negative, return TDEE - 500 as safe default
  if (daysToGoal <= 0) {
    return Math.max(tdee - 500, tdee * 0.8);
  }

  const weeklyWeightLoss = ((currentWeight - goalWeight) / (daysToGoal / 7));
  const safeWeeklyLoss = Math.min(weeklyWeightLoss, 1); // Max 1kg/week
  const dailyDeficit = (safeWeeklyLoss * 7700) / 7; // 7700 cal = 1kg fat
  const target = Math.max(tdee - dailyDeficit, tdee * 0.8); // Minimum 80% of TDEE

  return Math.round(target);
}

