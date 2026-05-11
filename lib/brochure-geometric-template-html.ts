/** Geometric product brochure — strict inline styles (no global `<style>`). Images: `image2.jpg`, `image3.png` under `/Brochure/images/`. */
export const BROCHURE_GEOMETRIC_TEMPLATE_HTML = `<div class="brochure-page doc-content" style="font-family: 'Roboto', Arial, sans-serif; background-color: #ffffff; padding: 40px 60px; max-width: 800px; margin: 0 auto; color: #666666; position: relative;">

    <div style="color: #6d64e8; font-size: 20px; font-weight: 700; margin-bottom: 5px;">Your Company</div>
    <div style="font-size: 11px; line-height: 1.4; margin-bottom: 40px;">
        123 Your Street<br>
        Your City, ST 12345<br>
        (123) 456 - 7890
    </div>

    <div style="color: #283592; font-size: 34px; line-height: 1; margin-bottom: 10px;">Product Brochure</div>
    <div style="color: #e01b84; font-size: 11px; margin-bottom: 40px;">September 04, 20XX</div>

    <h1 style="color: #000000; font-size: 21px; font-weight: 400; margin-bottom: 15px;">Product Overview</h1>
    <p style="font-size: 11px; line-height: 1.5; margin-bottom: 20px;">Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat.</p>

    <div style="display: flex; flex-direction: row; gap: 30px; align-items: flex-start; margin-bottom: 30px; margin-top: 20px;">
        <div style="flex: 0 0 250px;">
            <img src="/Brochure/images/image2.jpg" alt="Mobile Image" style="width: 100%; height: auto; display: block;">
        </div>

        <div style="flex: 1;">
            <h2 style="color: #000000; font-size: 16px; font-weight: 400; margin-top: 0; margin-bottom: 10px;">Lorem ipsum</h2>
            <p style="font-size: 11px; line-height: 1.5; margin-bottom: 20px;">Nam liber tempor cum soluta nobis eleifend option congue nihil imperdiet doming id quod mazim placerat facer possim assum. Typi non habent claritatem insitam; est usus legentis in iis qui facit eorum claritatem.</p>

            <h3 style="color: #e01b84; font-size: 12px; font-weight: 700; margin-bottom: 10px;">Lorem ipsum</h3>
            <p style="font-size: 11px; line-height: 1.5; margin-bottom: 0;">Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan.</p>
        </div>
    </div>

    <h2 style="color: #000000; font-size: 16px; font-weight: 400; margin-bottom: 10px;">Dolor sit</h2>
    <p style="font-size: 11px; line-height: 1.5; margin-bottom: 40px;">Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat.</p>

    <div style="margin-left: -60px; margin-right: -60px; margin-bottom: -40px;">
        <img src="/Brochure/images/image3.png" alt="Footer" style="width: 100%; height: auto; display: block;">
    </div>

</div>`;

/** Template gallery card — put your preview PNG at `public/Brochure.png`. */
export const BROCHURE_GEOMETRIC_GALLERY_SRC = "/Brochure.png";
