"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, MessageCircle, X } from "lucide-react";
import type { KaarigerOrder } from "@/lib/types";
import type { BillExportExtras } from "@/lib/bill-export";
import { renderBillPngFile } from "@/lib/bill-share-image";

type Props = {
  order: KaarigerOrder;
  extras?: BillExportExtras;
  onClose: () => void;
};

/**
 * Preview + local share for a kaarigar bill PNG.
 * Image is generated in the browser only — never uploaded to Firestore/Storage.
 * Bill line-items already live on the order document in Firestore.
 */
export default function BillWhatsAppModal({ order, extras = {}, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<"download" | "whatsapp" | null>(null);
  const [hint, setHint] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const result = await renderBillPngFile(order, extras);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(result.file);
        setFile(result.file);
        setCaption(result.caption);
        setPreviewUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to generate bill image.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Generate once when the modal opens for this order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  function downloadOnce() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Delay revoke so the browser can finish the download.
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function handleDownload() {
    if (!file || busy) return;
    setBusy("download");
    setHint("");
    try {
      downloadOnce();
      setHint("Saved on this device only — not uploaded to the cloud.");
    } finally {
      setBusy(null);
    }
  }

  async function handleWhatsApp() {
    if (!file || busy) return;
    setBusy("whatsapp");
    setHint("");
    try {
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };

      // Mobile / supporting browsers: native share sheet with the PNG file.
      if (typeof nav.canShare === "function" && nav.share && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: `Bill — ${order.kaarigerName}`,
            text: caption,
          });
          setHint("Pick WhatsApp in the share sheet to send this bill image.");
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            setHint("Share cancelled.");
            return;
          }
          // Fall through to download + wa.me
        }
      }

      // Desktop: save one local PNG, then open WhatsApp with a short caption.
      downloadOnce();
      const text =
        `${caption}\n\nPlease find the Bliss Bombay bill image attached (saved to your Downloads).`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      setHint(
        "Image saved on this device. WhatsApp opened — attach the bill PNG from Downloads."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/45" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="surface flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div>
              <h3 className="font-display text-lg font-bold">Share bill image</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {order.kaarigerName} · {order.productName}
              </p>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="flex flex-col items-center gap-3 py-16 text-[var(--text-muted)]">
                <Loader2 className="h-6 w-6 animate-spin text-jade" />
                <p className="text-sm">Preparing bill image…</p>
              </div>
            )}
            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>
            )}
            {previewUrl && !loading && (
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-mist)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={`Bill for ${order.kaarigerName}`}
                  className="mx-auto max-h-[55vh] w-auto max-w-full object-contain"
                />
              </div>
            )}
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Image is generated on this device only — not stored in Firestore or cloud. Bill details
              stay in your records as usual (no duplicate image file in the database).
            </p>
            {hint && (
              <p className="mt-2 rounded-xl bg-jade-soft/70 px-3 py-2 text-xs text-jade-deep">{hint}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] p-4">
            <button
              type="button"
              className="btn btn-secondary flex-1"
              disabled={!file || !!busy || loading}
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
              {busy === "download" ? "Saving…" : "Download PNG"}
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={!file || !!busy || loading}
              onClick={handleWhatsApp}
            >
              <MessageCircle className="h-4 w-4" />
              {busy === "whatsapp" ? "Opening…" : "WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
