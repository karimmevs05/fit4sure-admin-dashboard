// Coarser bucket than a recipe's raw category (beef/chicken/turkey all read
// as "Proteins") -- shared between Menu Planner's This Week section and
// Weekly Prep so the two group recipes the same way instead of drifting
// into two slightly different taxonomies.
export const CATEGORY_GROUP: Record<string, string> = {
  beef: 'Proteins', chicken: 'Proteins', turkey: 'Proteins',
  carbohydrates: 'Carbs',
  vegetables: 'Veggies',
  sauces: 'Sauces',
  breakfast: 'Breakfast',
  beverage: 'Beverages',
  custom: 'Custom',
}
export const GROUP_ORDER = ['Proteins', 'Carbs', 'Veggies', 'Sauces', 'Breakfast', 'Beverages', 'Custom']

export function categoryGroup(category: string | null | undefined): string {
  return CATEGORY_GROUP[category || 'custom'] || 'Custom'
}
