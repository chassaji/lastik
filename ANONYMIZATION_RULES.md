# Data De-identification Rules Reference

This document describes how sensitive information is detected and processed within the Lastik engine.

## 🏗️ Architecture

De-identification is entirely rule-based, combining Regular Expressions, context hints, and functional validators. The rules are organized into a modular structure:

- **Universal Rules**: Located in [`src/lib/anonymizer/rules/universal.ts`](src/lib/anonymizer/rules/universal.ts). These apply globally regardless of the selected region.
- **Regional Rules**: Located in [`src/lib/anonymizer/rules/ru.ts`](src/lib/anonymizer/rules/ru.ts), [`am.ts`](src/lib/anonymizer/rules/am.ts), etc. These are specific to local document formats and identifiers.
- **Replacement Templates**: Managed in [`src/lib/anonymizer/rules/replacements.ts`](src/lib/anonymizer/rules/replacements.ts).

## 🔍 Data Types Detected

Lastik currently detects the following entity types:

- `EMAIL`: Standard email formats.
- `PHONE`: International and local phone numbers.
- `CARD`: Credit card numbers (validated using the **Luhn algorithm**).
- `IBAN`: International Bank Account Numbers.
- `SWIFT_BIC`: Bank Identifier Codes.
- `ACCOUNT`: General 20-digit bank account numbers.
- `DOC_ID`: Regional document identifiers (Passports, SSNs, Tax IDs).
- `PERSON`: Personal names (supported in Cyrillic and Latin scripts).
- `DATE`: Various date formats (`DD.MM.YYYY`, `YYYY-MM-DD`, etc.).

## ⚙️ Detection Logic

### 1. Sensitivity Modes
- **Conservative**: Prioritizes **precision**. Detections with `contextHints` are only accepted if relevant keywords are found near the match (e.g., "passport", "email").
- **Aggressive**: Prioritizes **recall**. Detections are accepted based on pattern matching alone, even without surrounding context.

### 2. Overlap Resolution
If multiple rules match the same segment of text, the engine resolves the conflict using a deterministic priority system:
1. Higher priority rule wins.
2. If priorities are equal, the earlier start position wins.
3. Longest match wins.

## 🔄 De-identification Strategy

Lastik supports two processing modes:

### Mode A: `tag`
Replaces the sensitive value with a deterministic placeholder:
- `[EMAIL_1]`, `[PERSON_2]`, `[DOC_ID_1]`

### Mode B: `synthetic`
Replaces the sensitive value with a realistic but fake alternative:
- `EMAIL` → `user1@example.test`
- `PHONE` → `+00000000001`
- `PERSON` → `PERSON_1`
- `DATE` → Preserves the original date format (e.g., `12.05.2024` → `01.01.1990`).

## 🎯 Global & Local Consistency

- **Cross-Document Stability**: Within a single document, identical source tokens mapped to the same type will receive the **same replacement**.
- **Interactive Toggling**: Users can disable or enable de-identification for specific instances or for all identical occurrences globally via the UI.

## ⚠️ Current Limitations

- **Complex Contexts**: Rule-based detection may occasionally produce false positives in highly ambiguous text.
- **Organization Detection**: `ORG` type exists but lacks a dedicated automated rule set (manual selection is recommended).
