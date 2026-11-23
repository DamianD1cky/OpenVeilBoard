// Compatibility for the existing account API; new rooms use the neutral pack.
export type CampaignThemePackId = "veil" | "crisis_diner";
const pack = {
  gmJobTitle: "主持人", appearance: () => ({}), sectionTitles: {},
  sectionColors: {}, resourceTitles: {},
};
export const campaignThemePacks = { veil: pack, crisis_diner: pack };
