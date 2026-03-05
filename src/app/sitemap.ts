import type { MetadataRoute } from "next";

const DEFAULT_SITE_URL = "https://lastik.chassaji.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
const normalizedSiteUrl = SITE_URL.endsWith("/") ? SITE_URL.slice(0, -1) : SITE_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${normalizedSiteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
