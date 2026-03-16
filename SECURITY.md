# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Email **ufuk@useody.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
3. You will receive a response within 48 hours.
4. We will work with you to understand and address the issue before any public disclosure.

## Scope

Ody Refine runs locally on user machines. Security concerns include:

- **Code execution**: The CLI processes user-provided files. We sanitize inputs to prevent injection.
- **Network requests**: When using cloud embedding/LLM providers, API keys are sent over HTTPS. Keys are never logged or stored beyond the user's environment variables.
- **SQLite database**: The local `.ody-refine/` database contains processed document content. It stays on the user's machine.
- **Dependencies**: We minimize dependencies and audit them regularly.

## Security Design Principles

- **Zero trust by default**: No data leaves the user's machine unless they explicitly configure a cloud provider.
- **No telemetry**: We do not collect usage data, crash reports, or analytics.
- **Local-first**: SQLite storage, optional local models (Ollama), no server required.
