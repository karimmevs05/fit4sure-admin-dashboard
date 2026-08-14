// Kitchen conversion chart - all conversions to grams
// Based on Fit4Sure cost sheet

export const UNIT_CONVERSIONS: Record<string, number> = {
  // Ounces to grams (dry)
  'oz': 28,
  'ounce': 28,
  'ounces': 28,

  // Pounds to grams
  'lb': 454,
  'lbs': 454,
  'pound': 454,
  'pounds': 454,

  // Volume to grams (approximate for water/liquid)
  'cup': 240,
  'cups': 240,
  'tbsp': 15,
  'tablespoon': 15,
  'tablespoons': 15,
  'tsp': 5,
  'teaspoon': 5,
  'teaspoons': 5,
  'ml': 1, // 1ml ≈ 1g for water

  // Already in grams
  'g': 1,
  'gram': 1,
  'grams': 1,
  'kg': 1000,
  'kilogram': 1000,
  'kilograms': 1000,
}

export function convertToGrams(quantity: number, unit: string): number {
  const normalizedUnit = unit.toLowerCase().trim()
  const conversion = UNIT_CONVERSIONS[normalizedUnit]

  if (!conversion) {
    console.warn(`Unknown unit: ${unit}`)
    return quantity // Return as-is if unknown
  }

  return quantity * conversion
}

export function parseQuantityAndUnit(input: string): { quantity: number; unit: string } {
  const match = input.match(/^([\d.]+)\s*(.*)$/)

  if (!match) {
    return { quantity: 0, unit: 'g' }
  }

  const quantity = parseFloat(match[1]) || 0
  const unit = match[2]?.trim() || 'g'

  return { quantity, unit }
}

export function formatQuantityInGrams(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2)} kg`
  }
  return `${grams.toFixed(1)} g`
}

// Protein ingredients are always weighed/ordered in lb:oz in the kitchen
// (butcher-style), never plain grams -- "2 lb 5 oz", not "1050g". Every
// other category keeps grams. Handles the 16oz-rounds-up-to-a-pound edge
// case so it never prints "3 lb 16 oz".
export function formatLbOz(grams: number): string {
  const totalOz = Math.round((Math.abs(grams) / 453.592) * 16)
  let lb = Math.floor(totalOz / 16)
  let oz = totalOz % 16
  const sign = grams < 0 ? '-' : ''
  if (lb === 0) return `${sign}${oz} oz`
  if (oz === 0) return `${sign}${lb} lb`
  return `${sign}${lb} lb ${oz} oz`
}

export function isProteinCategory(category: string | null | undefined): boolean {
  return (category || '').trim().toLowerCase() === 'protein'
}

// Display helper for any ingredient weight: lb:oz for Protein, grams
// (rounded) for everything else.
export function formatIngredientWeight(grams: number, category: string | null | undefined): string {
  if (isProteinCategory(category)) return formatLbOz(grams)
  return `${Math.round(grams)}g`
}
