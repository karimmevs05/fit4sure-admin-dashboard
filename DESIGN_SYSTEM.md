# Fit4Sure Design System

A premium operations dashboard design language inspired by Apple, Linear, and Stripe.

## Style Guide

**Aesthetic:** Apple × Linear × Stripe
- Premium healthcare feel
- Clean and spacious
- White background
- Light gray surfaces
- Blue primary actions
- Green success indicators
- Rounded corners (16–20px)
- Soft shadows
- Minimal borders

## Color Palette

```
Primary:           #2563EB
Primary Hover:     #1D4ED8
Success:           #16A34A
Warning:           #F59E0B
Danger:            #DC2626
Background:        #F8FAFC
Surface:           #FFFFFF
Border:            #E2E8F0
Text Primary:      #0F172A
Text Secondary:    #64748B
Muted:             #94A3B8
```

## Typography

Font: **Inter**

- **Page Titles:** 36px, 700
- **Section Headers:** 24px, 700
- **Card Titles:** 18px, 600
- **Body:** 15px, 400
- **Small Labels:** 12px, 500

## Sidebar Navigation

- Dashboard
- Orders
- Customers
- Weekly Menu
- Recipes
- Inventory
- Kitchen
- Production
- Deliveries
- Reports
- Settings

Icons: Use **lucide-react** only.

## Universal Layout

```
┌─────────────────────────┐
│  Sidebar │ Top Navigation│
├─────────────────────────┤
│                         │
│  Page Header            │
│  Search | Filters       │
│                         │
│  [ Action Button ]      │
├─────────────────────────┤
│                         │
│  Content                │
│                         │
├─────────────────────────┤
│  Footer                 │
└─────────────────────────┘
```

## Component Library (Reusable)

All components should be built once and reused across the application:

- `<Button>` — Primary, secondary, danger variants
- `<Card>` — Base card container
- `<PageHeader>` — Title, subtitle, actions
- `<StatCard>` — KPI display
- `<DataTable>` — Sortable, filterable tables
- `<Modal>` — Dialog for create/edit
- `<FormField>` — Inputs, selects, labels
- `<SearchInput>` — Search with icon
- `<Select>` — Dropdown select
- `<StatusBadge>` — Status indicator
- `<MacroBadge>` — Nutrition display
- `<Section>` — Content section wrapper
- `<EmptyState>` — No data message
- `<DeleteDialog>` — Confirmation dialog
- `<Drawer>` — Side panel

## Page Templates

### Recipes Page

**Top Section:**
```
Recipes | Manage your recipe database.

[ Search ] [ Category Filter ] [ Add Recipe ]
```

**Recipe Card:**
```
──────────────────────────────
Chicken Burrito Bowl
Performance Meal

Calories    Protein    Carbs    Fat
420         42g        28g      12g

Serves 6 | $4.82 / serving | 35 min prep

[Edit] [Delete]
──────────────────────────────
```

**Add Recipe Modal:**
```
Recipe Name
Category
Servings
Prep Time
Calories
Protein | Carbs | Fat
Ingredient Cost
Yield Weight
Notes

[Cancel] [Create Recipe]
```

### Orders Page

**Top Metrics:**
```
Today's Deliveries | Active Clients | Revenue This Month | Orders This Week
```

**Order Card:**
```
Customer | Package | Meals | Delivery | Payment | Status | [Actions]
```

### Customers Page

**Customer Card:**
```
Avatar | Name | Goal | Plan | Allergies | Subscription | Address | Phone | Notes
```

### Weekly Menu Builder

```
Week of July 14

Breakfast [+]
Performance Meals [+]
Healthy Treats [+]
Juices [+]

[Publish Menu]

(Drag and drop recipes into categories)
```

### Kitchen Production

```
Chicken Bowl
Need: 74 portions

Protein:      33 lb
Rice:         18 lb
Broccoli:     12 lb

[Assigned] [Completed]
```

### Inventory

```
Ingredient | Quantity | Unit | Minimum | Supplier | Cost | Need to Order?
```

### Dashboard

**KPI Cards:**
```
Revenue | Orders | Deliveries | New Clients
```

**Charts:**
- Weekly Revenue
- Orders
- Subscriptions
- Recent Activity
- Upcoming Deliveries

## Tailwind Token Examples

**Card:**
```js
export const card = `
  rounded-2xl
  bg-white
  border
  border-slate-200
  shadow-sm
  hover:shadow-lg
  transition-all
  duration-300
`
```

**Primary Button:**
```js
export const button = `
  bg-blue-600
  hover:bg-blue-700
  text-white
  rounded-xl
  font-medium
  px-5
  py-3
  transition-colors
`
```

**Input Field:**
```js
export const input = `
  rounded-xl
  border
  border-slate-300
  bg-white
  px-4
  py-3
  focus:ring-2
  focus:ring-blue-500
  outline-none
  transition-colors
`
```

## Database Entities

Each entity gets:
- List view
- Detail page
- Create/Edit modal
- Search
- Filters
- Activity history

**Entities:**
- Customers
- Orders
- Recipes
- Ingredients
- Inventory
- Menus
- Meal Plans
- Subscriptions
- Deliveries
- Kitchen Tasks
- Invoices

## Master Prompt for Claude

> Build a premium operations dashboard for Fit4Sure, a high-end healthy meal prep company. The interface should feel like Stripe, Linear, and Apple's internal tools: clean, spacious, modern, and highly usable. Use React, TypeScript, Tailwind CSS, shadcn/ui, and lucide-react. Follow a consistent design system with rounded 2xl cards, subtle shadows, Inter typography, blue primary actions (#2563EB), green success states (#16A34A), slate backgrounds (#F8FAFC), and white surfaces. Every page should share reusable components (PageHeader, Card, DataTable, Modal, FormField, StatusBadge, MacroBadge, StatCard). Build for desktop first with responsive tablet/mobile layouts. Prioritize operational efficiency, making it easy to manage customers, recipes, weekly menus, inventory, kitchen production, deliveries, and subscriptions with minimal clicks.

## Implementation Notes

1. **Create a `components/ui/` folder** with all reusable components
2. **Export tokens** from a `styles/tokens.ts` file
3. **Use Tailwind's `@apply`** to create utility classes for consistency
4. **Test on mobile** before considering a page "done"
5. **Keep spacing consistent** (use 16px base unit: 4px, 8px, 16px, 24px, 32px)
6. **Hover states on all interactive elements**
7. **Loading states** for async operations
8. **Error handling** with visible feedback
9. **Empty states** for all lists

## Next Steps

1. Build reusable component library first
2. Apply to Recipes page (already started)
3. Build Orders page
4. Build Customers page
5. Build Weekly Menu page
6. Build Inventory page
7. Build Kitchen Production page
8. Build Dashboard/Analytics

---

**Last Updated:** July 14, 2026
**Version:** 1.0
