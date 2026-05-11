import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

/** Route performs its own `auth()` / Convex checks — avoid clerk edge quirks on POST API. */
const isLiveblocksAuthApi = createRouteMatcher(["/api/liveblocks-auth(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isLiveblocksAuthApi(req)) {
    return;
  }
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};