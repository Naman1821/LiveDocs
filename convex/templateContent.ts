/** TipTap-compatible HTML for dashboard templates. */

import { BROCHURE_GEOMETRIC_TEMPLATE_HTML } from "../lib/brochure-geometric-template-html";
import { LETTER_SPEARMINT_TEMPLATE_HTML } from "../lib/letter-spearmint-template-html";
import { RESUME_CORAL_TEMPLATE_HTML } from "../lib/resume-coral-template-html";

/** Canonical `resume` / simple gallery mapping. */
const RESUME_SIMPLE_HTML = `<h1 style="text-align:center">[Your Name]</h1><p style="text-align:center">Email | Phone | Location</p><hr /><h2>Experience</h2><ul><li>Achievement or responsibility…</li><li>Another bullet…</li></ul><h2>Education</h2><p>Degree, School — Year</p><p></p>`;

const LETTER_SIMPLE_HTML = `<p>[Date]</p><p>Dear [Name],</p><p>Start typing your letter here…</p><p>Sincerely,</p><p>[Your Name]</p><p></p>`;

const PROPOSAL_SIMPLE_HTML = `<h1>Project Proposal</h1><h2>Overview</h2><p>Summarize goals, scope, and intended outcomes.</p><h2>Timeline</h2><ol><li>Phase one</li><li>Phase two</li></ol><p></p>`;

export function templateTitleAndHtml(templateType: string): {
  title: string;
  html: string;
} {
  switch (templateType) {
    case "blank":
      return { title: "Untitled document", html: "<p></p>" };
    case "resume":
      return { title: "Resume", html: RESUME_SIMPLE_HTML };
    case "letter":
      return { title: "Letter", html: LETTER_SIMPLE_HTML };
    case "proposal":
      return { title: "Project proposal", html: PROPOSAL_SIMPLE_HTML };
    case "resume-coral":
      return { title: "Resume", html: RESUME_CORAL_TEMPLATE_HTML };
    case "letter-spearmint":
      return { title: "Letter", html: LETTER_SPEARMINT_TEMPLATE_HTML };
    case "brochure-geometric":
      return { title: "Brochure", html: BROCHURE_GEOMETRIC_TEMPLATE_HTML };
    default:
      return { title: "Untitled document", html: "<p></p>" };
  }
}
