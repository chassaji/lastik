# <img src="public/favicon.svg" width="32" height="32" align="center" /> Lastik — Data Pseudonymisation Tool

Lastik is a local-first, browser-based tool for masking sensitive data in text before sharing it with LLMs or third parties.

All masking logic runs in the browser runtime.

**Links:** [Try Online](https://lastik.chassaji.com/) · [FAQ](https://lastik.chassaji.com/faq) · [Privacy Policy](https://lastik.chassaji.com/privacy) · [Report a Bug](https://github.com/chassaji/lastik/issues) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

**Compliance Snapshot:** Privacy by Design · Pseudonymisation (GDPR Art. 4(5)) · Local-first processing

---

## Why Lastik

Many privacy tools depend on cloud processing. Lastik is designed for local-first workflows:

- No document text is sent to external APIs by masking logic
- Detection is deterministic and rule-based
- Mapping files are generated locally and exported only by user action

## Current Capabilities

- Local-first processing in browser runtime
- Rule-based PII detection with regional patterns (RU, AM, EU)
- Interactive split-pane editor with review sidebar
- Global/local masking controls for detected entities
- Forward and reverse workflows via JSON import/export rules
- Manual masking by text selection
- **Tag mode only** (`[PERSON_1]`, `[EMAIL_1]`, `[DATE_1]`, ...)

## Detected PII Classes

- Names and users (`PERSON`, `USER`)
- Organizations (`ORG`)
- Emails and phones (`EMAIL`, `PHONE`)
- Network and location data (`IP`, `ADDRESS`)
- Document identifiers (`DOC_ID`)
- Financial identifiers (`CARD`, `ACCOUNT`, `IBAN`, `SWIFT_BIC`)
- Dates (`DATE`)

## GDPR Alignment (Technical)

Lastik is a technical utility that can support privacy workflows. It is not legal advice.

- **Pseudonymisation (GDPR Art. 4(5))**: Tag mode replaces values with reversible placeholders linked through local/exported mappings.
- **Privacy by Design (GDPR Art. 25)**: Processing is performed in browser runtime without sending document text by app masking logic.
- **Data minimisation (GDPR Art. 5(1)(c))**: Lastik does not require user accounts. The app masking logic does not send document text or PII to backend APIs. Infrastructure providers may still process standard operational request metadata (for example IP address and user-agent) in hosting logs.
- **Personal Data Scope (GDPR Art. 4(1))**: The tool targets common personal data fields such as names, contact details, document and financial identifiers, dates, and IP addresses.
- **Limitation (GDPR Art. 9)**: Special categories of personal data (for example health, religion, political views) are not explicitly classified by dedicated detectors.

## Getting Started

### Development

```bash
git clone https://github.com/chassaji/lastik.git
cd lastik
npm install
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Project Structure

- `src/lib/anonymizer/engine.ts` — core analysis engine
- `src/lib/anonymizer/rules/` — universal and regional detection rules
- `src/components/review-sidebar.tsx` — review controls for detections
- `src/app/page.tsx` — main application UI
- `src/app/faq/page.tsx` — FAQ page
- `src/app/privacy/page.tsx` — Privacy Policy page

## Security and Privacy

- Project privacy model: [PRIVACY.md](PRIVACY.md)
- Public privacy page: [https://lastik.chassaji.com/privacy](https://lastik.chassaji.com/privacy)
- Vulnerability reporting: [SECURITY.md](SECURITY.md)

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <img src="public/favicon.svg" width="24" height="24" /> <br/>
  Made by <a href="https://github.com/chassaji">chassaji</a> © 2026
</p>
