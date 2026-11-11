# Kairo Code Rules

Applies to all code written for Kairo, AI-authored or human-authored.
A reviewer should not be able to tell a diff was AI-written, and should
not be able to tell which engineer wrote it either — one consistent
standard, no house style per contributor.

---

## 1. Comments

- Do not write comments that restate what the code does.
- Do not write a comment explaining what a function is for at the top
  of every function — the signature and name should do that.
- A comment is allowed only when it explains **why**, and the why is not
  recoverable from the code itself: a non-obvious constraint, a
  workaround for a specific bug or platform quirk, a deliberate
  trade-off that looks wrong at a glance.
- No comment banners, no `// ---- Section ----` dividers.
- If code needs a comment to be understood, rewrite the code (better
  names, smaller functions, extracted intermediate variables) instead
  of adding the comment.
- Doc comments (rustdoc `///`, JSDoc) are fine on public APIs that cross
  a module/crate/package boundary — not on internal/private items.

Bad:
```rust
// Loop through all files and check if they are stale
for file in files {
    // Check modification time
    if file.mtime < cutoff {
        stale.push(file); // mark as stale
    }
}
```

Good:
```rust
for file in files {
    if file.mtime < cutoff {
        stale.push(file);
    }
}
```

---

## 2. Keep code short and easy, not clever

- Prefer the straightforward version over the clever one. If a reader
  needs to pause and think, it's too clever for this codebase.
- Prefer names precise enough that a comment would be redundant.
- Match the idioms already used in the file/module — don't introduce a
  new pattern (builder, trait, macro, generic) for a single use site.
- No speculative abstraction: no config options, extension points, or
  generics for cases nothing in this repo needs yet.
- No defensive code for inputs that can't occur given the caller.
  Handle real failure modes (network, I/O, malformed remote data), not
  theoretical ones.
- A function should do one thing. If it needs a comment to separate
  "part 1" from "part 2", it should be two functions.
- Flatten early: return/continue on the failure/edge case first instead
  of nesting the happy path inside conditionals.

---

## 3. Language standards

Kairo currently uses Rust and TypeScript. These rules apply to both.

### 3.1 Rust

- `rustfmt` must pass before a commit.
- `clippy` with `-D warnings` must pass clean before a commit where the
  project enables it.
- Clippy `pedantic` lints are advisory unless explicitly enabled.
- Follow standard Rust naming:
  - `snake_case` for functions, variables, modules, and fields
  - `CamelCase` for types and traits
  - `SCREAMING_SNAKE_CASE` for constants when appropriate
- Prefer `&str` / `&[T]` when ownership is not required.
- Prefer iterators when they improve readability.
- Do not use `unsafe` without an explicit reason.
- Every `unsafe` block must have a nearby comment explaining the safety
  invariant that makes it valid.
- Keep unsafe code isolated behind small, reviewed interfaces.
- Prefer RAII/ownership through Rust's type system rather than manual lifetime
  management.

### 3.1.1 No `unwrap()` / `expect()` in real code paths

- `.unwrap()`, `.expect()`, and `panic!()` are not allowed in code handling
  real external input such as filesystem, network, protocol, PTY, or user
  input.
- They are allowed in tests when failure means the test itself is invalid.
- Startup invariants may use `.expect("...")` when the failure genuinely means
  the process cannot run, but the message must describe the broken invariant.
- Do not use `unwrap()` merely to silence the borrow checker or make code
  shorter.

### 3.1.2 Rust errors and fallbacks

- Fallible operations should return `Result` or `Option` appropriately.
- Do not silently discard meaningful errors with `.ok()` or `let _ = ...`.
- Use typed errors when callers need to distinguish failure modes.
- Use `anyhow` or equivalent only at application boundaries when the exact
  error type no longer needs to be inspected.
- Do not collapse distinct failures into one generic error.
- Network, filesystem, process, and remote operations need deliberate
  timeout/recovery behavior where they can otherwise block indefinitely.
- `?` is preferred for straightforward error propagation.

### 3.2 TypeScript

- Use TypeScript rather than plain JavaScript for new application code.
- Use the project's configured formatter and linter. Do not create a second
  formatting standard inside a package.
- Follow consistent TypeScript naming:
  - `camelCase` for variables, functions, methods, and properties
  - `PascalCase` for classes, interfaces, types, enums, and decorators
  - `UPPER_SNAKE_CASE` only for true constants where it improves clarity
- Prefer explicit types at public/module boundaries.
- Let TypeScript infer obvious local types.
- Do not add type annotations everywhere just to make code look typed.
- Avoid `any`. Use a real type, `unknown`, or a narrow union instead.
- Narrow `unknown` before using it.
- Prefer discriminated unions over loose objects with many optional fields.
- Prefer `readonly` where mutation is not intended.
- Do not mutate global objects, built-in prototypes, or third-party objects.
- Do not use `eval()` or the `Function` constructor.
- Do not introduce non-standard platform APIs without an explicit project reason.
- Avoid unnecessary type assertions (`as`) when proper typing can express the
  invariant.
- Do not use `!` non-null assertions to silence a type error unless the
  invariant is genuinely guaranteed and obvious from the surrounding code.
- Prefer small modules with clear responsibilities.
- Avoid giant service classes and generic `utils.ts` files that become
  dumping grounds.

### 3.2.1 TypeScript imports

Imports always stay at the top of the file.

Use the project's configured import ordering. If no local convention exists:

1. Node/built-in modules
2. external packages
3. internal aliases
4. relative imports

Keep one blank line between groups.

Do not rely on transitive imports.

Do not leave unused imports.

Prefer named imports when they make the dependency clear.

Do not add imports dynamically unless the runtime behavior actually requires it.

### 3.2.2 Async TypeScript

- Handle rejected promises.
- Do not create floating promises unless the operation is deliberately
  fire-and-forget and the error path is handled.
- Do not use `async` on a function that never awaits anything unless there is a
  concrete API reason.
- Do not block the event loop with synchronous filesystem, CPU-heavy, or
  intentionally long-running operations in request/UI paths.
- Use timeouts for network or remote operations that could otherwise wait
  forever.
- Do not add retry loops without a clear termination/backoff policy.

### 3.3 Shared Rust/TypeScript rules

The language may change, but the engineering standard does not.

- Keep modules small.
- Keep functions focused.
- Prefer explicit control flow.
- Avoid speculative abstractions.
- Do not create a generic framework for one use case.
- Reuse existing project patterns.
- Keep public APIs small.
- Preserve error information.
- Do not hide failures.
- Do not add dependencies casually.
- Do not make code longer merely to appear more robust.
- Do not use a different coding style because the code was written by AI.

---

## 3.4 Imports are always first

This is a hard rule for every language used by Kairo.

Imports/includes belong at the top of the source file.

Do not put imports halfway through implementation code.

Do not use an import to work around a badly structured module. Fix the module
boundary instead.

---

## 3.5 Search before adding a dependency or API

Before introducing a new library, framework, API, or architectural pattern:

1. Search the repository.
2. Check existing dependencies.
3. Check the official documentation.
4. Check maintenance/status.
5. Check licensing.
6. Check whether the project already solves the same problem.

If the choice materially changes architecture or dependency footprint, tell the
user before implementing it.

## 4. Commits

One commit is one coherent change, not one task-dump.

- If a task touches the protocol schema, the Agent handler, and the
  client, and each part is independently reviewable, that's 3 commits,
  not 1.
- Don't bundle formatting/renames with behavior changes — separate
  commit.
- Don't bundle unrelated fixes noticed along the way — separate commit,
  or a separate PR if unrelated to the task.
- Each commit should leave the tree in a working state (compiles, tests
  relevant to it pass) where practical.

### 4.1 Commit messages

- Imperative mood, lowercase, no trailing period:
  `add resync after watcher event loss`, not `Added resync logic.`
- Say what changed and, only if it isn't obvious from the diff, why.
- No AI-generated boilerplate: avoid `This commit implements...`,
  avoid restating the whole task description, avoid bullet-listing
  every file touched.
- Short first line (~50 chars). A body is only needed when the why
  isn't obvious from the diff — a real trade-off, a workaround, a
  decision an ADR doesn't already cover.
- No emoji, no issue-tracker-style prefixes unless the rest of the repo
  already uses them consistently.

Bad:
```
feat: implement filesystem watcher with revision tracking, cache
invalidation, and conflict detection for Phase 08

This commit adds the complete filesystem sync implementation including:
- Revision tracking for local and remote files
- Cache invalidation on write
- Conflict detection when local/remote revisions diverge
- Watcher recovery via rescan
```

Good, split into what it actually is:
```
track file revisions on read/write
invalidate cache entries on remote write event
detect conflict when local and remote revisions diverge
rescan directory on watcher gap detection
```

### 4.2 Size

- Prefer the smallest diff that does one real thing.
- Large mechanical changes (codegen output, formatting-wide passes,
  dependency bumps) get their own commit, clearly labeled mechanical,
  never mixed with logic changes.

---

## 5. AI workflow and research rules

These rules are mandatory for AI agents modifying Kairo.

### 5.1 Inspect before editing

Before writing code:

1. Read the relevant files.
2. Search the repository for existing implementations.
3. Read nearby tests.
4. Check the package/module boundaries.
5. Check existing dependencies and tooling.
6. Understand the current error-handling and naming conventions.

Do not implement from a filename or a short prompt alone.

### 5.2 Research before making uncertain claims

If correctness depends on external behavior, search before coding.

Examples:

- Rust behavior or library APIs
- TypeScript/ECMAScript behavior
- Node.js APIs
- browser APIs
- operating-system behavior
- protocol specifications
- third-party library behavior
- security behavior
- platform limitations
- current dependency APIs
- licensing

Prefer official documentation and primary sources.

If research finds an important fact that changes the implementation, say so
before making the change:

```text
Found:
<what the source says>

Impact:
<what this means for Kairo>

Plan:
<what will be changed>
```

Do not silently make a significant architectural decision from an
unverified assumption.

### 5.3 Do not research trivial local code

Do not browse the internet to answer something that can be determined by
reading the existing repository.

External research is for facts outside the repository or facts where current
documentation matters.

### 5.4 Smallest correct change

When fixing or adding something:

- change only what is required
- preserve unrelated behavior
- do not rewrite the entire file
- do not refactor unrelated code
- do not rename unrelated symbols
- do not add speculative features
- do not introduce abstractions just because they look cleaner

If a small patch solves the problem, use the small patch.

### 5.5 Never fake completion

AI must not:

- leave required behavior as a placeholder
- add `TODO` instead of implementing requested behavior
- return fake success
- swallow errors to make a test pass
- disable a lint or compiler check to make the build pass
- modify tests only to hide a broken implementation
- claim something works without verification

If something cannot be completed, state exactly what is blocking it.

### 5.6 Verify before finishing

After a meaningful change:

```text
build
test
format
lint/static checks
inspect diff
```

Then check the diff for:

- unnecessary code
- unused imports
- duplicated logic
- unrelated changes
- debug code
- temporary files
- accidental API changes
- unnecessary dependencies

Remove anything that does not belong.

### 5.7 AI code must look like normal project code

Do not generate:

- giant files
- giant functions
- repetitive boilerplate
- excessive comments
- generic "manager/helper/service" classes
- unnecessary interfaces
- excessive defensive checks
- complex one-liners
- fake enterprise architecture
- verbose commit descriptions
- obvious AI phrasing

The goal is code a human engineer would naturally maintain.

---

## 5.8 Documentation and source accuracy

When documenting a technical behavior, distinguish between:

- verified behavior
- project assumptions
- implementation decisions
- external documentation
- experimental findings

Do not present an assumption as a fact.

For platform behavior, prefer a link to the authoritative source in the
relevant documentation when practical.

## 5. What this is not

This is not a license for fewer tests, less error handling, or skipping
steps in `ai-workflow.md`. Verification, documentation updates, and the
`definition-of-done.md` checklist still apply in full — this file only
governs how the resulting code, error handling, and commits look.