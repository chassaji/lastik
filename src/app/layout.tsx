import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-logo",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const DEFAULT_SITE_URL = "https://lastik.chassaji.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
const normalizedSiteUrl = SITE_URL.endsWith("/") ? SITE_URL.slice(0, -1) : SITE_URL;
const canonicalUrl = `${normalizedSiteUrl}/`;
const ogImageUrl = `${normalizedSiteUrl}/favicon.svg`;

export const metadata: Metadata = {
  metadataBase: new URL(canonicalUrl),
  title: {
    default: "Lastik — Data De-identification Tool",
    template: "%s | Lastik",
  },
  applicationName: "Lastik",
  description: "Secure, browser-only data de-identification for sensitive text",
  keywords: [
    "data de-identification",
    "PII masking",
    "text anonymization",
    "GDPR pseudonymization",
    "privacy by design",
    "local processing",
  ],
  alternates: {
    canonical: canonicalUrl,
    languages: {
      "en-US": canonicalUrl,
    },
  },
  openGraph: {
    type: "website",
    url: canonicalUrl,
    siteName: "Lastik",
    title: "Lastik — Data De-identification Tool",
    description: "Secure, browser-only data de-identification for sensitive text",
    locale: "en_US",
    images: [
      {
        url: ogImageUrl,
        alt: "Lastik",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lastik — Data De-identification Tool",
    description: "Secure, browser-only data de-identification for sensitive text",
    images: [ogImageUrl],
    creator: "@chassaji",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plusJakarta.variable} ${dmMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
