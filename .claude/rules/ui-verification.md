---
paths:
  - 'apps/web/src/**/*.tsx'
  - 'apps/web/src/app/**/*.css'
---

# UI change verification (mandatory)

Any change that affects rendered UI is not done until it has been visually verified:

- Visual verification must be done via the **Playwright MCP** tools — do not use any other browser/automation tool for this.
- Apply the **UI UX Pro Max** skill when designing or reviewing the change.
- The dev server is already running — do not start it yourself.
- A UI task is only considered complete after the visual check via Playwright MCP has passed.

(For HeroUI v3 conventions and the Playwright MCP workflow, see `docs/architecture/frontend-ui.md`. Component/page detail lives in `apps/web/src/components/CLAUDE.md` and `apps/web/src/app/CLAUDE.md`.)
