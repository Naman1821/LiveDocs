/**
 * Coral resume — Playfair + coral; comfortable spacing + readable measure.
 */
const CORAL = "#F08080";
const BLACK = "#000000";
const BODY = "#1a1a1a";
const DISPLAY = "var(--font-playfair-display), Georgia, 'Times New Roman', serif";

export const RESUME_CORAL_TEMPLATE_HTML = `
<table style="width:100%;max-width:620px;border-collapse:collapse;margin:0;"><tbody><tr><td style="padding:8px 40px 24px 0;vertical-align:top;">

<p style="margin:0 0 20px;line-height:1.15;font-family:${DISPLAY};">
<span style="font-size:15pt;font-weight:600;color:${CORAL};">Hello</span><br>
<span style="font-size:30pt;font-weight:700;color:${BLACK};">I'm Your Name</span>
</p>
<p style="font-family:${DISPLAY};font-size:10.5pt;line-height:1.65;margin:0 0 10px;color:${BODY};">123 YOUR STREET<br>YOUR CITY, ST 12345</p>
<p style="font-family:${DISPLAY};font-size:10.5pt;line-height:1.65;margin:0 0 28px;color:${BODY};"><strong>(123) 456-7890</strong><br><strong>NO_REPLY@EXAMPLE.COM</strong></p>

<h1 style="margin:0 0 12px;font-family:${DISPLAY};font-size:16pt;font-weight:700;color:${CORAL};line-height:1.25;">Skills</h1>
<p style="font-family:${DISPLAY};font-size:11pt;line-height:1.65;margin:0 0 28px;color:${BODY};">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean ac interdum nisi. Sed in consequat mi. Sed pulvinar lacinia felis eu finibus.</p>

<hr style="border:0;border-top:1px solid ${BLACK};margin:28px 0 22px;height:0;" />

<h1 style="margin:0 0 14px;font-family:${DISPLAY};font-size:16pt;font-weight:700;color:${CORAL};line-height:1.25;">Experience</h1>

<p style="margin:16px 0 8px;font-family:${DISPLAY};font-size:9.5pt;font-weight:700;color:${BLACK};text-transform:uppercase;letter-spacing:0.03em;line-height:1.4;">MONTH 20XX - PRESENT</p>
<p style="margin:0 0 12px;font-family:${DISPLAY};font-size:11.5pt;font-weight:700;color:${BLACK};line-height:1.4;"><strong>Company Name, Location* — Job Title</strong></p>
<ul style="margin:0 0 26px;padding-left:22px;font-family:${DISPLAY};font-size:10.5pt;line-height:1.62;color:${BODY};">
<li style="margin-bottom:10px;"><p style="margin:0;">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></li>
<li style="margin-bottom:10px;"><p style="margin:0;">Aenean ac interdum nisi. Sed in consequat mi.</p></li>
<li style="margin-bottom:10px;"><p style="margin:0;">Sed in consequat mi, sed pulvinar lacinia felis eu finibus.</p></li>
</ul>

<p style="margin:16px 0 8px;font-family:${DISPLAY};font-size:9.5pt;font-weight:700;color:${BLACK};text-transform:uppercase;letter-spacing:0.03em;line-height:1.4;">MONTH 20XX - MONTH 20XX</p>
<p style="margin:0 0 12px;font-family:${DISPLAY};font-size:11.5pt;font-weight:700;color:${BLACK};line-height:1.4;"><strong>Company Name, Location* — Job Title</strong></p>
<ul style="margin:0 0 26px;padding-left:22px;font-family:${DISPLAY};font-size:10.5pt;line-height:1.62;color:${BODY};">
<li style="margin-bottom:10px;"><p style="margin:0;">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></li>
<li style="margin-bottom:10px;"><p style="margin:0;">Aenean ac interdum nisi. Sed in consequat mi.</p></li>
</ul>

<p style="margin:16px 0 8px;font-family:${DISPLAY};font-size:9.5pt;font-weight:700;color:${BLACK};text-transform:uppercase;letter-spacing:0.03em;line-height:1.4;">MONTH 20XX - MONTH 20XX</p>
<p style="margin:0 0 12px;font-family:${DISPLAY};font-size:11.5pt;font-weight:700;color:${BLACK};line-height:1.4;"><strong>Company Name, Location* — Job Title</strong></p>
<ul style="margin:0 0 28px;padding-left:22px;font-family:${DISPLAY};font-size:10.5pt;line-height:1.62;color:${BODY};">
<li style="margin-bottom:10px;"><p style="margin:0;">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></li>
<li style="margin-bottom:10px;"><p style="margin:0;">Aenean ac interdum nisi. Sed in consequat mi.</p></li>
<li style="margin-bottom:10px;"><p style="margin:0;">Sed pulvinar lacinia felis eu finibus.</p></li>
</ul>

<hr style="border:0;border-top:1px solid ${BLACK};margin:28px 0 22px;height:0;" />

<h1 style="margin:0 0 14px;font-family:${DISPLAY};font-size:16pt;font-weight:700;color:${CORAL};line-height:1.25;">Education</h1>

<p style="margin:0 0 8px;font-family:${DISPLAY};font-size:9.5pt;font-weight:700;color:${BLACK};text-transform:uppercase;letter-spacing:0.03em;line-height:1.4;">MONTH 20XX - MONTH 20XX</p>
<p style="margin:0 0 12px;font-family:${DISPLAY};font-size:11.5pt;font-weight:700;color:${BLACK};line-height:1.4;"><strong>College Name, Location* — Degree</strong></p>
<p style="font-family:${DISPLAY};font-size:10.5pt;line-height:1.65;margin:0 0 28px;color:${BODY};">Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore.</p>

<hr style="border:0;border-top:1px solid ${BLACK};margin:28px 0 22px;height:0;" />

<h1 style="margin:0 0 12px;font-family:${DISPLAY};font-size:16pt;font-weight:700;color:${CORAL};line-height:1.25;">Awards</h1>
<p style="font-family:${DISPLAY};font-size:10.5pt;line-height:1.65;margin:0 0 12px;color:${BODY};">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
<p style="font-family:${DISPLAY};font-size:10.5pt;line-height:1.65;margin:0;color:${BODY};">Aenean ac interdum nisi.</p>

</td></tr></tbody></table>
<p></p>
`.trim();
