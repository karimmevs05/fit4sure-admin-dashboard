import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Megaphone, Copy, Check, Sparkles, ImageOff, Download, Image as ImageIcon, Loader2, FolderOpen, Plus, X, FolderPlus,
  CalendarDays, Link2, DollarSign,
} from "lucide-react";

type UploadedPhoto = {
  file_id: string;
  filename: string;
  created_time: string;
  matched: boolean;
  recipe_id?: number;
};

type ProjectSummary = { id: number; name: string; created_at: string; item_count: number };
type ProjectItem = {
  item_id: number;
  file_id: string;
  recipe_id: number | null;
  recipe_name: string | null;
  format: string | null;
  size: string | null;
  template_link: string | null;
  status: string;
  price_cents: number | null;
  scheduled_date: string | null;
  notes: string | null;
  task_id: number | null;
};
type RecipeOption = { recipe_id: number; name: string; category: string };

const FORMAT_OPTIONS = [
  { value: "flyer", label: "Flyer" },
  { value: "business_card", label: "Business Card" },
  { value: "promo_card", label: "Promo Card" },
  { value: "billboard", label: "Billboard" },
  { value: "static_post", label: "Static Post" },
  { value: "promo_video", label: "Promo Video" },
  { value: "reel", label: "Reel" },
  { value: "story", label: "Story" },
];

const STATUS_OPTIONS = [
  { value: "idea", label: "Idea" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

const STATUS_COLORS: Record<string, string> = {
  idea: "bg-[#F5F0E8] text-[#755B4C]",
  in_progress: "bg-[#E8EEF5] text-[#134DA1]",
  review: "bg-[#FFF0E1] text-[#DC6500]",
  approved: "bg-[#EAF5EC] text-[#16834A]",
  scheduled: "bg-[#EDE9FE] text-[#6D28D9]",
  published: "bg-[#16834A] text-white",
};

export default function MarketingPage() {
  const [configured, setConfigured] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [allPhotos, setAllPhotos] = useState<UploadedPhoto[]>([]);
  const [allRecipes, setAllRecipes] = useState<RecipeOption[]>([]);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    fetchProjects();
    fetchUploadedPhotos();
    fetchAllRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedProjectId != null) fetchItems(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);
      const res = await axios.get(`${apiUrl}/api/admin/marketing/projects`, authHeaders);
      const list: ProjectSummary[] = res.data.data || [];
      setProjects(list);
      setSelectedProjectId((current) => current ?? (list[0] ? list[0].id : null));
    } catch (err) {
      console.error("Error fetching projects:", err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchUploadedPhotos = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/marketing/uploaded-photos`, authHeaders);
      setConfigured(res.data.data.configured);
      setAllPhotos(res.data.data.photos || []);
    } catch (err) {
      console.error("Error fetching uploaded photos:", err);
      setDriveError("Could not load photos from Drive.");
    }
  };

  const fetchAllRecipes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/recipes`, authHeaders);
      setAllRecipes((res.data.data || []).map((r: any) => ({ recipe_id: r.recipe_id, name: r.name, category: r.category })));
    } catch (err) {
      console.error("Error fetching recipes:", err);
    }
  };

  const fetchItems = async (projectId: number) => {
    try {
      setLoadingItems(true);
      const res = await axios.get(`${apiUrl}/api/admin/marketing/projects/${projectId}/items`, authHeaders);
      setItems(res.data.data || []);
    } catch (err) {
      console.error("Error fetching project items:", err);
    } finally {
      setLoadingItems(false);
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await axios.post(`${apiUrl}/api/admin/marketing/projects`, { name: newProjectName.trim() }, authHeaders);
      setProjects((prev) => [res.data.data, ...prev]);
      setSelectedProjectId(res.data.data.id);
      setNewProjectName("");
    } catch (err) {
      console.error("Error creating project:", err);
    } finally {
      setCreatingProject(false);
    }
  };

  const deleteProject = async (id: number) => {
    try {
      await axios.delete(`${apiUrl}/api/admin/marketing/projects/${id}`, authHeaders);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
    } catch (err) {
      console.error("Error deleting project:", err);
    }
  };

  const addPhotoToProject = async (fileId: string) => {
    if (selectedProjectId == null) return;
    try {
      await axios.post(`${apiUrl}/api/admin/marketing/projects/${selectedProjectId}/items`, { drive_file_id: fileId }, authHeaders);
      await fetchItems(selectedProjectId);
      setProjects((prev) => prev.map((p) => (p.id === selectedProjectId ? { ...p, item_count: p.item_count + 1 } : p)));
    } catch (err) {
      console.error("Error adding photo to project:", err);
    }
  };

  const removeItem = async (itemId: number) => {
    if (selectedProjectId == null) return;
    try {
      await axios.delete(`${apiUrl}/api/admin/marketing/projects/${selectedProjectId}/items/${itemId}`, authHeaders);
      setItems((prev) => prev.filter((i) => i.item_id !== itemId));
      setProjects((prev) => prev.map((p) => (p.id === selectedProjectId ? { ...p, item_count: Math.max(0, p.item_count - 1) } : p)));
    } catch (err) {
      console.error("Error removing item:", err);
    }
  };

  const updateItemRecipe = async (item: ProjectItem, recipeId: string) => {
    if (selectedProjectId == null) return;
    try {
      await axios.post(
        `${apiUrl}/api/admin/marketing/projects/${selectedProjectId}/items`,
        { drive_file_id: item.file_id, recipe_id: recipeId || undefined },
        authHeaders
      );
    } catch (err) {
      console.error("Error updating item recipe:", err);
    }
  };

  const updateItemField = async (itemId: number, patch: Partial<ProjectItem>) => {
    if (selectedProjectId == null) return;
    setItems((prev) => prev.map((i) => (i.item_id === itemId ? { ...i, ...patch } : i)));
    try {
      const res = await axios.patch(`${apiUrl}/api/admin/marketing/projects/${selectedProjectId}/items/${itemId}`, patch, authHeaders);
      setItems((prev) => prev.map((i) => (i.item_id === itemId ? { ...i, task_id: res.data.data.task_id } : i)));
    } catch (err) {
      console.error("Error updating item:", err);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const photosInProject = new Set(items.map((i) => i.file_id));
  const pickablePhotos = allPhotos.filter((p) => !photosInProject.has(p.file_id));

  return (
    <main className="flex-1 space-y-6 p-8">
      <Header />

      {!configured && (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-[#9A7E6F]" />
          <p className="mt-2 font-extrabold text-[#4B2B1D]">No photos folder connected yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#755B4C]">
            Share your Drive photos folder with <span className="font-mono text-[12px]">fit4sure-drive-access@fit4sure.iam.gserviceaccount.com</span> (Viewer
            is enough), then have the folder ID set on the backend.
          </p>
        </div>
      )}
      {driveError && <p className="text-xs font-bold text-[#D62F3D]">{driveError}</p>}

      <ProjectTabs
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelect={setSelectedProjectId}
        onDelete={deleteProject}
        loading={loadingProjects}
        newProjectName={newProjectName}
        onNewProjectNameChange={setNewProjectName}
        onCreate={createProject}
        creating={creatingProject}
      />

      {selectedProject && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-[#2E527F]">
              {items.length} piece{items.length === 1 ? "" : "s"} in "{selectedProject.name}"
            </p>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2E527F] px-3 text-xs font-bold text-white transition hover:bg-[#24466E]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add photo
            </button>
          </div>

          {showPicker && (
            <PhotoPicker
              photos={pickablePhotos}
              onPick={(fileId) => {
                addPhotoToProject(fileId);
                setShowPicker(false);
              }}
              onClose={() => setShowPicker(false)}
            />
          )}

          {loadingItems ? (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center text-sm text-[#755B4C]">Loading...</div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
              <ImageOff className="mx-auto h-8 w-8 text-[#9A7E6F]" />
              <p className="mt-2 font-extrabold text-[#4B2B1D]">No content pieces in this project yet.</p>
              <p className="mt-1 text-sm text-[#755B4C]">Click "Add photo" to pull one in from the uploads folder.</p>
            </div>
          ) : (
            <>
              <ScheduleView items={items} />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {items.map((item) => (
                  <PhotoCard
                    key={item.item_id}
                    item={item}
                    allRecipes={allRecipes}
                    onRecipeChange={(recipeId) => updateItemRecipe(item, recipeId)}
                    onFieldChange={(patch) => updateItemField(item.item_id, patch)}
                    onRemove={() => removeItem(item.item_id)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!loadingProjects && projects.length === 0 && (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <FolderPlus className="mx-auto h-8 w-8 text-[#9A7E6F]" />
          <p className="mt-2 font-extrabold text-[#4B2B1D]">No projects yet.</p>
          <p className="mt-1 text-sm text-[#755B4C]">Create one above to start grouping content pieces together.</p>
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D7C9B7] bg-[rgba(251,247,240,0.9)] text-[#2E527F]">
        <Megaphone className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-[#4B2B1D]">Marketing</h1>
        <p className="mt-1 text-sm text-[#755B4C]">
          Organize content into projects -- Gemini looks at what's actually on the plate to name and caption each piece, no recipe match required.
        </p>
      </div>
    </header>
  );
}

function ProjectTabs({
  projects,
  selectedProjectId,
  onSelect,
  onDelete,
  loading,
  newProjectName,
  onNewProjectNameChange,
  onCreate,
  creating,
}: {
  projects: ProjectSummary[];
  selectedProjectId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  loading: boolean;
  newProjectName: string;
  onNewProjectNameChange: (v: string) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-[#2E527F]" />
      ) : (
        projects.map((p) => (
          <div
            key={p.id}
            className={`group flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold transition ${
              selectedProjectId === p.id
                ? "border-[#2E527F] bg-[#2E527F] text-white"
                : "border-[#D7C9B7] bg-[rgba(251,247,240,0.9)] text-[#4B2B1D] hover:border-[#2E527F]"
            }`}
          >
            <button type="button" onClick={() => onSelect(p.id)}>
              {p.name} <span className="opacity-70">({p.item_count})</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              className={`opacity-0 transition group-hover:opacity-100 ${selectedProjectId === p.id ? "text-white/80 hover:text-white" : "text-[#9A7E6F] hover:text-[#D62F3D]"}`}
              title="Delete project"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}

      <div className="flex items-center gap-1.5 rounded-full border-2 border-dashed border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-3 py-1">
        <input
          value={newProjectName}
          onChange={(e) => onNewProjectNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          placeholder="New project name..."
          className="h-6 w-40 bg-transparent text-sm text-[#2E527F] placeholder:text-[#2E527F]/60 focus:outline-none"
        />
        <button type="button" onClick={onCreate} disabled={creating || !newProjectName.trim()} className="text-[#2E527F] hover:text-[#24466E] disabled:opacity-40">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function PhotoPicker({ photos, onPick, onClose }: { photos: UploadedPhoto[]; onPick: (fileId: string) => void; onClose: () => void }) {
  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.95)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">Pick a photo from uploads</p>
        <button type="button" onClick={onClose} className="text-[#755B4C] hover:text-[#2E527F]">
          <X className="h-4 w-4" />
        </button>
      </div>
      {photos.length === 0 ? (
        <p className="mt-3 text-sm text-[#755B4C]">Every uploaded photo is already in this project.</p>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {photos.map((photo) => (
            <PickerThumb key={photo.file_id} photo={photo} onClick={() => onPick(photo.file_id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PickerThumb({ photo, onClick }: { photo: UploadedPhoto; onClick: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await axios.get(`${apiUrl}/api/admin/marketing/photo/${photo.file_id}/thumbnail.jpg`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        });
        objectUrl = URL.createObjectURL(res.data);
        setThumbUrl(objectUrl);
      } catch (err) {
        console.error("Error fetching thumbnail:", err);
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.file_id]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square overflow-hidden rounded-lg border border-[#E4D8C9] bg-[#E3D8C9] transition hover:ring-2 hover:ring-[#2E527F]"
      title={photo.filename}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt={photo.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[#B9A88F]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </button>
  );
}

function ScheduleView({ items }: { items: ProjectItem[] }) {
  const scheduled = items.filter((i) => i.scheduled_date).sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1));
  if (scheduled.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#2E527F]">
        <CalendarDays className="h-3.5 w-3.5" />
        Schedule
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {scheduled.map((item) => (
          <div key={item.item_id} className="flex items-center gap-2 rounded-lg border border-[#E4D8C9] bg-white px-3 py-1.5 text-xs">
            <span className="font-bold text-[#4B2B1D]">{new Date(item.scheduled_date! + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[item.status] || STATUS_COLORS.idea}`}>
              {STATUS_OPTIONS.find((s) => s.value === item.status)?.label || item.status}
            </span>
            {item.format && <span className="text-[#755B4C]">{FORMAT_OPTIONS.find((f) => f.value === item.format)?.label}</span>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[#9A7E6F]">Scheduled pieces also appear on the Operations Hub board under Marketing.</p>
    </div>
  );
}

function TemplateSection({ item, onFieldChange }: { item: ProjectItem; onFieldChange: (patch: Partial<ProjectItem>) => void }) {
  const [size, setSize] = useState(item.size || "");
  const [templateLink, setTemplateLink] = useState(item.template_link || "");
  const [price, setPrice] = useState(item.price_cents != null ? (item.price_cents / 100).toString() : "");

  return (
    <div className="border-t border-[#E4D8C9] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">Template</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={item.format || ""}
          onChange={(e) => onFieldChange({ format: e.target.value || null })}
          className="h-8 rounded-lg border border-[#D7C9B7] bg-white px-2 text-xs text-[#4B2B1D]"
        >
          <option value="">Format...</option>
          {FORMAT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={item.status}
          onChange={(e) => onFieldChange({ status: e.target.value })}
          className={`h-8 rounded-lg border border-[#D7C9B7] px-2 text-xs font-bold ${STATUS_COLORS[item.status] || STATUS_COLORS.idea}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input
          value={size}
          onChange={(e) => setSize(e.target.value)}
          onBlur={() => onFieldChange({ size: size || null })}
          placeholder="Size (e.g. 1080x1920)"
          className="h-8 rounded-lg border border-[#D7C9B7] bg-white px-2 text-xs text-[#4B2B1D] placeholder:text-[#B9A88F]"
        />
        <div className="flex items-center gap-1 rounded-lg border border-[#D7C9B7] bg-white px-2">
          <DollarSign className="h-3 w-3 shrink-0 text-[#755B4C]" />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => onFieldChange({ price_cents: price ? Math.round(parseFloat(price) * 100) : null })}
            placeholder="Price"
            className="h-8 w-full text-xs text-[#4B2B1D] placeholder:text-[#B9A88F] focus:outline-none"
          />
        </div>
        <div className="col-span-2 flex items-center gap-1 rounded-lg border border-[#D7C9B7] bg-white px-2">
          <Link2 className="h-3 w-3 shrink-0 text-[#755B4C]" />
          <input
            value={templateLink}
            onChange={(e) => setTemplateLink(e.target.value)}
            onBlur={() => onFieldChange({ template_link: templateLink || null })}
            placeholder="Link to template or reference..."
            className="h-8 w-full text-xs text-[#4B2B1D] placeholder:text-[#B9A88F] focus:outline-none"
          />
        </div>
        <div className="col-span-2 flex items-center gap-1 rounded-lg border border-[#D7C9B7] bg-white px-2">
          <CalendarDays className="h-3 w-3 shrink-0 text-[#755B4C]" />
          <input
            type="date"
            value={item.scheduled_date || ""}
            onChange={(e) => onFieldChange({ scheduled_date: e.target.value || null })}
            className="h-8 w-full text-xs text-[#4B2B1D] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function PhotoCard({
  item,
  allRecipes,
  onRecipeChange,
  onFieldChange,
  onRemove,
}: {
  item: ProjectItem;
  allRecipes: RecipeOption[];
  onRecipeChange: (recipeId: string) => void;
  onFieldChange: (patch: Partial<ProjectItem>) => void;
  onRemove: () => void;
}) {
  const fileId = item.file_id;
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string>(item.recipe_id ? String(item.recipe_id) : "");
  const [captions, setCaptions] = useState<string[] | null>(null);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await axios.get(`${apiUrl}/api/admin/marketing/photo/${fileId}/thumbnail.jpg`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        });
        objectUrl = URL.createObjectURL(res.data);
        setThumbUrl(objectUrl);
      } catch (err) {
        console.error("Error fetching photo thumbnail:", err);
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const generateCaptions = async () => {
    setGeneratingCaptions(true);
    setCaptionError(null);
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/marketing/generate-captions`,
        { file_id: fileId, recipe_id: recipeId || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCaptions(res.data.data.captions || []);
    } catch (err) {
      console.error("Error generating captions:", err);
      setCaptionError("Couldn't generate captions -- try again.");
    } finally {
      setGeneratingCaptions(false);
    }
  };

  const copyCaption = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((current) => (current === idx ? null : current)), 1500);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)]">
      <div className="flex gap-4 p-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[#E4D8C9] bg-[#E3D8C9]">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#B9A88F]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <label className="block text-[10px] font-bold uppercase tracking-wide text-[#9A7E6F]">Link a recipe for real macros (optional)</label>
            <button type="button" onClick={onRemove} className="shrink-0 text-[#9A7E6F] hover:text-[#D62F3D]" title="Remove from project">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <select
            value={recipeId}
            onChange={(e) => {
              setRecipeId(e.target.value);
              onRecipeChange(e.target.value);
            }}
            className="mt-1 h-8 w-full rounded-lg border border-[#D7C9B7] bg-white px-2 text-xs text-[#4B2B1D]"
          >
            <option value="">No recipe linked -- name only</option>
            {allRecipes.map((r) => (
              <option key={r.recipe_id} value={r.recipe_id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TemplateSection item={item} onFieldChange={onFieldChange} />

      <div className="border-t border-[#E4D8C9] p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">Captions</p>
          <button
            type="button"
            onClick={generateCaptions}
            disabled={generatingCaptions}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2E527F] px-3 text-xs font-bold text-white transition hover:bg-[#24466E] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {generatingCaptions ? "Writing..." : captions ? "Regenerate" : "Generate captions"}
          </button>
        </div>

        {captionError && <p className="mt-2 text-xs font-bold text-[#D62F3D]">{captionError}</p>}

        {captions && (
          <div className="mt-3 space-y-2">
            {captions.map((caption, idx) => (
              <div key={idx} className="rounded-lg border border-[#E4D8C9] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#4B2B1D]">{caption}</p>
                  <button
                    type="button"
                    onClick={() => copyCaption(caption, idx)}
                    className="shrink-0 text-[#755B4C] hover:text-[#2E527F]"
                    title="Copy caption"
                  >
                    {copiedIdx === idx ? <Check className="h-4 w-4 text-[#16834A]" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ImagesSection fileId={fileId} recipeId={recipeId} />
    </div>
  );
}

type ImageFormat = "carousel" | "story";

function ImagesSection({ fileId, recipeId }: { fileId: string; recipeId: string }) {
  const [urls, setUrls] = useState<Partial<Record<ImageFormat, string>>>({});
  const [generating, setGenerating] = useState<ImageFormat | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  const generateImage = async (format: ImageFormat) => {
    setGenerating(format);
    setImgError(null);
    try {
      const res = await axios.get(`${apiUrl}/api/admin/marketing/photo/${fileId}/${format}.png`, {
        headers: { Authorization: `Bearer ${token}` },
        params: recipeId ? { recipe_id: recipeId } : {},
        responseType: "blob",
      });
      const objectUrl = URL.createObjectURL(res.data);
      setUrls((prev) => {
        if (prev[format]) URL.revokeObjectURL(prev[format]!);
        return { ...prev, [format]: objectUrl };
      });
    } catch (err: any) {
      console.error(`Error rendering ${format}:`, err);
      if (err?.response?.status === 422 && err.response.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          setImgError(`Needs manual review: ${parsed.reason || "layout validation failed"}`);
        } catch {
          setImgError(`Needs manual review -- couldn't render cleanly.`);
        }
      } else {
        setImgError(`Couldn't render the ${format} image -- try again.`);
      }
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="border-t border-[#E4D8C9] p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">Images</p>
      {imgError && <p className="mb-2 text-xs font-bold text-[#D62F3D]">{imgError}</p>}
      <div className="grid grid-cols-2 gap-3">
        {(["carousel", "story"] as ImageFormat[]).map((format) => (
          <div key={format} className="rounded-lg border border-[#E4D8C9] bg-white p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#755B4C]">
                {format === "carousel" ? "Carousel (4:5)" : "Story (9:16)"}
              </p>
              {urls[format] && (
                <a
                  href={urls[format]}
                  download={`fit4sure-${format}.png`}
                  className="text-[#2E527F] hover:text-[#24466E]"
                  title="Download PNG"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {urls[format] ? (
              <img src={urls[format]} alt={format} className="mt-2 w-full rounded-md border border-[#E4D8C9]" />
            ) : (
              <button
                type="button"
                onClick={() => generateImage(format)}
                disabled={generating === format}
                className="mt-2 flex h-24 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#B9A88F] text-xs font-bold text-[#755B4C] hover:bg-[#FBF6EE] disabled:opacity-50"
              >
                {generating === format ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                {generating === format ? "Rendering..." : "Generate"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
