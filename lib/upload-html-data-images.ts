import type { Id } from "@/convex/_generated/dataModel";
import { compressDataUrlIfLarge } from "@/lib/compress-image-data-url";

/** Minimal GIF placeholder — keeps layout/image nodes tiny when upload fails. */
const TRANSPARENT_PIXEL_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Uploads every `data:` image in imported HTML to Convex storage and swaps `src`
 * for the public URL so document JSON stays under Convex size limits.
 * Compresses oversized embedded images before upload; on repeated failure, swaps
 * for a short placeholder so the document can still be saved.
 */
export async function replaceDataImageUrlsInHtml(
  html: string,
  deps: {
    generateUploadUrl: () => Promise<string>;
    finalizeUpload: (args: { storageId: Id<"_storage"> }) => Promise<string>;
  },
): Promise<string> {
  if (typeof window === "undefined") return html;

  const wrapped = `<div id="__import_root">${html}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("__import_root");
  if (!root) return html;

  const imgs = Array.from(root.querySelectorAll("img")).filter((el) => {
    const s = el.getAttribute("src");
    return Boolean(s?.startsWith("data:"));
  });

  async function uploadOne(dataUrl: string): Promise<string | null> {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const postUrl = await deps.generateUploadUrl();
    const uploadRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
      },
      body: blob,
    });
    if (!uploadRes.ok) return null;
    const json = (await uploadRes.json()) as { storageId: string };
    return deps.finalizeUpload({
      storageId: json.storageId as Id<"_storage">,
    });
  }

  for (const img of imgs) {
    let src = img.getAttribute("src");
    if (!src?.startsWith("data:")) continue;

    src = await compressDataUrlIfLarge(src);
    img.setAttribute("src", src);

    try {
      let url = await uploadOne(src);
      if (!url) {
        src = await compressDataUrlIfLarge(src);
        img.setAttribute("src", src);
        url = await uploadOne(src);
      }
      if (url) {
        img.setAttribute("src", url);
        continue;
      }
    } catch {
      // Try one more compress + upload below.
    }

    try {
      src = await compressDataUrlIfLarge(src);
      img.setAttribute("src", src);
      const url = await uploadOne(src);
      if (url) {
        img.setAttribute("src", url);
        continue;
      }
    } catch {
      // Fall through to placeholder.
    }

    const alt = img.getAttribute("alt")?.trim();
    img.setAttribute("src", TRANSPARENT_PIXEL_GIF);
    img.setAttribute(
      "title",
      alt?.length
        ? `${alt} — embedded image could not be uploaded; use Insert Image or Re-import with smaller assets.`
        : "Embedded image could not be uploaded; try a smaller image.",
    );
  }

  return root.innerHTML;
}
