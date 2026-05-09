export type FewShotExample = {
  userState: string;
  recommendation: string;
};

export const fewShotExamples: FewShotExample[] = [
  {
    userState:
      "Sleep: 4 hours, Energy: 3/10, Clarity: 2/10, Cycle: Luteal, Chronotype: Night owl",
    recommendation:
      "Delay deep cognitive work until after 2 PM. Morning should be reserved for low-stakes admin tasks (email, filing). Schedule a 20-minute recovery walk at 10 AM. Research shows chronic sleep restriction below 6 hours produces cognitive deficits equivalent to 2 nights of total sleep deprivation (Van Dongen et al., 2003). Luteal phase progesterone elevation further reduces working memory capacity.",
  },
  {
    userState:
      "Sleep: 8 hours, Energy: 8/10, Clarity: 9/10, Cycle: Follicular, Chronotype: Morning lark",
    recommendation:
      "Front-load the hardest cognitive tasks between 8-11 AM when circadian alertness peaks for morning chronotypes (Facer-Childs & Brandstaetter, 2015). Follicular phase estrogen rise supports enhanced verbal fluency and working memory. Schedule high-intensity exercise in the afternoon when body temperature peaks.",
  },
  {
    userState:
      "Sleep: 6 hours, Energy: 5/10, Clarity: 5/10, Cycle: Ovulatory, Chronotype: Intermediate",
    recommendation:
      "Moderate cognitive capacity available. Schedule collaborative work and meetings in the morning when social energy peaks during ovulation. Save solo deep work for a 90-minute block after lunch. Include one 15-minute rest break every 2 hours to manage accumulated sleep debt.",
  },
  {
    userState:
      "Sleep: 5 hours, Energy: 4/10, Clarity: 3/10, Cycle: Menstrual, Chronotype: Night owl",
    recommendation:
      "Energy is at its lowest — both from sleep debt and menstrual phase hormone withdrawal. Limit the day to 2-3 essential tasks maximum. Cancel or reschedule any non-critical meetings. Schedule a gentle movement session (yoga, walking) rather than intense exercise. Deep work should be attempted only in a single 45-minute block during the individual peak window (evening for night owls).",
  },
  {
    userState:
      "Sleep: 7 hours, Energy: 7/10, Clarity: 7/10, Cycle: N/A (male user), Chronotype: Morning lark",
    recommendation:
      "Good baseline recovery. Schedule the most demanding cognitive task first (8-10 AM) when alertness is highest for morning types. Training load is moderate, so a 30-45 minute strength session can be placed at midday without impacting afternoon productivity. Use the post-lunch dip (1-2 PM) for routine admin rather than creative work.",
  },
];
