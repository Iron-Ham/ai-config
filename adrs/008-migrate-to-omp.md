# ADR 008: Migrate from OpenCode to OMP

## Status

Accepted on 2026-07-26.

## Context

The developer reported these local operational reasons for leaving OpenCode:

- instability;
- poor out-of-box tool performance;
- lack of PTY support; and
- inefficient compaction.

These are observed local reasons for this decision, not independently verified
comparative claims about either product. No local measurements are asserted by
this ADR.

OMP's upstream documentation describes a coding-agent surface with in-process
native tooling, an optional PTY for `bash`, LSP and DAP operations, model roles,
hash-anchored edits, and first-class subagents ([README](https://github.com/can1357/oh-my-pi/blob/main/README.md)). Its runtime also documents environment
resolution and precedence, including project and user `.env` locations and the
`OMP_*` to `PI_*` compatibility mirroring ([environment variables](https://github.com/can1357/oh-my-pi/blob/main/docs/environment-variables.md)).

The upstream README includes benchmark and capability claims. Those claims are
useful for identifying documented facilities, but are not local acceptance
evidence and are not treated as proof that OMP is faster, more reliable, or
more capable here.

## Decision

Migrate the managed coding-agent runtime from OpenCode to OMP. Use OMP as the
supported execution surface for new and migrated work; do not preserve an
OpenCode compatibility lane or parallel routing path as part of this decision.

### Retained OMP scope

Retain only the OMP facilities needed for the coding-agent workflow:

- in-process native file/search/shell support rather than relying on external
  helper binaries;
- explicit PTY control for interactive shell work, including the documented
  `bash` PTY option and the `--no-pty`/`PI_NO_PTY` disable path;
- LSP for code intelligence and DAP for debugger control;
- model roles, including separate default, `smol`, `slow`, `plan`, and reviewer
  or `advisor` assignments where the workflow needs them;
- hash-anchored edits that reject stale anchors instead of silently applying a
  patch to changed content;
- first-class subagents through isolated task execution and structured results;
- OMP's documented compaction strategies: context-full summarization, handoff,
  and deterministic `snapcompact` archival (with other strategies enabled only
  when explicitly configured).

The `snapcompact` strategy is a local archival pass that does not call a model,
require an API key, or use the network. Upstream documents that it requires a
vision-capable current model and otherwise falls back to context-full
compaction with a warning ([compaction](https://github.com/can1357/oh-my-pi/blob/main/docs/compaction.md)). This behavior is a capability and a risk boundary, not a claim that local compaction quality has been established.

Environment migration must follow OMP's documented lookup order rather than
assuming OpenCode variables or precedence carry over: process environment,
project `.env`, agent `.env`, config-root `.env`, then home `.env`. Within each
parsed file, `OMP_*` keys are mirrored to `PI_*` keys. Secrets and values are
not recorded in this ADR.

## Rejected alternative

Remain on OpenCode and compensate with additional wrappers, PTY workarounds, or
custom compaction logic. This was rejected because it retains the locally
reported operational problems and creates a second tool-control surface. The
rejection does not assert that OpenCode is inferior in general; it records the
local decision under the observations above.

## Consequences and risks

Positive consequences are one runtime for the retained OMP tool surface,
explicit PTY behavior, IDE-style code and debugger integration, stale-anchor
rejection, delegated work, and selectable compaction behavior.

Risks include OMP version churn, provider/model differences, environment and
configuration precedence mistakes during migration, PTY behavior varying by
platform or command, subagent resource and isolation costs, and information
loss or model-compatibility constraints at compaction boundaries. In
particular, `snapcompact`'s vision requirement and fallback must remain visible
to operators. Upstream benchmark results and the README's marketing examples
must not be used to hide or waive these risks.

## Verification

Local acceptance uses reproducible benchmark protocols and behavior-focused
tests, not upstream benchmark numbers. The protocol must hold task corpus,
repository state, model/provider route, machine, and timeout policy constant;
record raw tool success, retries, latency, PTY outcomes, and compaction
outcomes; and keep the OpenCode comparison (if run) explicitly labeled as local
and versioned.

Behavior tests must cover the retained contract: in-process tools; PTY and
`--no-pty` paths; representative LSP and DAP operations; model-role routing;
stale hash-anchor rejection; subagent isolation and result handling; each
selected compaction strategy, including `snapcompact` persistence and its
non-vision fallback; and OMP environment precedence without exposing secret
values. Passing these tests is required before treating the migration as
accepted in operation.

## Rollback

Rollback is an explicit developer-controlled recovery action, not a retained
repository asset or supported concurrent lane. Before clean removal, the
developer may place the required pinned OpenCode installer, configuration, and
environment mapping in an external backup under their control. That backup is
not part of this repository or the active compatibility contract.

If local acceptance fails, stop using OMP and use the external backup to
reinstall the pinned OpenCode runtime and restore its routing as a recovery
action. Record the failed OMP version and observed failure so a later retry can
be evaluated independently. A rollback changes the active runtime; it does not
restore a supported OpenCode lane, establish concurrent compatibility, or turn
upstream claims into local evidence. If no external backup exists, this ADR
does not provide an in-repository OpenCode recovery path.

## Sources

- [OMP README](https://github.com/can1357/oh-my-pi/blob/main/README.md)
- [Compaction and branch summaries](https://github.com/can1357/oh-my-pi/blob/main/docs/compaction.md)
- [Environment variables](https://github.com/can1357/oh-my-pi/blob/main/docs/environment-variables.md)
