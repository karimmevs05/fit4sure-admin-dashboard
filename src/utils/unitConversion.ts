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
