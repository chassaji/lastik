# <img src="public/favicon.svg" width="32" height="32" align="center" /> Lastik — Data De-identification Tool

Lastik is a local-first, browser-only tool for de-identifying sensitive text.  
All processing runs on-device in your browser.

**Links:** [Try Online](https://lastik.chassaji.com/) · [Report a Bug](https://github.com/chassaji/lastik/issues) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

---

## Why Lastik

Many privacy tools rely on cloud processing. Lastik is designed for a different workflow:

- No document text is sent to external APIs by anonymization logic
- Detection runs with deterministic, auditable rules
- Mappings are generated locally and can be exported by the user

## Key Features

- 100% local processing in browser runtime
- Rule-based detection for common PII classes
- Regional rules for RU, AM, and EU document patterns
- Interactive split-pane editor with review sidebar
- Global/local masking controls for detected entities
- Forward and reverse workflows via import/exportable rules
- Two replacement modes:
  - Tag mode (`[PERSON_1]`, `[EMAIL_1]`, ...)
  - Synthetic mode (`user1@example.test`, etc.)

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- React 19
- Tailwind CSS 4

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
- `src/app/page.tsx` — primary UI

## Security And Privacy

- Local-only processing model: see [PRIVACY.md](PRIVACY.md)
- Vulnerability reporting: see [SECURITY.md](SECURITY.md)
- Contributor workflow: see [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <img src="public/favicon.svg" width="24" height="24" /> <br/>
  Made by <a href="https://github.com/chassaji">chassaji</a> © 2026
</p>
