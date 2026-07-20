import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|favicon\\.ico|icon(?:/|$)|apple-icon(?:/|$)|app-icon(?:/|$)|opengraph-image(?:/|$)|twitter-image(?:/|$)|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
