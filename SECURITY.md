# Security policy

Please do **not** report security vulnerabilities through public GitHub issues.

Report them privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" in the *Security* tab of this repository). Include a description, the affected
version and the steps to reproduce. We will acknowledge the report and keep you informed of the fix.

## Deployment notes

- Always set `ADMIN_PASSWORD` (or change the generated one after the first login) and keep `.env` out of
  version control.
- Expose the services through a reverse proxy with TLS; MongoDB must not be reachable from outside.
- The MCP server acts with the permissions of the user whose credentials are given to the LLM client; use
  accounts with the minimum permissions needed.
