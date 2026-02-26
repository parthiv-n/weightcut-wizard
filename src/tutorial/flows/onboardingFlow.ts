import type { TutorialFlow } from "../types";

export const onboardingFlow: TutorialFlow = {
  id: "onboarding",
  version: 2,
  steps: [
    // ── Dashboard overview ──
    {
      id: "welcome",
      title: "Welcome to WeightCut Wizard",
      description:
        "Let's take a quick tour of your app. We'll walk through every screen so you know exactly where everything is.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "weight-progress",
      target: "weight-progress-ring",
      title: "Your Weight Progress",
      description:
        "This ring tracks how close you are to your goal weight. It updates automatically as you log.",
      position: "bottom",
      route: "/dashboard",
    },
    {
      id: "daily-wisdom",
      target: "daily-wisdom-card",
      title: "Wizard's Daily Wisdom",
      description:
        "Your AI coach analyses your progress and gives personalised advice every day. Log your weight each morning to unlock it.",
      position: "top",
      route: "/dashboard",
    },
    {
      id: "calorie-ring",
      target: "calorie-progress-ring",
      title: "Calorie Tracking",
      description:
        "Track your daily calorie intake here. The ring fills as you log meals throughout the day.",
      position: "top",
      route: "/dashboard",
    },

    // ── Navigate to feature pages ──
    {
      id: "nutrition-page",
      title: "Nutrition",
      description:
        "This is your nutrition hub. Log meals by scanning a barcode or searching the database. Generate AI meal plans, analyse your vitamin intake and get a diet quality score — all in one place.",
      position: "center",
      navigateTo: "/nutrition",
    },
    {
      id: "weight-tracker-page",
      title: "Weight Tracker",
      description:
        "Track your daily weigh-ins and see your progress chart over time. Filter by week, month or all-time, and use AI to analyse your weight trends.",
      position: "center",
      navigateTo: "/weight",
    },
    {
      id: "hydration-page",
      title: "Rehydration Planner",
      description:
        "Your post-weigh-in rehydration tool. Enter the weight you lost and get a personalised recovery protocol with fluid schedules and electrolyte timing.",
      position: "center",
      navigateTo: "/hydration",
      condition: (state) => state.goalType === "cutting",
    },
    {
      id: "fight-camps-page",
      title: "Fight Camps",
      description:
        "Organise your training into fight camps. Create a camp for each event, track your weight cut progress, and review past camps.",
      position: "center",
      navigateTo: "/fight-camps",
    },
    {
      id: "fight-camp-calendar-page",
      title: "Training Calendar",
      description:
        "Log your training sessions on the calendar — BJJ, Muay Thai, wrestling, strength and more. Use the training summary so you never forget what you worked on.",
      position: "center",
      navigateTo: "/fight-camp-calendar",
    },
    {
      id: "fight-week-page",
      title: "Fight Week Protocol",
      description:
        "Your fight week planner. Input your current weight and weigh-in target, then get a day-by-day protocol for water loading, sodium manipulation and your final cut.",
      position: "center",
      navigateTo: "/fight-week",
      condition: (state) =>
        state.goalType === "cutting" &&
        state.profileData?.fight_week_target_kg != null,
    },

    // ── Back to dashboard — bottom nav tips ──
    {
      id: "nav-quick-log",
      target: "nav-quick-log",
      title: "Quick Log",
      description:
        "Tap the + button anytime to quickly log food or weight in one tap.",
      position: "top",
      navigateTo: "/dashboard",
    },
    {
      id: "all-done",
      title: "You're All Set!",
      description:
        "Explore at your own pace. You can replay this tour anytime from Settings in the More menu.",
      position: "center",
      navigateTo: "/dashboard",
    },
  ],
};
