# Knowledge Bank PDF drawer

Status: **Complete locally (2026-09-29)**

## Problem

Knowledge Bank used a centered dialog and sandboxed its browser-native PDF
iframe. The equivalent academy viewer did not sandbox the iframe. Some native
PDF viewers fail inside that sandbox, leaving eligible users with a blank
preview.

## Outcome

- Removed iframe sandbox so browser-native PDF rendering can run.
- Replaced centered dialog with existing Selia drawer composition.
- Preview opens from bottom below `sm` and from right at `sm` and above.
- Preserved protected proxy URL, access checks, CSP frame restriction, close
  action, and new-tab fallback.
- Updated architecture, API, module, and runbook documentation.

## Verification

- Web typecheck, formatter, targeted lint, React Doctor, and web build passed.
- Repository-wide lint remains blocked by unrelated working-tree code in
  `apps/server/src/seed/seed.ts` (`eventKey` is unused).
- Manual production smoke remains required for native PDF behavior across
  supported desktop and mobile browsers.
