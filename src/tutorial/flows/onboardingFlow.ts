import type { TutorialFlow } from "../types";

export const onboardingFlow: TutorialFlow = {
  id: "onboarding",
  version: 8,
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
      id: "fight-week-page",
      title: "Fight Week",
      description:
        "Your fight week command centre. Get AI-generated advice for your final week — water loading, sodium manipulation, and weight management strategies tailored to your cut.",
      position: "center",
      navigateTo: "/weight-cut",
      condition: (state) => state.goalType === "cutting",
    },
    {
      id: "rehydration-page",
      title: "Rehydration Planner",
      description:
        "Switch to the Rehydration tab after weigh-in. Enter how much weight you lost and get a personalised hourly protocol — fluid schedules, electrolyte timing, and carb refuelling plan.",
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
      id: "recovery-page",
      title: "Recovery Dashboard",
      description:
        "Your recovery hub. Every session you log in the Training Calendar feeds into recovery metrics here — fatigue levels, sleep quality, soreness trends, and an AI recovery coach. The more you log, the smarter it gets.",
      position: "center",
      navigateTo: "/recovery",
    },
    {
      id: "sleep-page",
      title: "Sleep Tracking",
      description:
        "Log your sleep daily from the dashboard widget. Your hours are tracked over time and displayed in a graph on the Sleep page — filter by week, month, or 3 months. Consistent logging helps the AI give better recovery and cut advice.",
      position: "center",
      navigateTo: "/sleep",
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
