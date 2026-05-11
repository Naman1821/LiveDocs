/**
 * Letter template — inline styles only (matches `public/Letter/Letter.html` layout).
 * Assets: `/Letter/images/image1.png` (rule at top of the first sheet only). Signature
 * green `#57ba86` matches that bar (sampled from the PNG).
 *
 * Page 2+: `app/globals.css` paints the same rule at the bottom of each page-break
 * gap (i.e. right above the next sheet) when `.letter-page` exists.
 */
export const LETTER_SPEARMINT_TEMPLATE_HTML = `<div class="letter-page doc-content" style="font-family: Arial, Helvetica, sans-serif; background-color: #ffffff; max-width: 720px; margin: 0 auto; padding: 36px 56px 48px 56px; color: #353744;">

  <div style="font-size: 11pt; line-height: 1.5; margin: 0 0 calc(1.5em * 3) 0;">
    <img src="/Letter/images/image1.png" alt="" width="624" height="7" style="width: 100%; max-width: 624px; height: auto; display: block;">
  </div>

  <p style="margin: 0 0 16px 0; font-size: 11pt; line-height: 1.5; color: #353744;"><strong style="font-weight: 700;">Your Name</strong></p>
  <p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.4; color: #666666;">123 Your Street</p>
  <p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.4; color: #666666;">Your City, ST 12345</p>
  <p style="margin: 0 0 4px 0; font-size: 10pt; line-height: 1.4; color: #666666;">(123) 456-7890</p>
  <p style="margin: 0 0 24px 0; font-size: 10pt; line-height: 1.4; color: #666666;">no_reply@example.com</p>

  <p style="margin: 0 0 28px 0; font-size: 11pt; line-height: 1.5; color: #353744;">4th September 20XX</p>

  <p style="margin: 0 0 8px 0; font-size: 11pt; line-height: 1.5; color: #353744;"><strong style="font-weight: 700;">Ronny Reader</strong></p>
  <p style="margin: 0 0 4px 0; font-size: 11pt; line-height: 1.5; color: #353744;">CEO, Company Name</p>
  <p style="margin: 0 0 4px 0; font-size: 11pt; line-height: 1.5; color: #353744;">123 Address St</p>
  <p style="margin: 0 0 40px 0; font-size: 11pt; line-height: 1.5; color: #353744;">Anytown, ST 12345</p>

  <p style="margin: 0 0 16px 0; font-size: 11pt; line-height: 1.5; color: #353744;">Dear Ms. Reader,</p>

  <p style="margin: 0 0 16px 0; font-size: 11pt; line-height: 1.65; color: #353744; text-align: justify;">Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat.</p>

  <p style="margin: 0 0 16px 0; font-size: 11pt; line-height: 1.65; color: #353744; text-align: justify;">Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan.</p>

  <p style="margin: 0 0 24px 0; font-size: 11pt; line-height: 1.65; color: #353744; text-align: justify;">Nam liber tempor cum soluta nobis eleifend option congue nihil imperdiet doming id quod mazim placerat facer possim assum. Typi non habent claritatem insitam; est usus legentis in iis qui facit eorum claritatem. Investigationes demonstraverunt lectores legere me lius quod ii legunt saepius.</p>

  <p style="margin: 0 0 8px 0; font-size: 11pt; line-height: 1.5; color: #353744;">Sincerely,</p>
  <p style="margin: 0 0 8px 0; font-size: 11pt; line-height: 1.5;">&nbsp;</p>
  <p class="letter-signature-name" style="margin: 0; font-size: 14pt; line-height: 1.2; font-weight: 700;"><span style="color: #57ba86 !important;">Your Name</span></p>

</div>`;

/** Gallery card thumbnail — file at `public/letter.png` (replace with a full-page screenshot if you like). */
export const LETTER_SPEARMINT_GALLERY_SRC = "/letter.png";
