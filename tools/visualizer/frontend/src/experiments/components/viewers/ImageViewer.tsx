import { useState, useEffect, useCallback } from "react";
import { HF_ORG } from "../../../config";

interface ImageViewerProps {
  datasetRepo: string;
  split?: string;
  onClose: () => void;
}

interface ImageRow {
  src: string;
  caption: string;
  rowIndex: number;
}

// Attempt to extract an image URL from a column value returned by the datasets-server API.
// Image columns come back as { src: "..." }, but plain string URLs and path strings are also handled.
function extractImageUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
      return trimmed;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.src === "string") return obj.src;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.path === "string" && (obj.path as string).startsWith("http")) return obj.path as string;
  }
  return null;
}

// Return the first string value that exists among the given keys in a row object.
function pickCaption(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

export default function ImageViewer({ datasetRepo, split = "train", onClose }: ImageViewerProps) {
  // Ensure dataset repo has org prefix for HF API calls
  const fullRepo = datasetRepo.includes("/") ? datasetRepo : `${HF_ORG}/${datasetRepo}`;

  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noImageColumns, setNoImageColumns] = useState(false);

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // ---- Data loading ----
  useEffect(() => {
    let cancelled = false;

    async function fetchImages() {
      setLoading(true);
      setError(null);
      setNoImageColumns(false);

      try {
        const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(fullRepo)}&config=default&split=${encodeURIComponent(split)}&offset=0&length=20`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Datasets server returned ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();

        const rows: Record<string, unknown>[] = data.rows?.map(
          (r: { row: Record<string, unknown> }) => r.row
        ) ?? [];

        if (rows.length === 0) {
          if (!cancelled) {
            setImages([]);
            setLoading(false);
          }
          return;
        }

        // Find image column(s): any column whose value for the first row resolves to an image URL,
        // or whose key contains image/url/path hints.
        const firstRow = rows[0];
        const columnNames = Object.keys(firstRow);

        // Rank columns: explicit image columns first, then url/path hints, then anything resolving
        const imageColumns: string[] = [];

        // Pass 1: columns that directly contain image objects or HTTP URLs
        for (const col of columnNames) {
          if (extractImageUrl(firstRow[col]) !== null) {
            imageColumns.push(col);
          }
        }

        // Pass 2: columns with suggestive names that we haven't already picked
        if (imageColumns.length === 0) {
          const hints = ["image", "img", "image_url", "url", "path", "file"];
          for (const hint of hints) {
            const match = columnNames.find((c) => c.toLowerCase().includes(hint));
            if (match && !imageColumns.includes(match)) {
              imageColumns.push(match);
            }
          }
        }

        if (imageColumns.length === 0) {
          if (!cancelled) {
            setNoImageColumns(true);
            setLoading(false);
          }
          return;
        }

        // Caption columns (first match wins per row)
        const captionKeys = ["caption", "description", "label", "title", "text", "name"];

        const imageCol = imageColumns[0];
        const extracted: ImageRow[] = [];

        rows.forEach((row, idx) => {
          const src = extractImageUrl(row[imageCol]);
          if (src) {
            const caption = pickCaption(row, captionKeys) ?? `Image ${idx + 1}`;
            extracted.push({ src, caption, rowIndex: idx });
          }
        });

        if (!cancelled) {
          setImages(extracted);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load images");
          setLoading(false);
        }
      }
    }

    fetchImages();
    return () => {
      cancelled = true;
    };
  }, [fullRepo, split]);

  // ---- Lightbox keyboard navigation ----
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const prevImage = useCallback(() => {
    setLightboxIndex((i) => (i === null || i === 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const nextImage = useCallback(() => {
    setLightboxIndex((i) => (i === null ? 0 : (i + 1) % images.length));
  }, [images.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "ArrowRight") nextImage();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, closeLightbox, prevImage, nextImage]);

  const shortName = datasetRepo.split("/").pop() ?? datasetRepo;

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-200 truncate">{shortName}</span>
          {datasetRepo.includes("/") && (
            <span className="text-xs text-gray-600 truncate">{datasetRepo.split("/")[0]}/</span>
          )}
          {!loading && !error && !noImageColumns && (
            <span className="text-xs text-gray-500">{images.length} images</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition-colors ml-4 flex-shrink-0 text-xl leading-none"
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <div className="flex items-center justify-center h-48">
            <span className="text-sm text-gray-500 animate-pulse">Loading images...</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <p className="text-sm text-red-400 mb-1">Failed to load dataset</p>
              <p className="text-xs text-gray-500">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && noImageColumns && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-gray-500 italic">No image columns found in this dataset.</p>
          </div>
        )}

        {!loading && !error && !noImageColumns && images.length === 0 && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-gray-500 italic">No rows found in this split.</p>
          </div>
        )}

        {!loading && !error && images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img, idx) => (
              <button
                key={img.rowIndex}
                onClick={() => setLightboxIndex(idx)}
                className="group flex flex-col bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-cyan-600 transition-colors text-left"
              >
                <div className="aspect-square overflow-hidden bg-gray-900 flex items-center justify-center">
                  <img
                    src={img.src}
                    alt={img.caption}
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-xs text-gray-400 truncate" title={img.caption}>
                    {img.caption}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox overlay */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-5 text-gray-300 hover:text-white text-3xl leading-none z-10"
            onClick={closeLightbox}
            aria-label="Close lightbox"
          >
            &times;
          </button>

          {/* Prev arrow */}
          {images.length > 1 && (
            <button
              className="absolute left-4 text-gray-300 hover:text-white text-4xl leading-none z-10 px-2 py-4"
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              aria-label="Previous image"
            >
              &#8249;
            </button>
          )}

          {/* Image */}
          <div
            className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[lightboxIndex].src}
              alt={images[lightboxIndex].caption}
              className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl"
            />
            <p className="text-sm text-gray-300 text-center max-w-lg px-4">
              {images[lightboxIndex].caption}
            </p>
            {images.length > 1 && (
              <p className="text-xs text-gray-600">
                {lightboxIndex + 1} / {images.length}
              </p>
            )}
          </div>

          {/* Next arrow */}
          {images.length > 1 && (
            <button
              className="absolute right-4 text-gray-300 hover:text-white text-4xl leading-none z-10 px-2 py-4"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              aria-label="Next image"
            >
              &#8250;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
