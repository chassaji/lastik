# Privacy Policy (Project-level)

## Core principle
This application is designed for local-first anonymization of sensitive text.

## Data handling
- Input text is processed in the browser runtime.
- No document text is intentionally sent to backend APIs by anonymization logic.
- Export files are generated on-device and downloaded directly by the browser.

## Telemetry
- Runtime scripts use disabled Next telemetry in npm scripts.
- Avoid adding analytics providers that can capture text payloads.

## Operator guidance
- Do not paste highly sensitive data into third-party browser extensions.
- Prefer trusted local environment for processing regulated documents.

## Limitations
- Rule-based detection may miss entities or produce false positives.
- Always review output before sharing to external systems.
