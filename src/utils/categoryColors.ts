// Shared recipe-category background colors (brand swatches): proteins red,
// vegetables green, carbs yellow, sauces blue-grey. Categories with no clear
// macro bucket (beverage, breakfast) keep the neutral cream background.
// Used anywhere a recipe is shown as its own card/row/chip -- Recipe Library
// cards, Weekly Menu Planner rows, and the shared recipe picker's selected
// chips -- so recolors stay in sync across all of them.
export const DEFAULT_CARD_BG = "bg-[rgba(251,247,240,0.9)]";

export const CATEGORY_CARD_BG: Record<string, string> = {
  beef: "bg-[#E89E93]/85",
  chicken: "bg-[#E89E93]/85",
  turkey: "bg-[#E89E93]/85",
  carbohydrates: "bg-[#F1E0A5]/85",
  vegetables: "bg-[#A4B89E]/85",
  sauces: "bg-[#ABBCCF]/85",
  beverage: DEFAULT_CARD_BG,
  breakfast: DEFAULT_CARD_BG,
};

export function cardBgForCategory(category?: string | null): string {
  return (category && CATEGORY_CARD_BG[category]) || DEFAULT_CARD_BG;
}

// Lighter-touch version for dense list rows/chips (Menu Planner, Plate Builder
// chips) -- a solid left accent stripe plus a faint background wash, rather
// than a fully-filled card. Same category->color mapping as the card
// backgrounds above, just dialed down so a page full of rows doesn't turn
// into a wall of solid color.
const DEFAULT_ROW_ACCENT = "border-l-4 border-l-transparent bg-white";

const CATEGORY_ROW_ACCENT: Record<string, string> = {
  beef: "border-l-4 border-l-[#E89E93] bg-[#E89E93]/10",
  chicken: "border-l-4 border-l-[#E89E93] bg-[#E89E93]/10",
  turkey: "border-l-4 border-l-[#E89E93] bg-[#E89E93]/10",
  carbohydrates: "border-l-4 border-l-[#D9BE5F] bg-[#F1E0A5]/15",
  vegetables: "border-l-4 border-l-[#A4B89E] bg-[#A4B89E]/10",
  sauces: "border-l-4 border-l-[#ABBCCF] bg-[#ABBCCF]/10",
  beverage: DEFAULT_ROW_ACCENT,
  breakfast: DEFAULT_ROW_ACCENT,
};

export function rowAccentForCategory(category?: string | null): string {
  return (category && CATEGORY_ROW_ACCENT[category]) || DEFAULT_ROW_ACCENT;
}
