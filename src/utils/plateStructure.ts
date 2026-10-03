import axios from "axios";

// Fallback serving sizes per plate structure, used only until the live
// config (fetchPlateConfig below) has loaded -- the real source of truth is
// now the plate_formats table, editable from Operations Hub's Portions &
// Pricing section, not this hardcoded array. Kept as a default so the page
// isn't empty during the brief window before the first fetch resolves.
export const PLATE_STRUCTURE_SERVINGS: Array<{
  structure: string;
  proteinOz: number;
  carbsG: number;
  veggiesG: number;
}> = [
  { structure: "Regular", proteinOz: 5, carbsG: 150, veggiesG: 100 },
  { structure: "Large", proteinOz: 7, carbsG: 225, veggiesG: 140 },
  { structure: "By the Pound", proteinOz: 16, carbsG: 0, veggiesG: 0 },
  { structure: "Low Carb", proteinOz: 7, carbsG: 0, veggiesG: 150 },
  { structure: "High Protein", proteinOz: 7, carbsG: 150, veggiesG: 0 },
  { structure: "Breakfast", proteinOz: 2.5, carbsG: 120, veggiesG: 25 },
];

export const OZ_TO_G = 28.3495;

// Which plate-structure column a recipe's macros should scale against, based
// on its own category -- a protein recipe cares about the protein serving
// size, a carb side about the carbs serving size, etc. Sauces/beverages
// don't map to any column in the sheet, so they get no selector.
export function plateComponentFor(category: string): "protein" | "carbs" | "veggies" | null {
  if (category === "carbohydrates" || category === "pasta") return "carbs";
  if (category === "vegetables") return "veggies";
  if (category === "beef" || category === "chicken" || category === "turkey" || category === "pork" || category === "breakfast") return "protein";
  return null;
}

export function servingGramsFor(row: { proteinOz: number; carbsG: number; veggiesG: number }, component: "protein" | "carbs" | "veggies"): number {
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
// `rows` defaults to the fallback constant but callers should pass the live
// fetched config once available.
export function sideCategoriesFor(
  selectedFormatLabels: string[],
  rows: typeof PLATE_STRUCTURE_SERVINGS = PLATE_STRUCTURE_SERVINGS
): { carbs: boolean; veggies: boolean } {
  let carbs = false;
  let veggies = false;
  for (const label of selectedFormatLabels) {
    const structureName = FORMAT_LABEL_TO_STRUCTURE[label];
    const row = rows.find((r) => r.structure === structureName);
    if (!row) continue;
    if (row.carbsG > 0) carbs = true;
    if (row.veggiesG > 0) veggies = true;
  }
  return { carbs, veggies };
}

// ---------------------------------------------------------------------------
// Live config -- fetched from /api/admin/plate-config (backed by
// plate_formats/by_the_pound_prices/addon_rules, editable in Operations
// Hub's Portions & Pricing section). Replaces what used to be this file's
// own hardcoded PLATE_STRUCTURE_SERVINGS as the actual source of truth, and
// Orders.tsx's separately hardcoded add-on pricing constants.
// ---------------------------------------------------------------------------

export type PlateFormatConfig = {
  key: string;
  label: string; // raw backend label, e.g. "Regular", "1 Pound"
  structure: string; // lookup name used against FORMAT_LABEL_TO_STRUCTURE/PLATE_STRUCTURE_SERVINGS-shaped code ("1 Pound" is aliased to "By the Pound" here, same alias the old hardcoded sheet used)
  proteinOz: number;
  carbsG: number;
  veggiesG: number;
  priceCents: number;
  isRecipeFormat: boolean;
  active: boolean;
};

export type AddonConfig = Record<string, { freePrice: number; freeCount: number; extraPrice: number }>;

export type ByThePoundConfig = Record<string, number>; // category -> dollars

// Returns null on failure (network error, not yet authenticated, etc.) so
// callers can fall back to PLATE_STRUCTURE_SERVINGS rather than crash --
// never silently substitutes invented numbers.
export async function fetchPlateConfig(
  apiUrl: string,
  token: string | null
): Promise<{ formats: PlateFormatConfig[]; addons: AddonConfig; byThePound: ByThePoundConfig } | null> {
  try {
    const res = await axios.get(`${apiUrl}/api/admin/plate-config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.data.data;

    const formats: PlateFormatConfig[] = (data.formats || []).map((f: any) => ({
      key: f.key,
      label: f.label,
      structure: f.label === "1 Pound" ? "By the Pound" : f.label,
      proteinOz: parseFloat(f.protein_oz),
      carbsG: parseFloat(f.carbs_g),
      veggiesG: parseFloat(f.veggies_g),
      priceCents: f.price_cents,
      isRecipeFormat: f.is_recipe_format,
      active: f.active,
    }));

    const addons: AddonConfig = {};
    for (const a of data.addons || []) {
      addons[a.label] = { freePrice: 0, freeCount: a.free_count, extraPrice: a.extra_price_cents / 100 };
    }

    const byThePound: ByThePoundConfig = {};
    for (const b of data.byThePound || []) {
      byThePound[b.category] = b.price_cents / 100;
    }

    return { formats, addons, byThePound };
  } catch (err) {
    console.error("Error fetching live plate config, falling back to defaults:", err);
    return null;
  }
}
