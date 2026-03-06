import type { Metadata } from "next";
import Link from "next/link";

const DEFAULT_SITE_URL = "https://lastik.chassaji.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
const NORMALIZED_SITE_URL = SITE_URL.endsWith("/") ? SITE_URL.slice(0, -1) : SITE_URL;
const PRIVACY_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${NORMALIZED_SITE_URL}/privacy#webpage`,
      url: `${NORMALIZED_SITE_URL}/privacy`,
      name: "Privacy Policy - Lastik Data De-identification",
      description:
        "Privacy policy for Lastik local-first de-identification workflows and browser-only processing model.",
      inLanguage: "en-US",
      isPartOf: {
        "@id": `${NORMALIZED_SITE_URL}/#website`,
      },
      about: {
        "@id": `${NORMALIZED_SITE_URL}/#application`,
      },
      mainEntity: {
        "@id": `${NORMALIZED_SITE_URL}/privacy#policy`,
      },
    },
    {
      "@type": "CreativeWork",
      "@id": `${NORMALIZED_SITE_URL}/privacy#policy`,
      additionalType: "https://schema.org/PrivacyPolicy",
      name: "Lastik Privacy Policy",
      url: `${NORMALIZED_SITE_URL}/privacy`,
      description:
        "Policy describing local processing, data handling boundaries, and privacy-first behavior of Lastik.",
      inLanguage: "en-US",
      publisher: {
        "@type": "Organization",
        name: "Lastik",
        url: `${NORMALIZED_SITE_URL}/`,
      },
      codeRepository: "https://github.com/chassaji/lastik",
      license: "https://spdx.org/licenses/MIT.html",
      keywords: [
        "privacy policy",
        "local-first processing",
        "PII masking",
        "data anonymization",
        "GDPR support",
      ],
    },
  ],
});

export const metadata: Metadata = {
  title: {
    absolute: "Privacy Policy - Lastik Data De-identification",
  },
  description:
    "Lastik privacy policy: local-first processing, no third-party trackers in app logic, and transparent open-source handling.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="h-screen overflow-y-auto bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: PRIVACY_JSON_LD }} />
      <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
        <Link
          href="/"
          className="inline-flex items-center rounded-md border border-(--border) bg-white px-3 py-1.5 text-sm font-medium text-(--text-secondary) hover:text-(--accent) hover:border-(--accent)/40"
        >
          Back to Lastik
        </Link>

        <header className="mt-6">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm md:text-base text-(--text-secondary)">
            Lastik follows a privacy-first, local-processing model.
          </p>
        </header>

        <section className="mt-10 rounded-xl border border-(--border) bg-white p-5">
          <h2 className="text-lg font-semibold">1. Privacy-by-Design</h2>
          <p className="mt-3 text-sm leading-7 text-(--text-secondary)">
            Lastik is designed so de-identification runs in the browser runtime on your device. The core masking logic
            does not require sending your document text to external APIs.
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-(--border) bg-white p-5">
          <h2 className="text-lg font-semibold">2. Data Handling</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-(--text-secondary)">
            <li>All de-identification and rule matching happen locally in your browser session.</li>
            <li>Input text is not uploaded by Lastik&apos;s anonymization logic.</li>
            <li>Export files are generated locally and saved directly to your device.</li>
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-(--border) bg-white p-5">
          <h2 className="text-lg font-semibold">3. Cookies, Tracking, and Logs</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-(--text-secondary)">
            <li>Lastik does not include analytics SDKs, advertising scripts, or third-party tracking pixels in app logic.</li>
            <li>Lastik uses local browser storage only for product UX state (for example, onboarding completion).</li>
            <li>
              Like most hosted websites, infrastructure providers may process standard operational request metadata
              (for example, IP address, user-agent, and timestamp) for security and reliability.
            </li>
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-(--border) bg-white p-5">
          <h2 className="text-lg font-semibold">4. Open Source Transparency</h2>
          <p className="mt-3 text-sm leading-7 text-(--text-secondary)">
            Lastik is open source. You can inspect implementation details, detection rules, and export logic directly in
            the public repository to verify how data is handled.
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-(--border) bg-white p-5">
          <h2 className="text-lg font-semibold">5. Compliance Scope</h2>
          <p className="mt-3 text-sm leading-7 text-(--text-secondary)">
            Lastik can support privacy workflows under regulations such as GDPR, HIPAA, and CCPA by helping remove
            personal data before sharing text with third parties. Regulatory compliance depends on your full legal and
            organizational process; this page does not provide legal advice.
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-(--border) bg-white p-5">
          <h2 className="text-lg font-semibold">6. Contact and Source</h2>
          <p className="mt-3 text-sm leading-7 text-(--text-secondary)">
            Repository:{" "}
            <a
              href="https://github.com/chassaji/lastik"
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) hover:underline"
            >
              github.com/chassaji/lastik
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
