import React, { useEffect, useState } from "react";
import axios from "axios";
import { Megaphone, Copy, Check, Sparkles, ImageOff, Download, Image as ImageIcon, Loader2 } from "lucide-react";

type FeaturedProtein = {
  recipe_id: number;
  name: string;
  category: string;
  image: string | null;
  calories: number;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  top_ingredients: string[];
};

const CATEGORY_LABEL: Record<string, string> = {
  beef: "Beef",
  chicken: "Chicken",
  turkey: "Turkey",
  pork: "Pork",
};

export default function MarketingPage() {
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [proteins, setProteins] = useState<FeaturedProtein[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchFeaturedProteins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFeaturedProteins = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${apiUrl}/api/admin/marketing/featured-proteins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWeekStart(res.data.data.week_start);
      setProteins(res.data.data.proteins || []);
    } catch (err) {
      console.error("Error fetching featured proteins:", err);
      setError("Could not load this week's featured proteins.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 space-y-6 p-8">
      <Header />

      {loading ? (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center text-sm text-[#755B4C]">
          Loading this week's menu...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[#E8B4B9] bg-[#FFF4F5] p-6 text-sm text-[#D62F3D]">{error}</div>
      ) : proteins.length === 0 ? (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <p className="font-extrabold text-[#4B2B1D]">No protein recipes on this week's published menu yet.</p>
          <p className="mt-1 text-sm text-[#755B4C]">
            Add beef/chicken/turkey/pork recipes to this week's plan in Menu Planner, then come back here.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">
            Week of {weekStart ? new Date(weekStart).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : ""}
            {" · "}
            {proteins.length} featured protein{proteins.length === 1 ? "" : "s"}
          </p>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {proteins.map((protein) => (
              <ProteinContentCard key={protein.recipe_id} protein={protein} />
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
          This week's featured proteins, ready for Instagram -- captions and carousel/story images generated for you.
        </p>
      </div>
    </header>
  );
}

function ProteinContentCard({ protein }: { protein: FeaturedProtein }) {
  const [captions, setCaptions] = useState<string[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  const generateCaptions = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/marketing/generate-captions`,
        { recipe_id: protein.recipe_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCaptions(res.data.data.captions || []);
    } catch (err) {
      console.error("Error generating captions:", err);
      setGenError("Couldn't generate captions -- try again.");
    } finally {
      setGenerating(false);
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
          {protein.image ? (
            <img src={protein.image} alt={protein.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#B9A88F]">
              <ImageOff className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full bg-[#F5F0E8] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#755B4C]">
            {CATEGORY_LABEL[protein.category] || protein.category}
          </span>
          <h2 className="mt-1 truncate text-lg font-extrabold text-[#4B2B1D]">{protein.name}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <MacroPill label="CAL" value={String(protein.calories)} />
            <MacroPill label="PRO" value={`${protein.protein_g}g`} />
            <MacroPill label="CARB" value={`${protein.carbs_g}g`} />
            <MacroPill label="FAT" value={`${protein.fat_g}g`} />
          </div>
          {protein.top_ingredients.length > 0 && (
            <p className="mt-1.5 truncate text-[11px] text-[#9A7E6F]">{protein.top_ingredients.join(", ")}</p>
          )}
        </div>
      </div>

      <div className="border-t border-[#E4D8C9] p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">Captions</p>
          <button
            type="button"
            onClick={generateCaptions}
            disabled={generating}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2E527F] px-3 text-xs font-bold text-white transition hover:bg-[#24466E] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {generating ? "Writing..." : captions ? "Regenerate" : "Generate captions"}
          </button>
        </div>

        {genError && <p className="mt-2 text-xs font-bold text-[#D62F3D]">{genError}</p>}

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

      <ImagesSection recipeId={protein.recipe_id} recipeName={protein.name} />
    </div>
  );
}

type ImageFormat = "carousel" | "story";

function ImagesSection({ recipeId, recipeName }: { recipeId: number; recipeName: string }) {
  const [urls, setUrls] = useState<Partial<Record<ImageFormat, string>>>({});
  const [generating, setGenerating] = useState<ImageFormat | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const apiUrl = import.meta.env.VITE_API_BASE_URL;

  const generateImage = async (format: ImageFormat) => {
    setGenerating(format);
    setImgError(null);
    try {
      const res = await axios.get(`${apiUrl}/api/admin/marketing/${recipeId}/${format}.png`, {
        headers: { Authorization: `Bearer ${token}` },
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
                  download={`${recipeName.toLowerCase().replace(/\s+/g, "-")}-${format}.png`}
                  className="text-[#2E527F] hover:text-[#24466E]"
                  title="Download PNG"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {urls[format] ? (
              <img src={urls[format]} alt={`${recipeName} ${format}`} className="mt-2 w-full rounded-md border border-[#E4D8C9]" />
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

function MacroPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-[#E8EEF5] px-2 py-0.5 text-[10px] font-bold text-[#134DA1]">
      {value} <span className="text-[#134DA1]/60">{label}</span>
    </span>
  );
}
