# Privacy Policy (Project-Level)

## Core Principle

Lastik is designed as a privacy-first, local-first text de-identification utility.

## Data Handling Model

- Text analysis and masking run in browser runtime.
- The masking logic does not intentionally send document text to backend APIs.
- Export files are generated locally and saved directly by the user.

## GDPR Mapping (Technical)

Lastik can support privacy workflows. This document is technical guidance, not legal advice.

- **Pseudonymisation (GDPR Art. 4(5))**: Tag mode replaces personal data with reversible placeholders (for example `[PERSON_1]`) using local/exported mapping rules.
- **Privacy by Design (GDPR Art. 25)**: Core masking operations are performed locally in browser runtime, reducing data transfer to third parties.
- **Personal data categories (GDPR Art. 4(1))**: The rule set targets typical personal data, including names, contact details, document identifiers, financial identifiers, dates, and IP addresses.

## Special Categories and Limits

- Lastik does not provide dedicated classifiers for special categories of data under GDPR Art. 9 (for example health, religious beliefs, political opinions).
- Rule-based detection may miss entities or produce false positives.
- Human review is required before sharing output with external systems.

## Telemetry and Tracking

- Next.js telemetry is disabled in project scripts (`NEXT_TELEMETRY_DISABLED=1`).
- No analytics SDKs or ad trackers are included in masking logic.
- Infrastructure providers may still keep standard operational request metadata for security and reliability.

## Operator Guidance

- Use trusted environments for regulated documents.
- Avoid exposing sensitive text to third-party browser extensions.
