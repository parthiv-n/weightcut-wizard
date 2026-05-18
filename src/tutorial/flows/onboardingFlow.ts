import type { TutorialFlow } from "../types";

export const onboardingFlow: TutorialFlow = {
  id: "onboarding",
  version: 9,
  steps: [
    {
      id: "welcome",
      title: "Good, you made it",
      description:
        "I'm the wizard, your corner for everything outside the cage. I'll keep your cut clean and your camp honest. Two minutes, then you're off.",
      position: "center",
      route: "/dashboard",
      wizardPose: "wave",
    },
    {
      id: "dashboard-overview",
      title: "This is home",
      description:
        "Your ring tracks the day, the wisdom keeps you sharp, the badges mark the work. Open this first, every morning.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "nutrition-page",
      title: "Food in, fight out",
      description:
        "Scan a barcode, search a food, or let Quick Fill read the plate. Build a personalised plan, then analyse the micros so nothing slips.",
      position: "center",
      navigateTo: "/nutrition",
    },
    {
      id: "nutrition-features",
      title: "Two tools, one job",
      description:
        "Analyse looks back, finding the gaps and quiet deficiencies. Generate looks forward, building meals around the macros you actually need.",
      position: "center",
      route: "/nutrition",
      wizardPose: "point",
    },
    {
      id: "weight-tracker-page",
      title: "Weigh in, every day",
      description:
        "One number, same time, no drama. Filter by week, month or all, and I'll analyse the trend so you see the truth, not the noise.",
      position: "center",
      navigateTo: "/weight",
    },
    {
      id: "fight-week-page",
      title: "The last seven days",
      description:
        "This is where the cut gets real. Water load, sodium taper, the lot. Follow it step by step and you'll walk to the scale calm.",
      position: "center",
      navigateTo: "/weight-cut",
      condition: (state) => state.goalType === "cutting",
    },
    {
      id: "rehydration-page",
      title: "After the scale",
      description:
        "The fight is won in the hours after weigh-in. Sip the plan I lay out, hour by hour, fluid, salt and carbs in order. Don't freelance here.",
      position: "center",
      navigateTo: "/weight-cut?tab=rehydration",
      condition: (state) => state.goalType === "cutting",
      wizardPose: "point",
    },
    {
      id: "fight-camps-page",
      title: "Organise the chaos",
      description:
        "Every camp gets its own home. Track the cut, log the sessions, drop in photos. When the next one starts, you'll know exactly what worked.",
      position: "center",
      navigateTo: "/fight-camps",
    },
    {
      id: "training-calendar-page",
      title: "Log the rounds",
      description:
        "BJJ, Muay Thai, wrestling, strength, all in one place with an RPE. Each week I'll write you a short summary, so the patterns surface.",
      position: "center",
      navigateTo: "/training-calendar",
    },
    {
      id: "recovery-page",
      title: "The other half of fitness",
      description:
        "Tell me how you slept, how sore you are, how the tank feels. The more you log, the sharper my recovery coach gets at calling your next move.",
      position: "center",
      navigateTo: "/recovery",
    },
    {
      id: "sleep-page",
      title: "Hours in the bank",
      description:
        "Log the nights, watch the trend across a week, a month, three months. Sleep is the cheapest performance gain you've got. Spend it.",
      position: "center",
      navigateTo: "/sleep",
    },
    {
      id: "quick-tips",
      title: "Two buttons to know",
      description:
        "The plus on the nav is your fast log, weight, meals, sessions, in seconds. The sparkle opens me up for a chat, any question, any time.",
      position: "center",
      navigateTo: "/dashboard",
      wizardPose: "point",
    },
    {
      id: "pro-features",
      title: "A quick note on Pro",
      description:
        "Manual logging, barcode and food search are yours, free, forever. The AI tools, the plans, the analysis, those live in Pro. Upgrade from Settings when you're ready.",
      position: "center",
      route: "/dashboard",
    },
    {
      id: "all-done",
      title: "That's the kit",
      description:
        "You can replay this from Settings whenever you like. Now go and do the work. I'll be here when you check in.",
      position: "center",
      route: "/dashboard",
      wizardPose: "celebrate",
    },
  ],
};
