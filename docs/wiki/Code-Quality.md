# Code quality

How code is linted and formatted with the Oxc toolchain: the configuration, the rule choices and
the NestJS-specific exceptions, editor setup, and how to fix what the tools report. Read this when
a lint error surprises you or before changing a rule.

## Tools

- **oxlint** with **oxlint-tsgolint** (type-aware rules), configured in one root
  [`.oxlintrc.json`]({{repo}}/blob/main/.oxlintrc.json).
- **oxfmt**, configured in one root [`.oxfmtrc.json`]({{repo}}/blob/main/.oxfmtrc.json), pinned to
  an exact version because it is still 0.x.
- **TypeScript 6** (`tsc --noEmit` per package) stays the source of truth for type errors;
  oxlint's own type checking is off. The type-aware linter runs on TypeScript 7, so no tsconfig
  option deprecated in TypeScript 6 may be used.

No ESLint, Prettier or typescript-eslint anywhere. The choice is recorded in
[Architecture decisions](Architecture-Decisions#oxc-instead-of-eslint-prettier-and-biome).

## Lint rules

Plugins: typescript, unicorn, oxc, import, promise, node. Categories: `correctness` errors,
`suspicious` warnings. Always errors:

| Rule                              | Why                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript/no-floating-promises` | An unawaited promise loses its errors.                                                                                                  |
| `typescript/no-misused-promises`  | A promise passed where a callback's result is ignored; promise-returning JSX attributes (react-hook-form's `handleSubmit`) are allowed. |
| `typescript/await-thenable`       | Awaiting something that isn't a promise is a bug.                                                                                       |
| `import/no-cycle`                 | Cycles break module initialization and hide design problems.                                                                            |

Overrides:

| Files                       | Change                                                                     | Why                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/**`               | `typescript/consistent-type-imports` **off**                               | Nest's dependency injection reads constructor parameter types from emitted decorator metadata; rewriting an injected class to `import type` erases it and breaks injection at runtime. |
| `apps/api/**`               | `typescript/no-extraneous-class` allows decorated classes                  | Nest modules are empty decorated classes.                                                                                                                                              |
| `apps/api/**`               | `no-console` error                                                         | Use Nest's `Logger` (structured, JSON in production). Only `packages/db/src/migrate.ts` may print.                                                                                     |
| `apps/web/**`               | react (with `rules-of-hooks`, `exhaustive-deps`), jsx-a11y, nextjs plugins | Hooks correctness, accessibility, Next.js pitfalls.                                                                                                                                    |
| `apps/web/components/ui/**` | `no-unsafe-type-assertion` off                                             | Generated shadcn/ui code stays as generated.                                                                                                                                           |
| tests                       | vitest plugin                                                              | Test-specific rules (no conditional expects, typed mocks…).                                                                                                                            |
| everywhere                  | side-effect imports allowed for `*.css` and `server-only`                  | Global styles and the server-only guard are imported for their effect.                                                                                                                 |

Ignored: `dist`, `.next`, `coverage`, `packages/db/drizzle` and `next-env.d.ts`.

Type-aware rules need the shared packages' type declarations; `pnpm lint` builds them first (see
[Troubleshooting](Troubleshooting#lint-fails-with-x-is-an-error-type-that-acts-as-any)).

## Formatting

Print width 100, single quotes, trailing commas everywhere. Imports are sorted into groups (type
imports, builtins and externals, internal `@repo/` and `@/` imports, relative imports), and Tailwind
classes are sorted in `className`, `cn()`, `clsx()` and `cva()`. Markdown, JSON and YAML are
formatted too, including this wiki. Build output, migrations and `pnpm-lock.yaml` are excluded.

## Editor setup

VS Code recommends the **Oxc** extension (`oxc.oxc-vscode`) and marks the ESLint, Prettier and
Biome extensions unwanted. The workspace settings make Oxc the default formatter, format on save,
apply oxlint's safe fixes on save, and use the workspace TypeScript. Accept the extension
recommendation when VS Code offers it.

## Fixing issues

```sh
pnpm format          # rewrite formatting
pnpm lint:fix        # apply safe lint fixes
pnpm lint            # what's left
```

The pre-commit hook does the first two on staged files. Prefer fixing over suppressing; when a
suppression is right, scope it to one line and say why:

```ts
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- partial test double
```

Changing a rule is a `build:` commit that explains the trade-off; update this page with it.
