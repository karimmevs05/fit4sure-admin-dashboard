import React, { useEffect, useState } from "react";
import axios from "axios";
import { Megaphone, Copy, Check, Sparkles, ImageOff, Download, Image as ImageIcon, Loader2, FolderOpen } from "lucide-react";

type UploadedPhoto = {
  file_id: string;
  filename: string;
  created_time: string;
  matched: boolean;
  recipe_id?: number;
};

type RecipeOption = { recipe_id: number; name: string; category: string };

export default function MarketingPage() {
  const [configured, setConfigured] = useState(true);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [allRecipes, setAllRecipes] = useState<RecipeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchUploadedPhotos();
    fetchAllRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUploadedPhotos = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${apiUrl}/api/admin/marketing/uploaded-photos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfigured(res.data.data.configured);
      setPhotos(res.data.data.photos || []);
    } catch (err) {
      console.error("Error fetching uploaded photos:", err);
      setError("Could not load photos from Drive.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllRecipes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/recipes`, { headers: { Authorization: `Bearer ${token}` } });
      setAllRecipes((res.data.data || []).map((r: any) => ({ recipe_id: r.recipe_id, name: r.name, category: r.category })));
    } catch (err) {
      console.error("Error fetching recipes:", err);
    }
  };

  return (
    <main className="flex-1 space-y-6 p-8">
      <Header />

      {loading ? (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center text-sm text-[#755B4C]">
          Checking the photos folder...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[#E8B4B9] bg-[#FFF4F5] p-6 text-sm text-[#D62F3D]">{error}</div>
      ) : !configured ? (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-[#9A7E6F]" />
          <p className="mt-2 font-extrabold text-[#4B2B1D]">No photos folder connected yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#755B4C]">
            Share your Drive photos folder with <span className="font-mono text-[12px]">fit4sure-drive-access@fit4sure.iam.gserviceaccount.com</span> (Viewer
            is enough), then have the folder ID set on the backend.
          </p>
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <ImageOff className="mx-auto h-8 w-8 text-[#9A7E6F]" />
          <p className="mt-2 font-extrabold text-[#4B2B1D]">No photos in the folder yet.</p>
          <p className="mt-1 text-sm text-[#755B4C]">Upload real photos of the actual plate -- any filename is fine.</p>
        </div>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </p>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {photos.map((photo) => (
              <PhotoCard key={photo.file_id} photo={photo} allRecipes={allRecipes} />
            ))}
          </div>
        </>
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
          Built from real plate photos -- Gemini looks at what's actually on the plate to name and caption it, no recipe match required.
        </p>
      </div>
    </header>
  );
}

function PhotoCard({ photo, allRecipes }: { photo: UploadedPhoto; allRecipes: RecipeOption[] }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string>(photo.recipe_id ? String(photo.recipe_id) : "");
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
        const res = await axios.get(`${apiUrl}/api/admin/marketing/photo/${photo.file_id}/thumbnail.jpg`, {
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
  }, [photo.file_id]);

  const generateCaptions = async () => {
    setGeneratingCaptions(true);
    setCaptionError(null);
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/marketing/generate-captions`,
        { file_id: photo.file_id, recipe_id: recipeId || undefined },
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
            <img src={thumbUrl} alt={photo.filename} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#B9A88F]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-[#9A7E6F]" title={photo.filename}>
            {photo.filename}
          </p>
          <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-[#9A7E6F]">
            Link a recipe for real macros (optional)
          </label>
          <select
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
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

      <ImagesSection fileId={photo.file_id} recipeId={recipeId} />
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
    } catch (err) {
      console.error(`Error rendering ${format}:`, err);
      setImgError(`Couldn't render the ${format} image -- try again.`);
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
