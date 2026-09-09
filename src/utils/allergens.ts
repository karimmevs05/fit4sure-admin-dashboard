// Same controlled vocabulary as the backend's allergenTagger.js (used to
// auto-tag inventory items, which recipes then aggregate from their
// ingredients) -- kept in sync manually since it's a fixed, rarely-changing
// list, not worth a network round trip to fetch.
export const ALLERGEN_LABELS: Record<string, string> = {
  dairy: "Dairy",
  gluten: "Gluten",
  soy: "Soy",
  egg: "Egg",
  shellfish: "Shellfish",
  fish: "Fish",
  tree_nuts: "Tree Nuts",
  peanuts: "Peanuts",
  sesame: "Sesame",
};

export const ALL_ALLERGENS = Object.keys(ALLERGEN_LABELS);

export function allergenLabel(key: string): string {
  return ALLERGEN_LABELS[key] || key;
}
