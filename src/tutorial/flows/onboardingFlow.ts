import type { TutorialFlow } from "../types";

export const onboardingFlow: TutorialFlow = {
  id: "onboarding",
  version: 6,
  steps: [
    {
      id: "welcome",
      title: "Welcome to FightCamp Wizard",
      description:
        "Let's take a quick tour of your app. We'll walk through every screen so you know exactly where everything is.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "dashboard-overview",
      title: "Your Dashboard",
      description:
        "This is your home base. You'll see your weight progress bar, weekly consistency ring, AI daily wisdom, weight history chart, training activity, and achievement badges — all at a glance.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "nutrition-page",
      title: "Nutrition",
      description:
        "Your nutrition hub. Log meals by scanning a barcode, searching the database, or using AI Quick Fill. Generate personalised meal plans, analyse your daily vitamin and mineral intake, and get a diet quality score.",
      position: "center",
      navigateTo: "/nutrition",
    },
    {
      id: "nutrition-features",
      title: "AI Diet Tools",
      description:
        "Use the Analyse button to get an AI breakdown of your day's nutrition — find missing micronutrients like iron, magnesium and B-vitamins. Use Generate to create meal plans tailored to your calorie and macro targets.",
      position: "center",
      route: "/nutrition",
    },
    {
      id: "weight-tracker-page",
      title: "Weight Tracker",
      description:
        "Track your daily weigh-ins and see your progress chart over time. Filter by week, month or all-time. Use the AI analysis to get insights on your weight trend, pace, and recommendations.",
      position: "center",
      navigateTo: "/weight",
    },
    {
      id: "hydration-page",
      title: "Rehydration Planner",
      description:
        "Your post-weigh-in rehydration tool. Enter the weight you lost and get a personalised recovery protocol with fluid schedules and electrolyte timing.",
      position: "center",
      navigateTo: "/weight-cut?tab=rehydration",
      condition: (state) => state.goalType === "cutting",
    },
    {
      id: "fight-camps-page",
      title: "Fight Camps",
      description:
        "Organise your training into fight camps. Create a camp for each event, track your weight cut progress, upload photos, and review past camps to improve.",
      position: "center",
      navigateTo: "/fight-camps",
    },
    {
      id: "training-calendar-page",
      title: "Training Calendar",
      description:
        "Log your training sessions — BJJ, Muay Thai, wrestling, strength, running and more. View your sessions by day, track RPE and intensity, and generate AI training summaries each week.",
      position: "center",
      navigateTo: "/training-calendar",
    },
    {
      id: "fight-week-page",
      title: "Fight Week Protocol",
      description:
        "Your fight week planner. Input your current weight and weigh-in target, then get a day-by-day protocol for water loading, sodium manipulation and your final cut.",
      position: "center",
      navigateTo: "/weight-cut",
      condition: (state) =>
        state.goalType === "cutting" &&
        state.profileData?.fight_week_target_kg != null,
    },
    {
      id: "quick-tips",
      title: "Quick Tips",
      description:
        "Use the + button in the nav bar to quickly log food or weight. Tap the sparkle button on the dashboard to chat with your AI coach — ask training advice, recovery tips, or anything about your cut.",
      position: "center",
      navigateTo: "/dashboard",
    },
    {
      id: "ai-gems",
      title: "AI Gems",
      description:
        "You get 2 free AI calls daily plus 1 bonus gem every 24 hours. Need more? Watch a short ad to earn extra gems — up to 5 per day. Or go Pro for unlimited AI access. Check your gem balance anytime in Settings.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "all-done",
      title: "You're All Set!",
      description:
        "Explore at your own pace. You can replay this tour anytime from Settings in the More menu.",
      position: "center",
      route: "/dashboard",
    },
  ],
};
