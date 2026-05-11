/** TipTap-friendly HTML for dashboard gallery templates (distinct layouts per card). */

import { BROCHURE_GEOMETRIC_TEMPLATE_HTML } from "@/lib/brochure-geometric-template-html";
import { LETTER_SPEARMINT_TEMPLATE_HTML } from "@/lib/letter-spearmint-template-html";
import { RESUME_CORAL_TEMPLATE_HTML } from "@/lib/resume-coral-template-html";

export const documentTemplates = {
  blank: "",
  resumeCoral: RESUME_CORAL_TEMPLATE_HTML,
  letterSpearmint: LETTER_SPEARMINT_TEMPLATE_HTML,
  brochureGeometric: BROCHURE_GEOMETRIC_TEMPLATE_HTML,
} as const;

export type DocumentTemplateKey = keyof typeof documentTemplates;
