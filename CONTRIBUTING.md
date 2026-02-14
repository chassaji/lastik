# Contributing to Lastik

First off, thanks for taking the time to contribute! Lastik is a community-driven project dedicated to data privacy.

## 🛠️ Development Setup

1. **Prerequisites**: Node.js 18+ and `npm`.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run the development server**:
   ```bash
   npm run dev
   ```

## 🔍 Adding Detection Rules

Rules are the heart of Lastik. We follow a modular structure to keep the engine clean and maintainable.

### Where to add rules?
- **Universal Rules**: If the format is global (e.g., a new crypto wallet address), add it to `src/lib/anonymizer/rules/universal.ts`.
- **Regional Rules**: If the format is country-specific, create or update the file in `src/lib/anonymizer/rules/{region_code}.ts`.

### Rule Structure
Each rule must implement the `AnonymizationRule` interface:

```typescript
{
  id: "region.data_type",   // Unique identifier
  type: "DOC_ID",           // EntityType (from src/lib/anonymizer/types.ts)
  pattern: /regex/g,        // Global regex pattern
  priority: 80,             // Higher priority wins conflicts
  confidenceBasis: "format" // Description of detection method
  contextHints: ["hint1"]   // Keywords required for conservative mode
}
```

## 🧪 Testing

We value high-quality detections. If you add a new rule or change the engine logic:
1. Add relevant test cases to `src/lib/anonymizer/engine.test.ts`.
2. Ensure all tests pass:
   ```bash
   npm test
   ```

## 📝 Pull Request Guidelines

1. **Branching**: Create a feature branch from `main`.
2. **Commit Messages**: Use descriptive commit messages.
3. **Formatting**: Ensure your code follows the project's formatting standards.
4. **Documentation**: If you add a new regional support, update the `ANONYMIZATION_RULES.md` and `README.md`.

---

Thank you for helping make the web more private!
