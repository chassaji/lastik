# <img src="public/favicon.svg" width="32" height="32" align="center" /> Lastik — Data De-identification Tool

Lastik is a **secure, browser-only** tool designed for data de-identification within text documents. Built with privacy as a core principle, Lastik ensures that sensitive information never leaves your machine.

**[Try Lastik Online](https://chassaji.github.io/lastik/)**

---

## Why Lastik?

Current data protection tools often rely on cloud-based AI, which involves sending sensitive information to third-party servers. **Lastik is different.** It performs all detection and de-identification locally using a deterministic rule-based engine, giving you 100% control over your data privacy.

## ✨ Key Features

- **🛡️ 100% Local Processing**: No data is ever sent to a server. Your text stays in your browser's memory.
- **🔍 Intelligent Rule-Based Engine**: Modular detection system for common sensitive data types (Emails, Phones, Cards, IBANs, Dates).
- **🌍 Regional Awareness**: Specialized rules for **RU**, **AM**, and **EU** document formats (Passports, SSNs, Tax IDs).
- **📝 Reliable Split-Pane Editor**: A high-performance plain-text editor paired with an interactive preview panel.
- **🎯 Surgical Control**:
  - Toggle de-identification for individual occurrences.
  - Apply rules globally across the entire document.
  - Manually select any text to create custom masking rules.
- **🔄 Two De-identification Modes**:
  - **Tag Mode**: Replaces data with identifiable tags like `[PERSON_1]`.
  - **Synthetic Mode**: Replaces data with realistic fake data like `John Doe` or `user1@example.test`.

## 🏗️ Architecture

Lastik is built using a modern, modular architecture:

- **Rule Definitions**: Located in `src/lib/anonymizer/rules/`, allowing for easy extension and auditing of regular expressions.
- **Stateless Engine**: The core logic in `src/lib/anonymizer/engine.ts` is purely functional and data-driven.
- **React-Powered UI**: Built with Next.js 15, utilizing specialized coordinate mapping to ensure interactive highlights remain perfectly aligned with your original text.

## 🚀 Getting Started

### Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/chassaji/lastik.git
   cd lastik
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

### Production Build

```bash
npm run build
npm start
```

## 🛠 Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Components**: React 19

## 🔒 Security & Privacy

- **Zero API Calls**: The application does not communicate with any external APIs.
- **No Persistence**: Data is only held in the application state and is cleared upon refresh or using the "Clear" button.
- **Open Source**: Transparent code allowing for full security auditing.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <img src="public/favicon.svg" width="24" height="24" /> <br/>
  Made by [Anna Airapetian](https://github.com/chassaji) © 2026
</p>
