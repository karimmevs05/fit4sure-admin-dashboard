import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import { IngredientPicker, PickedIngredient } from "../components/IngredientPicker";
import { RecipeImportPanel } from "../components/RecipeImportPanel";
import { RecipeStepsEditor, RecipeStep } from "../components/RecipeStepsEditor";
import { formatIngredientWeight } from "../utils/unitConversion";
import { PLATE_STRUCTURE_SERVINGS, plateComponentFor, servingGramsFor } from "../utils/plateStructure";
import { cardBgForCategory } from "../utils/categoryColors";
import {
  BookOpen,
  ChevronDown,
  Clock3,
  Filter,
  ImagePlus,
  Pencil,
  Plus,
  Ruler,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";

type Category = "beef" | "chicken" | "turkey" | "carbohydrates" | "vegetables" | "sauces" | "beverage" | "breakfast";

type RecipeIngredient = {
  id: number;
  inventory_id: number;
  name: string;
  category?: string | null;
  quantity_g: number;
  prep_section?: string | null;
  cooking_method_id?: number | null;
  cooking_method_name?: string | null;
  unit_price_cents?: number;
  priced_from_receipt?: boolean;
  ingredient_cost_cents?: number;
  protein_per_100g?: number | null;
  carbs_per_100g?: number | null;
  fat_per_100g?: number | null;
  calories_per_100g?: number | null;
};

type Recipe = {
  recipe_id: number;
  name: string;
  category: Category;
  image?: string;
  instructions?: string;
  steps?: { id: number; step_number: number; title: string | null; description: string; time_estimate_minutes: number | null }[];
  calories: number;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  servings: number;
  prep_time_minutes: number | null;
  cost_per_serving_cents: number;
  cost_per_pound_cents?: number;
  total_recipe_cost_cents?: number;
  ingredients?: RecipeIngredient[];
  per_pound?: { calories: number; protein_g: string; carbs_g: string; fat_g: string };
};


const CATEGORY_CLASSES: Record<Category, string> = {
  beef: "bg-[#8B4513] text-white border-[#8B4513]",
  chicken: "bg-[#D97706] text-white border-[#D97706]",
  turkey: "bg-[#92400E] text-white border-[#92400E]",
  carbohydrates: "bg-[#EAB308] text-[#1F2937] border-[#EAB308]",
  vegetables: "bg-[#16A34A] text-white border-[#16A34A]",
  sauces: "bg-[#E11D48] text-white border-[#E11D48]",
  beverage: "bg-[#0EA5E9] text-white border-[#0EA5E9]",
  breakfast: "bg-[#F59E0B] text-white border-[#F59E0B]",
};

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10";

// Same look as INPUT_CLASS but non-interactive -- used for values computed
// from ingredients (calories/macros) that would just get overwritten on
// the next load if someone typed into them.
function ReadOnlyValue({ value }: { value: string | number }) {
  return (
    <div className="flex h-11 w-full items-center rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D]">
      {value}
    </div>
  );
}

const REGULAR_STRUCTURE_ROW = PLATE_STRUCTURE_SERVINGS.find((row) => row.structure === "Regular")!;

// How many actual Regular-plate servings a batch recipe yields -- total
// ingredient weight divided by the Regular row's serving size for whichever
// plate component this recipe's category feeds (protein/carbs/veggies).
// Sauces/beverages aren't part of the plate structure table at all, so a
// batch of one of those is just treated as a single serving.
function computeRegularServings(category: Category, totalWeightG: number): number {
  const component = plateComponentFor(category);
  if (!component) return 1;
  if (totalWeightG <= 0) return 0;
  const regularServingGrams = servingGramsFor(REGULAR_STRUCTURE_ROW, component);
  return regularServingGrams > 0 ? Math.max(1, Math.round(totalWeightG / regularServingGrams)) : 1;
}

type CookingMethod = { id: number; name: string; typical_yield_pct: number | string; notes?: string | null };

// Cooking changes an ingredient's weight (water loss/gain) but not its
// nutrient content -- mirrors calculateRecipeMacros in adminRecipes.js so
// the builder's live preview matches what actually gets saved. No cooking
// method set (or not found in the reference list yet) = 0% change, i.e.
// the raw weight, same as every recipe before this feature existed.
function cookedGrams(rawG: number, cookingMethodId: number | null, cookingMethods: CookingMethod[]): number {
  const raw = Number(rawG) || 0;
  const method = cookingMethodId != null ? cookingMethods.find((m) => m.id === cookingMethodId) : null;
  const yieldPct = method ? Number(method.typical_yield_pct) || 0 : 0;
  return raw * (1 + yieldPct / 100);
}

export default function Fit4SureRecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [draftRecipes, setDraftRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<"ALL" | Category>("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [activeTab, setActiveTab] = useState<"library" | "drafts">("library");
  // Which plate format every recipe card displays its macros/cost at --
  // shared across the whole grid so switching it once updates every card,
  // instead of clicking through each card's own selector individually.
  const [structureIdx, setStructureIdx] = useState<number | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchRecipes();
    loadDrafts();
  }, []);

  const loadDrafts = () => {
    const saved = localStorage.getItem('recipe_drafts');
    if (saved) {
      try {
        setDraftRecipes(JSON.parse(saved));
      } catch (err) {
        console.error('Error loading drafts:', err);
      }
    }
  };

  const saveDrafts = (drafts: Recipe[]) => {
    localStorage.setItem('recipe_drafts', JSON.stringify(drafts));
    setDraftRecipes(drafts);
  };

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${apiUrl}/api/admin/recipes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecipes(response.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to fetch recipes");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let source = activeTab === "library" ? recipes : draftRecipes;

    // In library tab, exclude all prepared_meal recipes (they're in drafts)
    if (activeTab === "library") {
      source = source.filter(r => r.category !== "prepared_meal");
    }

    return source.filter((recipe) => {
      const matchesSearch = recipe.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === "ALL" || recipe.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [recipes, draftRecipes, search, activeCategory, activeTab]);

  const deleteRecipe = async (id: number) => {
    if (!confirm("Delete this recipe?")) return;
    if (activeTab === "drafts") {
      const updated = draftRecipes.filter(r => r.recipe_id !== id);
      saveDrafts(updated);
      return;
    }
    try {
      await axios.delete(`${apiUrl}/api/admin/recipes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchRecipes();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete recipe");
    }
  };

  const fetchRecipeDetails = async (recipeId: number) => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/recipes/${recipeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedRecipe(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to fetch recipe details");
    }
  };

  return (
    <main className="min-h-screen bg-[#E9DFD0] font-sans text-[#4B2B1D]">
        <div className="px-4 py-5 sm:px-6 lg:px-7 xl:px-8">
          <Header
            search={search}
            setSearch={setSearch}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            onAdd={() => setDrawerOpen(true)}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            structureIdx={structureIdx}
            setStructureIdx={setStructureIdx}
          />

          {error && (
            <div className="mt-6 rounded-2xl border border-[#E8B4B9] bg-[#FFF4F5] p-4 flex gap-3">
              <div>
                <p className="font-bold text-[#D62F3D]">Error</p>
                <p className="text-sm text-[#755B4C]">{error}</p>
              </div>
            </div>
          )}

          <div className={drawerOpen ? "mt-6 xl:pr-[380px]" : "mt-6"}>
            {loading ? (
              <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-10 text-center">
                <p className="text-lg font-extrabold">Loading recipes...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                  {filtered.map((recipe) => (
                    <RecipeCard
                      key={recipe.recipe_id}
                      recipe={recipe}
                      structureIdx={structureIdx}
                      onStructureChange={setStructureIdx}
                      onDelete={deleteRecipe}
                      onSelect={(r) => {
                        // Drafts only exist in localStorage -- the fake
                        // Date.now() id was never a real backend recipe.
                        if (draftRecipes.some((d) => d.recipe_id === r.recipe_id)) {
                          setSelectedRecipe(r);
                        } else {
                          fetchRecipeDetails(r.recipe_id);
                        }
                      }}
                      onEdit={async (r) => {
                        setSelectedRecipe(null); // Close details drawer

                        // Drafts already carry their full ingredient list
                        // locally. Real recipes don't -- the list endpoint
                        // this card's data came from omits `ingredients`
                        // entirely, so opening the edit drawer with it
                        // directly would show an empty ingredient list even
                        // though the recipe has saved ones. Fetch the full
                        // recipe (with ingredients) first.
                        if (draftRecipes.some((d) => d.recipe_id === r.recipe_id)) {
                          setEditingRecipe(r);
                          return;
                        }
                        try {
                          const response = await axios.get(`${apiUrl}/api/admin/recipes/${r.recipe_id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          setEditingRecipe(response.data.data);
                        } catch (err) {
                          console.error("Error fetching recipe for edit:", err);
                          setEditingRecipe(r);
                        }
                      }}
                    />
                  ))}
                </div>

                {filtered.length === 0 && (
                  <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-10 text-center">
                    <p className="text-lg font-extrabold">No recipes found.</p>
                    <p className="mt-1 text-sm text-[#755B4C]">
                      Try a different search or category.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      <AddRecipeDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          if (activeTab === "drafts") {
            loadDrafts();
          } else {
            fetchRecipes();
          }
        }}
        isDraft={true}
        onDraftSave={saveDrafts}
        draftRecipes={draftRecipes}
      />

      {selectedRecipe && !editingRecipe && (
        <RecipeDetailsDrawer
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      )}

      {editingRecipe && (
        <EditRecipeDrawer
          recipe={editingRecipe}
          onClose={() => setEditingRecipe(null)}
          onSave={() => {
            fetchRecipes();
          }}
          draftRecipes={draftRecipes}
          saveDrafts={saveDrafts}
        />
      )}
    </main>
  );
}

function Header({
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  onAdd,
  activeTab,
  onTabChange,
  structureIdx,
  setStructureIdx,
}: {
  search: string;
  setSearch: (value: string) => void;
  activeCategory: "ALL" | Category;
  setActiveCategory: (value: "ALL" | Category) => void;
  onAdd: () => void;
  activeTab: "library" | "drafts";
  onTabChange: (tab: "library" | "drafts") => void;
  structureIdx: number | null;
  setStructureIdx: (idx: number | null) => void;
}) {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D7C9B7] bg-[rgba(251,247,240,0.9)] text-[#2E527F]">
          <BookOpen className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-[#4B2B1D]">Recipes</h1>
          <p className="mt-1 text-sm text-[#755B4C]">
            Manage your recipe database and nutritional information.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#D8CDBE]">
        <button
          onClick={() => onTabChange("library")}
          className={`px-4 py-3 text-sm font-extrabold transition ${
            activeTab === "library"
              ? "border-b-2 border-[#2E527F] text-[#2E527F]"
              : "text-[#755B4C] hover:text-[#4B2B1D]"
          }`}
        >
          Library
        </button>
        <button
          onClick={() => onTabChange("drafts")}
          className={`px-4 py-3 text-sm font-extrabold transition ${
            activeTab === "drafts"
              ? "border-b-2 border-[#2E527F] text-[#2E527F]"
              : "text-[#755B4C] hover:text-[#4B2B1D]"
          }`}
        >
          Drafts
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:w-[290px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#4B2B1D]" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search recipes..."
            className="h-12 w-full rounded-xl border border-[#B7A58F] bg-[rgba(251,247,240,0.9)] pl-11 pr-4 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#2E527F] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2E527F]" />
          <select
            value={activeCategory}
            onChange={(event) =>
              setActiveCategory(event.target.value as "ALL" | Category)
            }
            className="h-12 appearance-none rounded-xl border border-[#B7A58F] bg-[rgba(251,247,240,0.9)] pl-11 pr-10 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          >
            <option value="ALL">All categories</option>
            <option value="beef">Beef</option>
            <option value="chicken">Chicken</option>
            <option value="turkey">Turkey</option>
            <option value="carbohydrates">Carbohydrates</option>
            <option value="vegetables">Vegetables</option>
            <option value="sauces">Sauces</option>
            <option value="beverage">Beverage</option>
            <option value="breakfast">Breakfast</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        </div>

        <div className="relative">
          <Ruler className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2E527F]" />
          <select
            value={structureIdx == null ? "" : String(structureIdx)}
            onChange={(event) => setStructureIdx(event.target.value === "" ? null : Number(event.target.value))}
            className="h-12 appearance-none rounded-xl border border-[#B7A58F] bg-[rgba(251,247,240,0.9)] pl-11 pr-10 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          >
            <option value="">Plate format: Per lb</option>
            {PLATE_STRUCTURE_SERVINGS.map((row, idx) => (
              <option key={row.structure} value={idx}>
                Plate format: {row.structure}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        </div>

        <button
          onClick={onAdd}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2E527F] px-5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(46,82,127,0.18)] transition hover:bg-[#24466E] active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          Add Recipe
        </button>
      </div>
    </header>
  );
}

function RecipeCard({
  recipe,
  structureIdx,
  onStructureChange,
  onDelete,
  onSelect,
  onEdit,
}: {
  recipe: Recipe;
  structureIdx: number | null;
  onStructureChange: (idx: number | null) => void;
  onDelete: (id: number) => void;
  onSelect: (recipe: Recipe) => void;
  onEdit: (recipe: Recipe) => void;
}) {
  const defaultImage =
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80";
  const categoryKey = recipe.category as Category;
  const colors = CATEGORY_CLASSES[categoryKey] || CATEGORY_CLASSES.beef;
  const cardBg = cardBgForCategory(categoryKey);
  const [showStructureMenu, setShowStructureMenu] = useState(false);
  const selectedStructureIdx = structureIdx;

  const component = plateComponentFor(recipe.category);
  const selectedRow = selectedStructureIdx != null ? PLATE_STRUCTURE_SERVINGS[selectedStructureIdx] : null;
  const servingGrams = selectedRow && component ? servingGramsFor(selectedRow, component) : null;
  const ratio = servingGrams != null ? servingGrams / 455 : null;

  const displayCalories = ratio != null ? Math.round((recipe.per_pound?.calories ?? 0) * ratio) : recipe.per_pound?.calories ?? 0;
  const displayProtein = ratio != null ? Math.round(parseFloat(recipe.per_pound?.protein_g ?? "0") * ratio) : Math.round(parseFloat(recipe.per_pound?.protein_g ?? "0"));
  const displayCarbs = ratio != null ? Math.round(parseFloat(recipe.per_pound?.carbs_g ?? "0") * ratio) : Math.round(parseFloat(recipe.per_pound?.carbs_g ?? "0"));
  const displayFat = ratio != null ? Math.round(parseFloat(recipe.per_pound?.fat_g ?? "0") * ratio) : Math.round(parseFloat(recipe.per_pound?.fat_g ?? "0"));
  const displayCost = ratio != null ? ((recipe.cost_per_pound_cents ?? 0) / 100) * ratio : (recipe.cost_per_pound_cents ?? 0) / 100;
  const servingLabel = selectedRow && component
    ? `${selectedRow.structure} · ${component === "protein" ? `${selectedRow.proteinOz}oz` : `${servingGrams}g`}`
    : "per lb (455g)";

  return (
    <article onClick={() => onSelect(recipe)} className={`group cursor-pointer overflow-hidden rounded-2xl border border-[#2E527F] ${cardBg} shadow-[0_8px_24px_rgba(75,43,29,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[#3E6594]/50 hover:shadow-[0_14px_32px_rgba(75,43,29,0.10)]`}>
      <div className="relative h-[140px] overflow-hidden bg-[#E3D8C9]">
        <img
          src={recipe.image || defaultImage}
          alt={recipe.name}
          className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.025]"
          onError={(e) => {
            (e.target as HTMLImageElement).src = defaultImage;
          }}
        />
        <span className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.07em] shadow-sm ${colors}`}>
          {recipe.category}
        </span>
      </div>

      <div className="flex min-h-[160px] flex-col p-3">
        <h2 className="text-sm font-extrabold tracking-[-0.015em] text-[#4B2B1D] line-clamp-2">
          {recipe.name}
        </h2>

        <div className="mt-2 grid grid-cols-4 gap-1">
          <MacroBadge value={displayCalories} label="CAL" className="bg-[#E8EEF5] text-[#134DA1]" />
          <MacroBadge value={`${displayProtein}g`} label="PRO" className="bg-[#EAF5EC] text-[#16834A]" />
          <MacroBadge value={`${displayCarbs}g`} label="CARB" className="bg-[#FFF0E1] text-[#DC6500]" />
          <MacroBadge value={`${displayFat}g`} label="FAT" className="bg-[#FDEBEC] text-[#D62F3D]" />
        </div>
        <p className="mt-0.5 text-[9px] text-[#2E527F]">{servingLabel}</p>

        <div className="mt-auto pt-2 border-t border-[#E4D8C9]">
          <div className="flex items-center justify-between mb-2 relative">
            {component ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStructureMenu((v) => !v);
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition ${
                  selectedRow
                    ? "border-[#3E6594] bg-[#EDF2F7] text-[#2E527F]"
                    : "border-[#B9A88F] bg-[#FBF6EE] text-[#755B4C] hover:border-[#3E6594] hover:text-[#2E527F]"
                }`}
              >
                <Ruler className="h-3 w-3" />
                {selectedRow ? selectedRow.structure : "Per lb"}
                <ChevronDown className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-xs font-medium text-[#755B4C]">
                {recipe.servings}x • {recipe.prep_time_minutes || '?'} min
              </span>
            )}
            <span className="text-lg font-extrabold text-[#16813D]">
              ${displayCost.toFixed(2)}
            </span>

            {showStructureMenu && component && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-full left-0 z-20 mb-2 w-44 rounded-xl border border-[#2E527F] bg-white p-1.5 shadow-[0_12px_28px_rgba(75,43,29,0.16)]"
              >
                <button
                  onClick={() => {
                    onStructureChange(null);
                    setShowStructureMenu(false);
                  }}
                  className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold ${
                    selectedStructureIdx == null ? "bg-[#EDF2F7] text-[#2E527F]" : "text-[#4B2B1D] hover:bg-[#F8F2E8]"
                  }`}
                >
                  Per lb (455g)
                </button>
                {PLATE_STRUCTURE_SERVINGS.map((row, idx) => {
                  const grams = servingGramsFor(row, component);
                  const disabled = grams == null;
                  return (
                    <button
                      key={row.structure}
                      disabled={disabled}
                      onClick={() => {
                        onStructureChange(idx);
                        setShowStructureMenu(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold ${
                        disabled
                          ? "text-[#C9BBA8] cursor-not-allowed"
                          : selectedStructureIdx === idx
                          ? "bg-[#EDF2F7] text-[#2E527F]"
                          : "text-[#4B2B1D] hover:bg-[#F8F2E8]"
                      }`}
                    >
                      {row.structure}
                      <span className="text-[10px] font-normal text-[#2E527F]">
                        {disabled ? "n/a" : component === "protein" ? `${row.proteinOz}oz` : `${grams}g`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-[9px] text-[#2E527F]">{servingLabel}</p>
        </div>

        <div className="mt-2 flex justify-end gap-2 pt-2 border-t border-[#E4D8C9]">
          <button
            onClick={() => onEdit(recipe)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#B9A88F] bg-[#FBF6EE] text-[#2E527F] transition hover:border-[#3E6594] hover:bg-[#EDF2F7]"
            aria-label={`Edit ${recipe.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(recipe.recipe_id)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4B6B9] bg-[#FFF4F4] text-[#D62F3D] transition hover:bg-[#FDEBEC]"
            aria-label={`Delete ${recipe.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

function MacroBadge({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className: string;
}) {
  return (
    <div className={`rounded-lg px-1.5 py-1.5 text-center ${className}`}>
      <div className="truncate text-xs font-extrabold leading-none">{value}</div>
      <div className="mt-0.5 truncate text-[8px] font-extrabold uppercase tracking-[0.05em]">
        {label}
      </div>
    </div>
  );
}

// Lets an ingredient row declare how it's cooked, so its weight (and every
// per-pound/serving figure derived from it) reflects the actual finished
// dish instead of raw inputs -- see cookedGrams above. Shared by both the
// Add and Edit drawers' dry/wet ingredient lists.
function CookingMethodSelect({
  value,
  rawG,
  cookingMethods,
  onChange,
}: {
  value: number | null;
  rawG: number;
  cookingMethods: CookingMethod[];
  onChange: (id: number | null) => void;
}) {
  const method = value != null ? cookingMethods.find((m) => m.id === value) : null;
  const cooked = cookedGrams(rawG, value, cookingMethods);
  const changed = method && Math.round(cooked) !== Math.round(rawG);
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="h-6 rounded border border-[#D8CDBE] bg-white px-1 text-[9px] text-[#4B2B1D] outline-none"
      >
        <option value="">Raw / No Cooking</option>
        {cookingMethods
          .filter((m) => m.name !== "Raw / No Cooking")
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
      {changed && <span className="text-[9px] font-semibold text-[#2E527F]">→ {Math.round(cooked)}g cooked</span>}
    </div>
  );
}

function AddRecipeDrawer({
  open,
  onClose,
  isDraft = false,
  onDraftSave,
  draftRecipes = [],
}: {
  open: boolean;
  onClose: () => void;
  isDraft?: boolean;
  onDraftSave?: (drafts: Recipe[]) => void;
  draftRecipes?: Recipe[];
}) {
  type RecipeFormIngredient = {
    id: string;
    inventory_id: number;
    name: string;
    category?: string;
    quantity_g: number;
    prep_section: "dry" | "wet";
    cooking_method_id: number | null;
    unit_price_cents: number | null;
    protein_per_100g: number | null;
    carbs_per_100g: number | null;
    fat_per_100g: number | null;
    calories_per_100g: number | null;
  };

  const [form, setForm] = useState({
    name: "",
    category: "beef" as Category,
    prep_time_minutes: 30,
    image: "",
  });

  const [ingredients, setIngredients] = useState<RecipeFormIngredient[]>([]);
  const [cookingMethods, setCookingMethods] = useState<CookingMethod[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const apiUrl = import.meta.env.VITE_API_BASE_URL;
    axios
      .get(`${apiUrl}/api/admin/cooking-methods`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setCookingMethods(res.data.data || []))
      .catch(() => {});
  }, []);

  const addIngredient = (picked: PickedIngredient, prep_section: "dry" | "wet") => {
    setIngredients((prev) => [...prev, { id: Date.now().toString(), ...picked, prep_section, cooking_method_id: null }]);
  };
  const updateIngredientCookingMethod = (id: string, cooking_method_id: number | null) => {
    setIngredients((prev) => prev.map((ing) => (ing.id === id ? { ...ing, cooking_method_id } : ing)));
  };
  const [steps, setSteps] = useState<RecipeStep[]>([]);

  // Regular Servings isn't hand-entered either -- it's how many actual
  // Regular-plate servings this batch yields, i.e. total *cooked* weight
  // (cooking changes water weight, not nutrient content -- see
  // calculateRecipeMacros in adminRecipes.js) divided by the Regular row's
  // serving size for this category (see computeRegularServings above). An
  // ingredient with no cooking method set contributes its raw weight
  // unchanged, so a recipe with nothing tagged behaves exactly as before.
  const cookedWeightG = useMemo(
    () => ingredients.reduce((sum, ing) => sum + cookedGrams(ing.quantity_g, ing.cooking_method_id, cookingMethods), 0),
    [ingredients, cookingMethods]
  );
  const regularServings = useMemo(() => computeRegularServings(form.category, cookedWeightG), [form.category, cookedWeightG]);

  // Calories/macros are never hand-entered -- the backend recalculates them
  // live from ingredients on every read (see adminRecipes.js), so an
  // editable field here would silently get overwritten the moment the
  // recipe is reopened. Compute the same per-serving total client-side just
  // to show what it'll actually be.
  const computedMacros = useMemo(() => {
    const totals = ingredients.reduce(
      (acc, ing) => ({
        calories: acc.calories + ((ing.calories_per_100g || 0) * ing.quantity_g) / 100,
        protein_g: acc.protein_g + ((ing.protein_per_100g || 0) * ing.quantity_g) / 100,
        carbs_g: acc.carbs_g + ((ing.carbs_per_100g || 0) * ing.quantity_g) / 100,
        fat_g: acc.fat_g + ((ing.fat_per_100g || 0) * ing.quantity_g) / 100,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    const divisor = regularServings || 1;
    return {
      calories: Math.round(totals.calories / divisor),
      protein_g: +(totals.protein_g / divisor).toFixed(1),
      carbs_g: +(totals.carbs_g / divisor).toFixed(1),
      fat_g: +(totals.fat_g / divisor).toFixed(1),
    };
  }, [ingredients, regularServings]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
  }

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
  };

  const estimatedCostCents = (unitPriceCents: number | null, quantityG: number) => {
    if (!unitPriceCents) return null;
    return Math.round((unitPriceCents / 453.592) * quantityG);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (isDraft && onDraftSave) {
        // Save to drafts (local storage)
        const newDraft: Recipe = {
          recipe_id: Date.now(), // temporary ID
          ...form,
          servings: regularServings || 1,
          calories: computedMacros.calories,
          protein_g: computedMacros.protein_g.toString(),
          carbs_g: computedMacros.carbs_g.toString(),
          fat_g: computedMacros.fat_g.toString(),
          cost_per_serving_cents: 0,
          ingredients: ingredients.map((ing) => ({
            id: Number(ing.id) || 0,
            inventory_id: ing.inventory_id,
            name: ing.name,
            quantity_g: ing.quantity_g,
            prep_section: ing.prep_section,
            cooking_method_id: ing.cooking_method_id,
            unit_price_cents: ing.unit_price_cents ?? undefined,
          })),
          steps: steps.map((s, i) => ({
            id: i,
            step_number: i + 1,
            title: s.title || null,
            description: s.description,
            time_estimate_minutes: s.time_estimate_minutes,
          })),
        };
        onDraftSave([...draftRecipes, newDraft]);
      } else {
        // Save to database
        await axios.post(
          `${apiUrl}/api/admin/recipes`,
          {
            name: form.name.trim(),
            category: form.category,
            servings: regularServings || 1,
            prep_time_minutes: form.prep_time_minutes,
            calories: computedMacros.calories,
            protein_g: computedMacros.protein_g,
            carbs_g: computedMacros.carbs_g,
            fat_g: computedMacros.fat_g,
            image: form.image || null,
            ingredients: ingredients.map((ing) => ({
              inventory_id: ing.inventory_id,
              quantity_g: ing.quantity_g,
              prep_section: ing.prep_section,
              cooking_method_id: ing.cooking_method_id,
            })),
            steps: steps.map((s) => ({ title: s.title, description: s.description, time_estimate_minutes: s.time_estimate_minutes })),
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      setForm({
        name: "",
        category: "beef",
        prep_time_minutes: 30,
        image: "",
      });
      setSteps([]);

      onClose();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || "Failed to create recipe");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {open && (
        <button
          onClick={onClose}
          aria-label="Close add recipe drawer"
          className="fixed inset-0 z-40 bg-[#2A1A12]/20 backdrop-blur-[1px] xl:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col border-l border-[#D8CDBE] bg-[#F8F2E8] shadow-[-18px_0_50px_rgba(75,43,29,0.12)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#DED2C2] px-6 py-5">
          <div>
            <p className="text-2xl font-extrabold tracking-[-0.03em]">Add Recipe</p>
            <p className="mt-1 text-xs text-[#755B4C]">Create a new menu-ready recipe.</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#B9A88F] bg-[rgba(251,247,240,0.9)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {submitError && (
              <div className="rounded-lg border border-[#E8B4B9] bg-[#FFF4F5] p-3">
                <p className="text-xs text-[#D62F3D]">{submitError}</p>
              </div>
            )}

            <Field label="Recipe Name">
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Enter recipe name"
                className={INPUT_CLASS}
                required
              />
            </Field>

            <RecipeImportPanel
              onApply={(imported) => {
                setForm((current) => ({
                  ...current,
                  name: imported.name,
                  category: imported.category as Category,
                  prep_time_minutes: imported.prep_time_minutes ?? current.prep_time_minutes,
                  image: imported.image || current.image,
                }));
                setIngredients((prev) => [
                  ...prev,
                  ...imported.ingredients.map((ing) => ({ id: Date.now().toString() + Math.random(), ...ing, prep_section: "dry" as const })),
                ]);
                setSteps((prev) => [...prev, ...imported.steps]);
              }}
            />

            <Field label="Category">
              <div className="grid grid-cols-4 gap-1.5">
                {(["beef", "chicken", "turkey", "carbohydrates", "vegetables", "sauces", "beverage", "breakfast"] as Category[]).map((category) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => update("category", category)}
                    className={`h-9 rounded-lg border text-[10px] font-extrabold transition ${
                      form.category === category
                        ? CATEGORY_CLASSES[category]
                        : "border-[#B9A88F] bg-[rgba(251,247,240,0.9)] text-[#4B2B1D] hover:bg-[#EDF2F7]"
                    }`}
                  >
                    {category === "carbohydrates" ? "carb" : category === "vegetables" ? "veg" : category}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Regular Servings">
                <ReadOnlyValue value={regularServings} />
              </Field>
              <Field label="Prep Time (minutes)">
                <input
                  type="number"
                  min={0}
                  value={form.prep_time_minutes}
                  onChange={(event) =>
                    update("prep_time_minutes", Number(event.target.value))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <Field label="Calories">
              <ReadOnlyValue value={computedMacros.calories} />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Protein (g)">
                <ReadOnlyValue value={computedMacros.protein_g} />
              </Field>
              <Field label="Carbs (g)">
                <ReadOnlyValue value={computedMacros.carbs_g} />
              </Field>
              <Field label="Fat (g)">
                <ReadOnlyValue value={computedMacros.fat_g} />
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <Field label="Dry Ingredients">
                <div className="space-y-2 border border-[#B9A88F] rounded-xl p-3 bg-[#FBF6EE]">
                  <div className="pb-3 border-b border-[#D8CDBE]">
                    <IngredientPicker onAdd={(picked: PickedIngredient) => addIngredient(picked, "dry")} />
                  </div>
                  {ingredients.filter((ing) => ing.prep_section === "dry").length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {ingredients.filter((ing) => ing.prep_section === "dry").map((ing) => {
                        const cost = estimatedCostCents(ing.unit_price_cents, ing.quantity_g);
                        return (
                          <div key={ing.id} className="flex justify-between items-center bg-[rgba(251,247,240,0.9)] p-2 rounded-lg border border-[#E4D8C9]">
                            <div className="flex-1">
                              <p className="text-xs font-bold text-[#4B2B1D]">{ing.name}</p>
                              <p className="text-[10px] text-[#755B4C]">
                                {formatIngredientWeight(ing.quantity_g, ing.category)}{cost !== null && ` • $${(cost / 100).toFixed(2)}`}
                              </p>
                              <CookingMethodSelect
                                value={ing.cooking_method_id}
                                rawG={ing.quantity_g}
                                cookingMethods={cookingMethods}
                                onChange={(id) => updateIngredientCookingMethod(ing.id, id)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeIngredient(ing.id)}
                              className="ml-2 text-[#D62F3D] hover:bg-[#FDEBEC] p-1 rounded transition"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Wet Ingredients">
                <div className="space-y-2 border border-[#B9A88F] rounded-xl p-3 bg-[#FBF6EE]">
                  <div className="pb-3 border-b border-[#D8CDBE]">
                    <IngredientPicker onAdd={(picked: PickedIngredient) => addIngredient(picked, "wet")} />
                  </div>
                  {ingredients.filter((ing) => ing.prep_section === "wet").length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {ingredients.filter((ing) => ing.prep_section === "wet").map((ing) => {
                        const cost = estimatedCostCents(ing.unit_price_cents, ing.quantity_g);
                        return (
                          <div key={ing.id} className="flex justify-between items-center bg-[rgba(251,247,240,0.9)] p-2 rounded-lg border border-[#E4D8C9]">
                            <div className="flex-1">
                              <p className="text-xs font-bold text-[#4B2B1D]">{ing.name}</p>
                              <p className="text-[10px] text-[#755B4C]">
                                {formatIngredientWeight(ing.quantity_g, ing.category)}{cost !== null && ` • $${(cost / 100).toFixed(2)}`}
                              </p>
                              <CookingMethodSelect
                                value={ing.cooking_method_id}
                                rawG={ing.quantity_g}
                                cookingMethods={cookingMethods}
                                onChange={(id) => updateIngredientCookingMethod(ing.id, id)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeIngredient(ing.id)}
                              className="ml-2 text-[#D62F3D] hover:bg-[#FDEBEC] p-1 rounded transition"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Field>
            </div>

            <Field label="Prep steps">
              <RecipeStepsEditor steps={steps} onChange={setSteps} />
            </Field>

            <Field label="Recipe Image URL">
              <input
                value={form.image}
                onChange={(event) => update("image", event.target.value)}
                placeholder="https://..."
                className={INPUT_CLASS}
              />
              <div className="mt-3 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-[#3E6594] bg-[#F5EFE5] px-4 text-center">
                <div>
                  <ImagePlus className="mx-auto h-6 w-6 text-[#2E527F]" />
                  <p className="mt-2 text-xs font-bold">Paste an image URL above</p>
                  <p className="mt-1 text-[11px] text-[#755B4C]">
                    Use consistent top-down meal photography.
                  </p>
                </div>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-[#DED2C2] bg-[#F8F2E8] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-xl border border-[#B9A88F] bg-[rgba(251,247,240,0.9)] text-sm font-extrabold text-[#4B2B1D]"
            >
              Cancel
            </button>
            {isDraft && (
              <button
                type="button"
                onClick={() => {
                  if (isDraft && onDraftSave) {
                    const newDraft: Recipe = {
                      recipe_id: Date.now(),
                      ...form,
                      servings: regularServings || 1,
                      calories: computedMacros.calories,
                      protein_g: computedMacros.protein_g.toString(),
                      carbs_g: computedMacros.carbs_g.toString(),
                      fat_g: computedMacros.fat_g.toString(),
                      cost_per_serving_cents: 0,
                      ingredients: ingredients.map((ing) => ({
                        id: Number(ing.id) || 0,
                        inventory_id: ing.inventory_id,
                        name: ing.name,
                        quantity_g: ing.quantity_g,
                        prep_section: ing.prep_section,
                        cooking_method_id: ing.cooking_method_id,
                        unit_price_cents: ing.unit_price_cents ?? undefined,
                      })),
                    };
                    onDraftSave([...draftRecipes, newDraft]);
                    onClose();
                  }
                }}
                className="h-12 rounded-xl border border-[#F59E0B] bg-[#FEF3C7] text-sm font-extrabold text-[#92400E] hover:bg-[#FCD34D]"
              >
                Save to Draft
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2E527F] text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(46,82,127,0.18)] hover:bg-[#24466E] disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
              {submitting ? "Creating..." : "Create Recipe"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-extrabold text-[#4B2B1D]">{label}</span>
      {children}
    </label>
  );
}

function EditRecipeDrawer({
  recipe,
  onClose,
  onSave,
  draftRecipes,
  saveDrafts,
}: {
  recipe: Recipe;
  onClose: () => void;
  onSave?: () => void;
  draftRecipes?: Recipe[];
  saveDrafts?: (drafts: Recipe[]) => void;
}) {
  type RecipeFormIngredient = {
    id: string;
    inventory_id: number;
    name: string;
    category?: string;
    quantity_g: number;
    prep_section: "dry" | "wet";
    cooking_method_id: number | null;
    unit_price_cents: number | null;
    protein_per_100g: number | null;
    carbs_per_100g: number | null;
    fat_per_100g: number | null;
    calories_per_100g: number | null;
  };

  const [form, setForm] = useState({
    name: recipe.name || "",
    category: recipe.category || ("beef" as Category),
    prep_time_minutes: recipe.prep_time_minutes || 0,
    image: recipe.image || "",
  });

  const [ingredients, setIngredients] = useState<RecipeFormIngredient[]>(
    recipe.ingredients?.map((ing) => ({
      id: ing.id?.toString() || Date.now().toString(),
      inventory_id: ing.inventory_id,
      name: ing.name || "",
      quantity_g: ing.quantity_g || 0,
      prep_section: ing.prep_section === "wet" ? "wet" : "dry",
      cooking_method_id: ing.cooking_method_id ?? null,
      unit_price_cents: ing.unit_price_cents ?? null,
      protein_per_100g: ing.protein_per_100g ?? null,
      carbs_per_100g: ing.carbs_per_100g ?? null,
      fat_per_100g: ing.fat_per_100g ?? null,
      calories_per_100g: ing.calories_per_100g ?? null,
    })) || []
  );
  const [cookingMethods, setCookingMethods] = useState<CookingMethod[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const apiUrl = import.meta.env.VITE_API_BASE_URL;
    axios
      .get(`${apiUrl}/api/admin/cooking-methods`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setCookingMethods(res.data.data || []))
      .catch(() => {});
  }, []);

  const addIngredient = (picked: PickedIngredient, prep_section: "dry" | "wet") => {
    setIngredients((prev) => [...prev, { id: Date.now().toString(), ...picked, prep_section, cooking_method_id: null }]);
  };
  const updateIngredientCookingMethod = (id: string, cooking_method_id: number | null) => {
    setIngredients((prev) => prev.map((ing) => (ing.id === id ? { ...ing, cooking_method_id } : ing)));
  };
  const [steps, setSteps] = useState<RecipeStep[]>(
    recipe.steps?.map((s) => ({
      id: s.id?.toString() || Date.now().toString(),
      title: s.title || "",
      description: s.description,
      time_estimate_minutes: s.time_estimate_minutes ?? null,
    })) || []
  );

  // Regular Servings isn't hand-entered either -- it's how many actual
  // Regular-plate servings this batch yields, i.e. total *cooked* weight
  // (see cookedGrams above) divided by the Regular row's serving size for
  // this category (see computeRegularServings above).
  const cookedWeightG = useMemo(
    () => ingredients.reduce((sum, ing) => sum + cookedGrams(ing.quantity_g, ing.cooking_method_id, cookingMethods), 0),
    [ingredients, cookingMethods]
  );
  const regularServings = useMemo(() => computeRegularServings(form.category, cookedWeightG), [form.category, cookedWeightG]);

  // Calories/macros are never hand-entered -- the backend recalculates them
  // live from ingredients on every read (see adminRecipes.js), so an
  // editable field here would silently get overwritten the moment the
  // recipe is reopened. Compute the same per-serving total client-side just
  // to show what it'll actually be.
  const computedMacros = useMemo(() => {
    const totals = ingredients.reduce(
      (acc, ing) => ({
        calories: acc.calories + ((ing.calories_per_100g || 0) * ing.quantity_g) / 100,
        protein_g: acc.protein_g + ((ing.protein_per_100g || 0) * ing.quantity_g) / 100,
        carbs_g: acc.carbs_g + ((ing.carbs_per_100g || 0) * ing.quantity_g) / 100,
        fat_g: acc.fat_g + ((ing.fat_per_100g || 0) * ing.quantity_g) / 100,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    const divisor = regularServings || 1;
    return {
      calories: Math.round(totals.calories / divisor),
      protein_g: +(totals.protein_g / divisor).toFixed(1),
      carbs_g: +(totals.carbs_g / divisor).toFixed(1),
      fat_g: +(totals.fat_g / divisor).toFixed(1),
    };
  }, [ingredients, regularServings]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
  }

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
  };

  const estimatedCostCents = (unitPriceCents: number | null, quantityG: number) => {
    if (!unitPriceCents) return null;
    return Math.round((unitPriceCents / 453.592) * quantityG);
  };

  const updateIngredientQuantity = (id: string, quantityG: number) => {
    setIngredients(
      ingredients.map((ing) => (ing.id === id ? { ...ing, quantity_g: quantityG } : ing))
    );
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    // Drafts only ever exist in localStorage with a fake Date.now()-based
    // id -- saving one has to POST (create) a real row, never PUT (update)
    // against an id the database has never seen.
    const isDraftRecipe = draftRecipes?.some((r) => r.recipe_id === recipe.recipe_id) ?? false;

    const payload = {
      name: form.name.trim(),
      category: form.category,
      servings: regularServings || 1,
      prep_time_minutes: form.prep_time_minutes,
      calories: computedMacros.calories,
      protein_g: computedMacros.protein_g,
      carbs_g: computedMacros.carbs_g,
      fat_g: computedMacros.fat_g,
      image: form.image || null,
      ingredients: ingredients.map((ing) => ({
        inventory_id: ing.inventory_id,
        quantity_g: ing.quantity_g,
        prep_section: ing.prep_section,
        cooking_method_id: ing.cooking_method_id,
      })),
      steps: steps.map((s) => ({ title: s.title, description: s.description, time_estimate_minutes: s.time_estimate_minutes })),
    };

    try {
      if (isDraftRecipe) {
        await axios.post(`${apiUrl}/api/admin/recipes`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (draftRecipes && saveDrafts) {
          saveDrafts(draftRecipes.filter((r) => r.recipe_id !== recipe.recipe_id));
        }
      } else {
        await axios.put(`${apiUrl}/api/admin/recipes/${recipe.recipe_id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      onSave?.();
      onClose();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || `Failed to ${isDraftRecipe ? "create" : "update"} recipe`);
    } finally {
      setSubmitting(false);
    }
  }

  const categoryKey = recipe.category as Category;
  const colors = CATEGORY_CLASSES[categoryKey] || CATEGORY_CLASSES.beef;

  return (
    <>
      <button
        onClick={onClose}
        aria-label="Close edit recipe drawer"
        className="fixed inset-0 z-40 bg-[#2A1A12]/30 backdrop-blur-[1px]"
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col border-l border-[#D8CDBE] bg-[#F8F2E8] shadow-[-18px_0_50px_rgba(75,43,29,0.12)] transition-transform duration-300 translate-x-0`}
      >
        <div className="flex items-center justify-between border-b border-[#DED2C2] px-6 py-5">
          <div>
            <p className="text-2xl font-extrabold tracking-[-0.03em] text-[#4B2B1D]">
              Edit Recipe
            </p>
            <p className="mt-1 text-xs text-[#755B4C]">{recipe.name}</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#B9A88F] bg-[rgba(251,247,240,0.9)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {submitError && (
              <div className="rounded-lg border border-[#E8B4B9] bg-[#FFF4F5] p-3">
                <p className="text-xs text-[#D62F3D]">{submitError}</p>
              </div>
            )}

            <Field label="Recipe Name">
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Enter recipe name"
                className={INPUT_CLASS}
                required
              />
            </Field>

            <Field label="Category">
              <div className="grid grid-cols-4 gap-1.5">
                {(["beef", "chicken", "turkey", "carbohydrates", "vegetables", "sauces", "beverage", "breakfast"] as Category[]).map((category) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => update("category", category)}
                    className={`h-9 rounded-lg border text-[10px] font-extrabold transition ${
                      form.category === category
                        ? CATEGORY_CLASSES[category]
                        : "border-[#B9A88F] bg-[rgba(251,247,240,0.9)] text-[#4B2B1D] hover:bg-[#EDF2F7]"
                    }`}
                  >
                    {category === "carbohydrates" ? "carb" : category === "vegetables" ? "veg" : category}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Regular Servings">
                <ReadOnlyValue value={regularServings} />
              </Field>
              <Field label="Prep Time (min)">
                <input
                  type="number"
                  min={0}
                  value={form.prep_time_minutes}
                  onChange={(event) =>
                    update("prep_time_minutes", Number(event.target.value))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <Field label="Calories">
              <ReadOnlyValue value={computedMacros.calories} />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Protein (g)">
                <ReadOnlyValue value={computedMacros.protein_g} />
              </Field>
              <Field label="Carbs (g)">
                <ReadOnlyValue value={computedMacros.carbs_g} />
              </Field>
              <Field label="Fat (g)">
                <ReadOnlyValue value={computedMacros.fat_g} />
              </Field>
            </div>

            <Field label="Prep steps">
              <RecipeStepsEditor steps={steps} onChange={setSteps} />
            </Field>

            <div className="flex flex-col gap-3">
              <Field label="Dry Ingredients">
                <div className="space-y-2 border border-[#B9A88F] rounded-xl p-3 bg-[#FBF6EE]">
                  {ingredients.filter((ing) => ing.prep_section === "dry").length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto pb-2 border-b border-[#D8CDBE]">
                      {ingredients.filter((ing) => ing.prep_section === "dry").map((ing) => {
                        const cost = estimatedCostCents(ing.unit_price_cents, ing.quantity_g);
                        return (
                          <div key={ing.id} className="flex justify-between items-center bg-[rgba(251,247,240,0.9)] p-2 rounded-lg border border-[#E4D8C9]">
                            <div className="flex-1">
                              <p className="text-xs font-bold text-[#4B2B1D]">{ing.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <input
                                  type="number"
                                  value={ing.quantity_g}
                                  onChange={(e) => updateIngredientQuantity(ing.id, Number(e.target.value))}
                                  className="w-16 text-[10px] text-[#755B4C] bg-white border border-[#D8CDBE] rounded px-1 outline-none"
                                />
                                <span className="text-[10px] text-[#755B4C]">
                                  g{cost !== null && ` • $${(cost / 100).toFixed(2)}`}
                                </span>
                              </div>
                              <CookingMethodSelect
                                value={ing.cooking_method_id}
                                rawG={ing.quantity_g}
                                cookingMethods={cookingMethods}
                                onChange={(id) => updateIngredientCookingMethod(ing.id, id)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeIngredient(ing.id)}
                              className="ml-2 text-[#D62F3D] hover:bg-[#FDEBEC] p-1 rounded transition"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <IngredientPicker onAdd={(picked: PickedIngredient) => addIngredient(picked, "dry")} />
                </div>
              </Field>

              <Field label="Wet Ingredients">
                <div className="space-y-2 border border-[#B9A88F] rounded-xl p-3 bg-[#FBF6EE]">
                  {ingredients.filter((ing) => ing.prep_section === "wet").length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto pb-2 border-b border-[#D8CDBE]">
                      {ingredients.filter((ing) => ing.prep_section === "wet").map((ing) => {
                        const cost = estimatedCostCents(ing.unit_price_cents, ing.quantity_g);
                        return (
                          <div key={ing.id} className="flex justify-between items-center bg-[rgba(251,247,240,0.9)] p-2 rounded-lg border border-[#E4D8C9]">
                            <div className="flex-1">
                              <p className="text-xs font-bold text-[#4B2B1D]">{ing.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <input
                                  type="number"
                                  value={ing.quantity_g}
                                  onChange={(e) => updateIngredientQuantity(ing.id, Number(e.target.value))}
                                  className="w-16 text-[10px] text-[#755B4C] bg-white border border-[#D8CDBE] rounded px-1 outline-none"
                                />
                                <span className="text-[10px] text-[#755B4C]">
                                  g{cost !== null && ` • $${(cost / 100).toFixed(2)}`}
                                </span>
                              </div>
                              <CookingMethodSelect
                                value={ing.cooking_method_id}
                                rawG={ing.quantity_g}
                                cookingMethods={cookingMethods}
                                onChange={(id) => updateIngredientCookingMethod(ing.id, id)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeIngredient(ing.id)}
                              className="ml-2 text-[#D62F3D] hover:bg-[#FDEBEC] p-1 rounded transition"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <IngredientPicker onAdd={(picked: PickedIngredient) => addIngredient(picked, "wet")} />
                </div>
              </Field>
            </div>

            <Field label="Image URL">
              <input
                value={form.image}
                onChange={(event) => update("image", event.target.value)}
                placeholder="https://..."
                className={INPUT_CLASS}
              />
            </Field>

            {recipe.cost_per_serving_cents !== undefined && (
              <div className="rounded-xl bg-[#EAF5EC] p-3 border border-[#16834A]">
                <p className="text-xs text-[#755B4C] font-bold mb-1">DYNAMIC COST PER SERVING</p>
                <p className="text-lg font-extrabold text-[#16813D]">
                  ${(recipe.cost_per_serving_cents / 100).toFixed(2)}
                </p>
                <p className="text-[10px] text-[#755B4C] mt-1">
                  Calculated from current inventory pricing
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-[#DED2C2] bg-[#F8F2E8] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-xl border border-[#B9A88F] bg-[rgba(251,247,240,0.9)] text-sm font-extrabold text-[#4B2B1D]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2E527F] text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(46,82,127,0.18)] hover:bg-[#24466E] disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function RecipeDetailsDrawer({
  recipe,
  onClose,
}: {
  recipe: Recipe;
  onClose: () => void;
}) {
  const defaultImage =
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80";
  const categoryKey = recipe.category as Category;
  const colors = CATEGORY_CLASSES[categoryKey] || CATEGORY_CLASSES.beef;
  const calories = recipe.per_pound?.calories ?? 0;
  const protein = parseFloat(recipe.per_pound?.protein_g ?? '0');
  const carbs = parseFloat(recipe.per_pound?.carbs_g ?? '0');
  const fat = parseFloat(recipe.per_pound?.fat_g ?? '0');

  return (
    <>
      {
        <button
          onClick={onClose}
          aria-label="Close recipe details"
          className="fixed inset-0 z-40 bg-[#2A1A12]/30 backdrop-blur-[1px]"
        />
      }

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-[#D8CDBE] bg-[#F8F2E8] shadow-[-18px_0_50px_rgba(75,43,29,0.12)] transition-transform duration-300 translate-x-0`}
      >
        <div className="flex items-center justify-between border-b border-[#DED2C2] px-6 py-5">
          <div>
            <p className="text-2xl font-extrabold tracking-[-0.03em] text-[#4B2B1D]">
              {recipe.name}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.07em] shadow-sm ${colors}`}>
                {recipe.category}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#B9A88F] bg-[rgba(251,247,240,0.9)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Recipe Image */}
          <div className="rounded-2xl overflow-hidden h-64 bg-[#E3D8C9]">
            <img
              src={recipe.image || defaultImage}
              alt={recipe.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = defaultImage;
              }}
            />
          </div>

          {/* Key Metrics Grid -- per lb (455g) of the recipe, same basis as the card */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#E8EEF5] p-3 text-center">
              <p className="text-xs text-[#755B4C] font-bold mb-1">CALORIES</p>
              <p className="text-xl font-extrabold text-[#134DA1]">{calories}</p>
            </div>
            <div className="rounded-xl bg-[#EAF5EC] p-3 text-center">
              <p className="text-xs text-[#755B4C] font-bold mb-1">PROTEIN</p>
              <p className="text-xl font-extrabold text-[#16834A]">{protein.toFixed(1)}g</p>
            </div>
            <div className="rounded-xl bg-[#FFF0E1] p-3 text-center">
              <p className="text-xs text-[#755B4C] font-bold mb-1">CARBS</p>
              <p className="text-xl font-extrabold text-[#DC6500]">{carbs.toFixed(1)}g</p>
            </div>
            <div className="rounded-xl bg-[#FDEBEC] p-3 text-center">
              <p className="text-xs text-[#755B4C] font-bold mb-1">FAT</p>
              <p className="text-xl font-extrabold text-[#D62F3D]">{fat.toFixed(1)}g</p>
            </div>
          </div>
          <p className="-mt-3 text-[10px] text-[#2E527F]">per lb (455g)</p>

          {/* Cost and Servings */}
          <div className="grid grid-cols-2 gap-4 border-t border-[#D8CDBE] pt-4">
            <div className="rounded-xl bg-[#F5F0E8] p-4">
              <p className="text-xs text-[#755B4C] font-bold mb-1">PRICE PER 1 LB</p>
              <p className="text-2xl font-extrabold text-[#16813D]">
                ${((recipe.cost_per_pound_cents ?? 0) / 100).toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl bg-[#F5F0E8] p-4">
              <p className="text-xs text-[#755B4C] font-bold mb-1">SERVINGS</p>
              <p className="text-2xl font-extrabold text-[#2E527F]">
                {recipe.servings}
              </p>
            </div>
          </div>

          {/* Prep Time and Description */}
          {recipe.prep_time_minutes && (
            <div className="rounded-xl bg-[#F5F0E8] p-4 border border-[#E4D8C9]">
              <p className="text-xs text-[#755B4C] font-bold mb-2">PREP TIME</p>
              <p className="inline-flex items-center gap-2 text-lg font-extrabold text-[#4B2B1D]">
                <Clock3 className="h-5 w-5 text-[#2E527F]" />
                {recipe.prep_time_minutes} minutes
              </p>
            </div>
          )}

          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div className="rounded-xl bg-[#F5F0E8] p-4 border border-[#E4D8C9]">
              <p className="text-xs text-[#755B4C] font-bold mb-3">INGREDIENTS</p>
              {(["dry", "wet"] as const).map((section) => {
                const sectionIngredients = recipe.ingredients!.filter((ing) =>
                  section === "dry" ? ing.prep_section !== "wet" : ing.prep_section === "wet"
                );
                if (sectionIngredients.length === 0) return null;
                return (
                  <div key={section} className="mb-4 last:mb-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#2E527F] mb-1.5">
                      {section === "dry" ? "Dry" : "Wet"}
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {sectionIngredients.map((ing) => (
                        <div key={ing.id} className="flex justify-between items-center py-2 border-b border-[#E4D8C9] last:border-0">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[#4B2B1D]">{ing.name}</p>
                            <p className="text-xs text-[#755B4C]">
                              {formatIngredientWeight(ing.quantity_g, ing.category)}
                              {ing.cooking_method_name && (
                                <span className="ml-1.5 rounded-full bg-[#EAF0F7] px-1.5 py-[1px] text-[9px] font-bold text-[#2E527F] align-middle">
                                  {ing.cooking_method_name}
                                </span>
                              )}
                              {ing.priced_from_receipt && (
                                <span className="ml-1.5 text-[#D97706]" title="No price set in Inventory — using the real price last paid on a scanned receipt">
                                  ≈ from receipt
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-right ml-3">
                            {ing.ingredient_cost_cents !== undefined && ing.ingredient_cost_cents !== null && ing.ingredient_cost_cents > 0 ? (
                              <>
                                <p className="text-sm font-extrabold text-[#16813D]">
                                  ${(ing.ingredient_cost_cents / 100).toFixed(2)}
                                </p>
                                {ing.unit_price_cents && typeof ing.unit_price_cents === 'number' && (
                                  <p className="text-xs text-[#755B4C]">
                                    ${(ing.unit_price_cents / 100).toFixed(2)}/lb
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="inline-block bg-[#FFF0E1] text-[#DC6500] text-xs font-extrabold px-2 py-1 rounded">
                                Not in Inventory
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {recipe.total_recipe_cost_cents !== undefined && (
                <div className="mt-3 pt-3 border-t border-[#D8CDBE] flex justify-between items-center">
                  <span className="text-xs font-bold text-[#755B4C]">TOTAL RECIPE COST</span>
                  <span className="text-lg font-extrabold text-[#16813D]">
                    ${(recipe.total_recipe_cost_cents / 100).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {recipe.steps && recipe.steps.length > 0 ? (
            <div className="rounded-xl bg-[#F5F0E8] p-4 border border-[#E4D8C9]">
              <p className="text-xs text-[#755B4C] font-bold mb-3">PREP STEPS</p>
              <div className="space-y-3">
                {recipe.steps.map((step, i) => (
                  <div key={step.id} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2E527F] text-[10px] font-extrabold text-white">
                      {i + 1}
                    </span>
                    <div>
                      {step.title && <p className="text-sm font-bold text-[#4B2B1D]">{step.title}</p>}
                      <p className="text-sm text-[#755B4C]">
                        {step.description}
                        {step.time_estimate_minutes ? ` (${step.time_estimate_minutes} min)` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : recipe.instructions ? (
            <div className="rounded-xl bg-[#F5F0E8] p-4 border border-[#E4D8C9]">
              <p className="text-xs text-[#755B4C] font-bold mb-2">INSTRUCTIONS</p>
              <p className="text-sm text-[#4B2B1D] leading-relaxed">{recipe.instructions}</p>
            </div>
          ) : null}

          {/* Decision Making Helpers */}
          <div className="grid grid-cols-2 gap-3 border-t border-[#D8CDBE] pt-4">
            <div className="rounded-xl bg-[#FFF4F5] p-3 text-center">
              <p className="text-xs text-[#755B4C] font-bold mb-1">PROTEIN/SERVING</p>
              <p className="text-lg font-extrabold text-[#D62F3D]">
                {(protein / recipe.servings).toFixed(1)}g
              </p>
            </div>
            <div className="rounded-xl bg-[#FFF0E1] p-3 text-center">
              <p className="text-xs text-[#755B4C] font-bold mb-1">TOTAL COST</p>
              <p className="text-lg font-extrabold text-[#DC6500]">
                ${(recipe.cost_per_serving_cents / 100 * recipe.servings).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
