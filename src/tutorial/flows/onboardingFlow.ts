import type { TutorialFlow } from "../types";

export const onboardingFlow: TutorialFlow = {
  id: "onboarding",
  version: 3,
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
      id: "analyse-diet",
      target: "analyse-diet",
      title: "Analyse Your Diet",
      description:
        "Tap here to get an AI breakdown of your day's nutrition. Find out which micronutrients you're missing — like iron, magnesium and B-vitamins — so you can optimise your performance and recovery.",
      position: "top",
      route: "/nutrition",
    },
    {
      id: "generate-meal-plan",
      target: "generate-meal-plan",
      title: "Generate Meal Plans",
      description:
        "Need meal ideas? Tap Generate and describe what you're after — the AI will create personalised meals tailored to your calorie and macro targets that you can log in one tap.",
      position: "top",
      route: "/nutrition",
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
      id: "wizard-chat",
      target: "wizard-chat",
      title: "AI Chatbot",
      description:
        "Tap the sparkle button to chat with your AI coach. Ask anything — training advice, recovery tips, nutrition questions, or help with your weight cut.",
      position: "top",
      navigateTo: "/dashboard",
    },
    {
      id: "nav-quick-log",
      target: "nav-quick-log",
      title: "Quick Log",
      description:
        "Tap the + button anytime to quickly log food or weight in one tap.",
      position: "top",
      route: "/dashboard",
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
