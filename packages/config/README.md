# @cogito-app/config

Private workspace package that holds the shared TypeScript configuration for all Cogito packages and apps.

`tsconfig.base.json` is the single, strict base config referenced from every package's `tsconfig.json`: module resolution `bundler`, `verbatimModuleSyntax`, `strict` + `noUncheckedIndexedAccess` / `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`, and `"types": ["bun"]` (the project runs on Bun). The package has no runtime code — it is a config-only workspace dependency.
