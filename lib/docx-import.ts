import mammoth from "mammoth";

const styleMap = [
  // Headings from Word / Google Docs export (case variants).
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='heading 4'] => h4:fresh",

  // Body paragraphs / list paragraphs.
  "p[style-name='Body Text'] => p:fresh",
  "p[style-name='body text'] => p:fresh",
  "p[style-name='List Paragraph'] => p:fresh",
  "p[style-name='list paragraph'] => p:fresh",

  // Normal paragraphs + alignment mapping.
  "p[style-name='normal'] => p:fresh",
  "p[style-name='Normal'] => p:fresh",
  "p[style-name='normal'][alignment='center'] => p.docx-center:fresh",
  "p[style-name='Normal'][alignment='center'] => p.docx-center:fresh",
  "p[style-name='normal'][alignment='right'] => p.docx-right:fresh",
  "p[style-name='Normal'][alignment='right'] => p.docx-right:fresh",
  "p[style-name='normal'][alignment='justify'] => p.docx-justify:fresh",
  "p[style-name='Normal'][alignment='justify'] => p.docx-justify:fresh",

  // Table of contents rows keep as paragraphs with level classes.
  "p[style-name='toc 1'] => p.toc-level-1:fresh",
  "p[style-name='toc 2'] => p.toc-level-2:fresh",
  "p[style-name='toc 3'] => p.toc-level-3:fresh",
  "p[style-name='toc 4'] => p.toc-level-4:fresh",
  "p[style-name='toc 5'] => p.toc-level-5:fresh",
  "p[style-name='toc 6'] => p.toc-level-6:fresh",
  "p[style-name='toc 7'] => p.toc-level-7:fresh",
  "p[style-name='toc 8'] => p.toc-level-8:fresh",
  "p[style-name='toc 9'] => p.toc-level-9:fresh",
];

function applyParagraphSpacingHeuristics(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = Array.from(doc.querySelectorAll("p"));

  for (const p of paragraphs) {
    const content = (p.innerHTML ?? "").trim();
    const text = (p.textContent ?? "").replace(/\u00a0/g, " ").trim();
    const isSpacer = text.length === 0 && /^(?:\s|&nbsp;|<br\s*\/?>)*$/i.test(content);

    if (isSpacer) {
      p.style.marginTop = "1em";
      p.style.marginBottom = "0";
      continue;
    }

    // Keep compact document-like paragraph rhythm by default.
    if (!p.style.marginTop) p.style.marginTop = "0";
    if (!p.style.marginBottom) p.style.marginBottom = "0.35em";
  }

  return doc.body.innerHTML;
}

export async function docxToHtml(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap,
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.read("base64");
        return { src: `data:${image.contentType};base64,${data}` };
      }),
    },
  );

  let html = result.value;
  html = html
    .replace(/<p class="docx-center"/g, '<p style="text-align:center"')
    .replace(/<p class="docx-right"/g, '<p style="text-align:right"')
    .replace(/<p class="docx-justify"/g, '<p style="text-align:justify"');

  return applyParagraphSpacingHeuristics(html);
}

/** Letter page usable content height for this project import profile. */
export function getDocxPageHeightPx(): number {
  return 943;
}
