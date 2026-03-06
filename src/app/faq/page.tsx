import type { Metadata } from "next";
import Link from "next/link";

const FAQ_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Lastik?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lastik is an open-source data de-identification tool that helps mask Personally Identifiable Information (PII) in text before sharing it with LLMs or other third parties.",
      },
    },
    {
      "@type": "Question",
      name: "Is my data sent to any server for processing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No document text is sent by Lastik's masking engine. Detection and replacement run locally in your browser runtime on your device.",
      },
    },
    {
      "@type": "Question",
      name: "Is Lastik GDPR compliant?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lastik helps support GDPR, HIPAA, and CCPA-oriented workflows by reducing exposure of personal data before external sharing. Compliance depends on your full process and legal requirements.",
      },
    },
    {
      "@type": "Question",
      name: "What types of information can Lastik detect?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lastik uses deterministic rule-based detection for common PII classes, including names, emails, phone numbers, payment data, and dates, with regional patterns for EU, RU, and AM.",
      },
    },
    {
      "@type": "Question",
      name: "What is Tag Mode and why is it useful?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Tag Mode replaces sensitive values with placeholders like [PERSON_1] and [EMAIL_1], preserving document structure for AI workflows without exposing original private data.",
      },
    },
  ],
});

export const metadata: Metadata = {
  title: {
    absolute: "FAQ - Lastik Data De-identification",
  },
  description:
    "Frequently asked questions about Lastik: local processing, security, supported PII types, and LLM-safe workflows.",
  alternates: {
    canonical: "/faq",
  },
};

export default function FaqPage() {
  return (
    <main className="h-screen overflow-y-auto bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }} />
      <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
        <Link
          href="/"
          className="inline-flex items-center rounded-md border border-(--border) bg-white px-3 py-1.5 text-sm font-medium text-(--text-secondary) hover:text-(--accent) hover:border-(--accent)/40"
        >
          Back to Lastik
        </Link>

        <header className="mt-6">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Frequently Asked Questions</h1>
          <p className="mt-3 text-sm md:text-base text-(--text-secondary)">
            Clear answers about security, local processing, and de-identification workflows.
          </p>
        </header>

        <section className="mt-10 space-y-6">
          <h2 className="text-xl font-semibold">General & Security</h2>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">What is Lastik?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              Lastik is an open-source data de-identification tool that helps mask Personally Identifiable
              Information (PII) in text before sharing it with LLMs such as ChatGPT or Gemini, or with other third
              parties.
            </p>
          </article>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">Is my data sent to any server for processing?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              No document text is sent by Lastik&apos;s masking engine. Detection and replacement run in your browser
              runtime on your device. Operational hosting logs may still exist at infrastructure level (for example,
              standard request metadata), but your editor text is not uploaded by the app logic.
            </p>
          </article>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">Is Lastik GDPR compliant?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              Lastik is a privacy-first utility that can help reduce exposure of personal data and support GDPR, HIPAA,
              and CCPA workflows. Compliance depends on your full process and legal requirements; Lastik is a technical
              tool and does not provide legal advice.
            </p>
          </article>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">Is it safe to use online editors for sensitive text?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              It depends on their processing model and retention policy. Many online tools can send text to remote
              servers. Lastik is built for local-first processing so masking happens in-browser before data is shared
              elsewhere.
            </p>
          </article>
        </section>

        <section className="mt-10 space-y-6">
          <h2 className="text-xl font-semibold">Core Features</h2>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">What types of information can Lastik detect?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              Lastik uses deterministic rule-based detection for common PII classes, including names, emails, phone
              numbers, payment data, and dates. It includes regional document patterns for EU, RU, and AM.
            </p>
          </article>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">Can I manually mask specific words or phrases?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              Yes. Highlight text in the editor and use <span className="font-medium text-foreground">Replace Selection</span>.
              Lastik creates a local user rule and can apply it to matching occurrences in the same document.
            </p>
          </article>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">How do I control which entities are masked?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              Lastik provides an interactive split-pane workflow with a review sidebar. You can enable or disable
              masking globally or per detected item before exporting or copying the result.
            </p>
          </article>
        </section>

        <section className="mt-10 space-y-6 pb-10">
          <h2 className="text-xl font-semibold">Workflows & LLM Integration</h2>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">What is Tag Mode and why is it useful?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              Tag Mode replaces sensitive values with placeholders like <code>[PERSON_1]</code> and{" "}
              <code>[EMAIL_1]</code>. This preserves context and structure for AI models while hiding original private
              values.
            </p>
          </article>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">How does Reverse Workflow (de-anonymization) work?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              After receiving an AI response with tags, you can paste it back into Lastik and load the saved rule set.
              Lastik then maps placeholders back to the original values locally.
            </p>
          </article>

          <article className="rounded-xl border border-(--border) bg-white p-5">
            <h3 className="text-base font-semibold">Can I save or share masking rules?</h3>
            <p className="mt-2 text-sm leading-7 text-(--text-secondary)">
              Yes. You can export rules as JSON and import them later to continue work or standardize masking in your
              team workflows.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
