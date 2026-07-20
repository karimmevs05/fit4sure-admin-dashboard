import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  ImagePlus,
  Pencil,
  Plus,
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
  quantity_g: number;
  price_per_pound?: number;
  ingredient_cost_cents?: number;
};

type Recipe = {
  recipe_id: number;
  name: string;
  category: Category;
  image?: string;
  instructions?: string;
  calories: number;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  servings: number;
  prep_time_minutes: number | null;
  cost_per_serving_cents: number;
  total_recipe_cost_cents?: number;
  ingredients?: RecipeIngredient[];
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
  "h-11 w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10";

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
  const [page, setPage] = useState(1);
  const pageSize = 6;

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRecipes = filtered.slice((page - 1) * pageSize, page * pageSize);

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
            setSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            activeCategory={activeCategory}
            setActiveCategory={(value) => {
              setActiveCategory(value);
              setPage(1);
            }}
            onAdd={() => setDrawerOpen(true)}
            activeTab={activeTab}
            onTabChange={setActiveTab}
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
              <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-10 text-center">
                <p className="text-lg font-extrabold">Loading recipes...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                  {visibleRecipes.map((recipe) => (
                    <RecipeCard
                      key={recipe.recipe_id}
                      recipe={recipe}
                      onDelete={deleteRecipe}
                      onSelect={(r) => fetchRecipeDetails(r.recipe_id)}
                      onEdit={(r) => {
                        console.log("Edit clicked for recipe:", r.name);
                        setSelectedRecipe(null); // Close details drawer
                        setEditingRecipe(r);
                      }}
                    />
                  ))}
                </div>

                {visibleRecipes.length === 0 && (
                  <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-10 text-center">
                    <p className="text-lg font-extrabold">No recipes found.</p>
                    <p className="mt-1 text-sm text-[#755B4C]">
                      Try a different search or category.
                    </p>
                  </div>
                )}

                {filtered.length > 0 && (
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    count={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                  />
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
}: {
  search: string;
  setSearch: (value: string) => void;
  activeCategory: "ALL" | Category;
  setActiveCategory: (value: "ALL" | Category) => void;
  onAdd: () => void;
  activeTab: "library" | "drafts";
  onTabChange: (tab: "library" | "drafts") => void;
}) {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D7C9B7] bg-[#FBF7F0] text-[#2E527F]">
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
            className="h-12 w-full rounded-xl border border-[#B7A58F] bg-[#FBF7F0] pl-11 pr-4 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#8D7A69] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2E527F]" />
          <select
            value={activeCategory}
            onChange={(event) =>
              setActiveCategory(event.target.value as "ALL" | Category)
            }
            className="h-12 appearance-none rounded-xl border border-[#B7A58F] bg-[#FBF7F0] pl-11 pr-10 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
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
  onDelete,
  onSelect,
  onEdit,
}: {
  recipe: Recipe;
  onDelete: (id: number) => void;
  onSelect: (recipe: Recipe) => void;
  onEdit: (recipe: Recipe) => void;
}) {
  const defaultImage =
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80";
  const categoryKey = recipe.category as Category;
  const colors = CATEGORY_CLASSES[categoryKey] || CATEGORY_CLASSES.beef;

  return (
    <article onClick={() => onSelect(recipe)} className="group cursor-pointer overflow-hidden rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] shadow-[0_8px_24px_rgba(75,43,29,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[#3E6594]/50 hover:shadow-[0_14px_32px_rgba(75,43,29,0.10)]">
      <div className="relative h-[140px] overflow-hidden bg-[#E3D8C9]">
        <img
          src={recipe.image || defaultImage}
          alt={recipe.name}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
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
          <MacroBadge
            value={recipe.calories}
            label="CAL"
            className="bg-[#E8EEF5] text-[#134DA1]"
          />
          <MacroBadge
            value={`${Math.round(parseFloat(recipe.protein_g))}g`}
            label="PRO"
            className="bg-[#EAF5EC] text-[#16834A]"
          />
          <MacroBadge
            value={`${Math.round(parseFloat(recipe.carbs_g))}g`}
            label="CARB"
            className="bg-[#FFF0E1] text-[#DC6500]"
          />
          <MacroBadge
            value={`${Math.round(parseFloat(recipe.fat_g))}g`}
            label="FAT"
            className="bg-[#FDEBEC] text-[#D62F3D]"
          />
        </div>

        <div className="mt-auto pt-2 border-t border-[#E4D8C9]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#755B4C]">
              {recipe.servings}x • {recipe.prep_time_minutes || '?'} min
            </span>
            <span className="text-lg font-extrabold text-[#16813D]">
              ${(recipe.cost_per_serving_cents / 100).toFixed(2)}
            </span>
          </div>
          <p className="text-[9px] text-[#9A8774]">per serving</p>
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

function Pagination({
  page,
  totalPages,
  count,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  count: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);

  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-[#D8CDBE] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[#755B4C]">
        Showing {start} to {end} of {count} recipes
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#B9A88F] bg-[#FBF7F0] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-extrabold ${
              item === page
                ? "bg-[#2E527F] text-white"
                : "border border-[#B9A88F] bg-[#FBF7F0] text-[#4B2B1D] hover:border-[#3E6594]"
            }`}
          >
            {item}
          </button>
        ))}

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#B9A88F] bg-[#FBF7F0] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
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
    name: string;
    amount: string;
    unit: string;
    weight_g: number;
    price: string;
  };

  const [form, setForm] = useState({
    name: "",
    category: "beef" as Category,
    servings: 1,
    prep_time_minutes: 30,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    image: "",
    instructions: "",
  });

  const [ingredients, setIngredients] = useState<RecipeFormIngredient[]>([]);
  const [newIngredient, setNewIngredient] = useState<RecipeFormIngredient>({
    id: "",
    name: "",
    amount: "",
    unit: "g",
    weight_g: 0,
    price: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
  }

  const addIngredient = () => {
    if (!newIngredient.name.trim() || !newIngredient.amount) {
      alert("Please fill in ingredient name and amount");
      return;
    }
    setIngredients([...ingredients, { ...newIngredient, id: Date.now().toString() }]);
    setNewIngredient({ id: "", name: "", amount: "", unit: "g", weight_g: 0, price: "" });
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
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
          protein_g: form.protein_g.toString(),
          carbs_g: form.carbs_g.toString(),
          fat_g: form.fat_g.toString(),
          cost_per_serving_cents: 0,
        };
        onDraftSave([...draftRecipes, newDraft]);
      } else {
        // Save to database
        await axios.post(
          `${apiUrl}/api/admin/recipes`,
          {
            name: form.name.trim(),
            category: form.category,
            servings: form.servings,
            prep_time_minutes: form.prep_time_minutes,
            calories: form.calories,
            protein_g: form.protein_g,
            carbs_g: form.carbs_g,
            fat_g: form.fat_g,
            instructions: form.instructions || null,
            image: form.image || null,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      setForm({
        name: "",
        category: "beef",
        servings: 1,
        prep_time_minutes: 30,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        image: "",
        instructions: "",
      });

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
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#B9A88F] bg-[#FBF7F0]"
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
                        : "border-[#B9A88F] bg-[#FBF7F0] text-[#4B2B1D] hover:bg-[#EDF2F7]"
                    }`}
                  >
                    {category === "carbohydrates" ? "carb" : category === "vegetables" ? "veg" : category}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Servings">
                <input
                  type="number"
                  min={1}
                  value={form.servings}
                  onChange={(event) => update("servings", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
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

            <Field label="Calories (kcal)">
              <input
                type="number"
                min={0}
                value={form.calories}
                onChange={(event) => update("calories", Number(event.target.value))}
                className={INPUT_CLASS}
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Protein (g)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.protein_g}
                  onChange={(event) => update("protein_g", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Carbs (g)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.carbs_g}
                  onChange={(event) => update("carbs_g", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Fat (g)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.fat_g}
                  onChange={(event) => update("fat_g", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <Field label="Ingredients">
              <div className="space-y-2 border border-[#B9A88F] rounded-xl p-3 bg-[#FBF6EE]">
                {/* Add Ingredient Form */}
                <div className="space-y-2 pb-3 border-b border-[#D8CDBE]">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Name</label>
                    <input
                      type="text"
                      value={newIngredient.name}
                      onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                      placeholder="e.g., Chicken Breast"
                      className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div>
                      <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Amount</label>
                      <input
                        type="number"
                        step="0.1"
                        value={newIngredient.amount}
                        onChange={(e) => setNewIngredient({ ...newIngredient, amount: e.target.value })}
                        placeholder="2"
                        className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Unit</label>
                      <select
                        value={newIngredient.unit}
                        onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
                        className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
                      >
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="oz">oz</option>
                        <option value="lb">lb</option>
                        <option value="cup">cup</option>
                        <option value="tbsp">tbsp</option>
                        <option value="tsp">tsp</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#4B2B1D] mb-1">Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newIngredient.price}
                        onChange={(e) => setNewIngredient({ ...newIngredient, price: e.target.value })}
                        placeholder="0.00"
                        className="h-9 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-2 focus:ring-[#3E6594]/10"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="w-full h-8 bg-[#2E527F] text-white text-xs font-bold rounded-lg hover:bg-[#24466E] transition"
                  >
                    + Add Ingredient
                  </button>
                </div>

                {/* Ingredients List */}
                {ingredients.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {ingredients.map((ing) => (
                      <div key={ing.id} className="flex justify-between items-center bg-[#FBF7F0] p-2 rounded-lg border border-[#E4D8C9]">
                        <div className="flex-1">
                          <p className="text-xs font-bold text-[#4B2B1D]">{ing.name}</p>
                          <p className="text-[10px] text-[#755B4C]">
                            {ing.amount} {ing.unit} {ing.price && `• $${ing.price}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeIngredient(ing.id)}
                          className="ml-2 text-[#D62F3D] hover:bg-[#FDEBEC] p-1 rounded transition"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Instructions">
              <textarea
                value={form.instructions}
                onChange={(event) => update("instructions", event.target.value)}
                placeholder="Cooking instructions..."
                className="min-h-24 w-full resize-none rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 py-3 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
              />
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
              className="h-12 rounded-xl border border-[#B9A88F] bg-[#FBF7F0] text-sm font-extrabold text-[#4B2B1D]"
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
                      protein_g: form.protein_g.toString(),
                      carbs_g: form.carbs_g.toString(),
                      fat_g: form.fat_g.toString(),
                      cost_per_serving_cents: 0,
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
    name: string;
    amount: string;
    unit: string;
    weight_g: number;
    price: string;
  };

  const [form, setForm] = useState({
    name: recipe.name || "",
    category: recipe.category || ("beef" as Category),
    servings: recipe.servings || 1,
    prep_time_minutes: recipe.prep_time_minutes || 0,
    calories: recipe.calories || 0,
    protein_g: recipe.protein_g ? parseFloat(recipe.protein_g) : 0,
    carbs_g: recipe.carbs_g ? parseFloat(recipe.carbs_g) : 0,
    fat_g: recipe.fat_g ? parseFloat(recipe.fat_g) : 0,
    instructions: recipe.instructions || "",
    image: recipe.image || "",
  });

  const [ingredients, setIngredients] = useState<RecipeFormIngredient[]>(
    recipe.ingredients?.map((ing) => ({
      id: ing.id?.toString() || Date.now().toString(),
      name: ing.name || "",
      amount: "",
      unit: "g",
      weight_g: ing.quantity_g || 0,
      price: ing.price_per_pound?.toString() || "",
    })) || []
  );

  const [newIngredient, setNewIngredient] = useState<RecipeFormIngredient>({
    id: "",
    name: "",
    amount: "",
    unit: "g",
    weight_g: 0,
    price: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
  }

  const addIngredient = () => {
    if (!newIngredient.name.trim() || !newIngredient.weight_g) {
      alert("Please fill in ingredient name and weight");
      return;
    }
    setIngredients([...ingredients, { ...newIngredient, id: Date.now().toString() }]);
    setNewIngredient({ id: "", name: "", amount: "", unit: "g", weight_g: 0, price: "" });
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
  };

  const updateIngredient = (id: string, updates: Partial<RecipeFormIngredient>) => {
    setIngredients(
      ingredients.map((ing) => (ing.id === id ? { ...ing, ...updates } : ing))
    );
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await axios.put(
        `${apiUrl}/api/admin/recipes/${recipe.recipe_id}`,
        {
          name: form.name.trim(),
          category: form.category,
          servings: form.servings,
          prep_time_minutes: form.prep_time_minutes,
          calories: form.calories,
          protein_g: form.protein_g,
          carbs_g: form.carbs_g,
          fat_g: form.fat_g,
          instructions: form.instructions || null,
          image: form.image || null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // If recipe was prepared_meal (draft) and now has a real category, remove from drafts
      if (recipe.category === 'prepared_meal' && form.category !== 'prepared_meal' && draftRecipes && saveDrafts) {
        const updated = draftRecipes.filter(r => r.recipe_id !== recipe.recipe_id);
        saveDrafts(updated);
      }

      onSave?.();
      onClose();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || "Failed to update recipe");
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#B9A88F] bg-[#FBF7F0]"
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
                        : "border-[#B9A88F] bg-[#FBF7F0] text-[#4B2B1D] hover:bg-[#EDF2F7]"
                    }`}
                  >
                    {category === "carbohydrates" ? "carb" : category === "vegetables" ? "veg" : category}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Servings">
                <input
                  type="number"
                  min={1}
                  value={form.servings}
                  onChange={(event) => update("servings", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
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
              <input
                type="number"
                min={0}
                value={form.calories}
                onChange={(event) => update("calories", Number(event.target.value))}
                className={INPUT_CLASS}
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Protein (g)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.protein_g}
                  onChange={(event) => update("protein_g", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Carbs (g)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.carbs_g}
                  onChange={(event) => update("carbs_g", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Fat (g)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.fat_g}
                  onChange={(event) => update("fat_g", Number(event.target.value))}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <Field label="Instructions">
              <textarea
                value={form.instructions}
                onChange={(event) => update("instructions", event.target.value)}
                placeholder="Cooking instructions..."
                className="min-h-20 w-full resize-none rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 py-3 text-sm font-medium text-[#4B2B1D] outline-none transition placeholder:text-[#9A8774] focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
              />
            </Field>

            <Field label="Ingredients">
              <div className="space-y-2 border border-[#B9A88F] rounded-xl p-3 bg-[#FBF6EE]">
                {/* Existing Ingredients */}
                {ingredients.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto pb-2 border-b border-[#D8CDBE]">
                    {ingredients.map((ing) => (
                      <div key={ing.id} className="flex justify-between items-center bg-[#FBF7F0] p-2 rounded-lg border border-[#E4D8C9]">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={ing.name}
                            onChange={(e) => updateIngredient(ing.id, { name: e.target.value })}
                            className="w-full text-xs font-bold text-[#4B2B1D] bg-transparent outline-none"
                            placeholder="Ingredient name"
                          />
                          <input
                            type="number"
                            value={ing.weight_g}
                            onChange={(e) => updateIngredient(ing.id, { weight_g: Number(e.target.value) })}
                            className="w-full text-[10px] text-[#755B4C] bg-transparent outline-none mt-0.5"
                            placeholder="Weight in g"
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
                    ))}
                  </div>
                )}

                {/* Add New Ingredient */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newIngredient.name}
                    onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                    placeholder="Add ingredient name"
                    className="h-8 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  />
                  <input
                    type="number"
                    value={newIngredient.weight_g}
                    onChange={(e) => setNewIngredient({ ...newIngredient, weight_g: Number(e.target.value) })}
                    placeholder="Weight (g)"
                    className="h-8 w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2 text-xs font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  />
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="w-full h-8 bg-[#2E527F] text-white text-xs font-bold rounded-lg hover:bg-[#24466E] transition"
                  >
                    + Add Ingredient
                  </button>
                </div>
              </div>
            </Field>

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
              className="h-12 rounded-xl border border-[#B9A88F] bg-[#FBF7F0] text-sm font-extrabold text-[#4B2B1D]"
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
  const protein = parseFloat(recipe.protein_g);
  const carbs = parseFloat(recipe.carbs_g);
  const fat = parseFloat(recipe.fat_g);

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
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#B9A88F] bg-[#FBF7F0]"
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

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#E8EEF5] p-3 text-center">
              <p className="text-xs text-[#755B4C] font-bold mb-1">CALORIES</p>
              <p className="text-xl font-extrabold text-[#134DA1]">{recipe.calories}</p>
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

          {/* Cost and Servings */}
          <div className="grid grid-cols-2 gap-4 border-t border-[#D8CDBE] pt-4">
            <div className="rounded-xl bg-[#F5F0E8] p-4">
              <p className="text-xs text-[#755B4C] font-bold mb-1">COST PER SERVING</p>
              <p className="text-2xl font-extrabold text-[#16813D]">
                ${(recipe.cost_per_serving_cents / 100).toFixed(2)}
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
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recipe.ingredients.map((ing) => (
                  <div key={ing.id} className="flex justify-between items-center py-2 border-b border-[#E4D8C9] last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#4B2B1D]">{ing.name}</p>
                      <p className="text-xs text-[#755B4C]">{ing.quantity_g}g</p>
                    </div>
                    <div className="text-right ml-3">
                      {ing.ingredient_cost_cents !== undefined && ing.ingredient_cost_cents !== null && ing.ingredient_cost_cents > 0 ? (
                        <>
                          <p className="text-sm font-extrabold text-[#16813D]">
                            ${(ing.ingredient_cost_cents / 100).toFixed(2)}
                          </p>
                          {ing.price_per_pound && typeof ing.price_per_pound === 'number' && (
                            <p className="text-xs text-[#755B4C]">
                              ${ing.price_per_pound.toFixed(2)}/lb
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

          {recipe.instructions && (
            <div className="rounded-xl bg-[#F5F0E8] p-4 border border-[#E4D8C9]">
              <p className="text-xs text-[#755B4C] font-bold mb-2">INSTRUCTIONS</p>
              <p className="text-sm text-[#4B2B1D] leading-relaxed">
                {recipe.instructions}
              </p>
            </div>
          )}

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
