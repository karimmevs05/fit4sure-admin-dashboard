// Standard serving sizes per plate structure -- source of truth is the
// "Plate structure" reference sheet, not derived/computed from recipe data.
export const PLATE_STRUCTURE_SERVINGS: Array<{
  structure: string;
  proteinOz: number;
  carbsG: number;
  veggiesG: number | null;
}> = [
  { structure: "Regular", proteinOz: 5, carbsG: 150, veggiesG: 100 },
  { structure: "Large", proteinOz: 7, carbsG: 225, veggiesG: 140 },
  { structure: "By the Pound", proteinOz: 16, carbsG: 0, veggiesG: 0 },
  { structure: "Low Carb", proteinOz: 7, carbsG: 0, veggiesG: 150 },
  { structure: "High Protein", proteinOz: 7, carbsG: 150, veggiesG: null },
  { structure: "Breakfast", proteinOz: 2.5, carbsG: 120, veggiesG: 25 },
];

export const OZ_TO_G = 28.3495;

// Which plate-structure column a recipe's macros should scale against, based
// on its own category -- a protein recipe cares about the protein serving
// size, a carb side about the carbs serving size, etc. Sauces/beverages
// don't map to any column in the sheet, so they get no selector.
export function plateComponentFor(category: string): "protein" | "carbs" | "veggies" | null {
  if (category === "carbohydrates") return "carbs";
  if (category === "vegetables") return "veggies";
  if (category === "beef" || category === "chicken" || category === "turkey" || category === "breakfast") return "protein";
  return null;
}

export function servingGramsFor(row: (typeof PLATE_STRUCTURE_SERVINGS)[number], component: "protein" | "carbs" | "veggies"): number | null {
  if (component === "protein") return row.proteinOz * OZ_TO_G;
  if (component === "carbs") return row.carbsG;
  return row.veggiesG;
}

// Order/menu format chip labels ("1 Pound") don't always match the sheet's
// structure names ("By the Pound") verbatim -- map between them.
export const FORMAT_LABEL_TO_STRUCTURE: Record<string, string> = {
  Regular: "Regular",
  Large: "Large",
  "1 Pound": "By the Pound",
  "By the Pound": "By the Pound",
  "Low Carb": "Low Carb",
  "High Protein": "High Protein",
  Breakfast: "Breakfast",
};

// Given the plate-structure formats a customer has actually selected for a
// protein, which side categories make sense to suggest -- e.g. Low Carb
// (0g carbs) shouldn't suggest carb sides, High Protein (no veggies figure)
// shouldn't suggest veggie sides, By the Pound (0g both) suggests neither.
export function sideCategoriesFor(selectedFormatLabels: string[]): { carbs: boolean; veggies: boolean } {
  let carbs = false;
  let veggies = false;
  for (const label of selectedFormatLabels) {
    const structureName = FORMAT_LABEL_TO_STRUCTURE[label];
    const row = PLATE_STRUCTURE_SERVINGS.find((r) => r.structure === structureName);
    if (!row) continue;
    if (row.carbsG > 0) carbs = true;
    if (row.veggiesG != null && row.veggiesG > 0) veggies = true;
  }
  return { carbs, veggies };
}
