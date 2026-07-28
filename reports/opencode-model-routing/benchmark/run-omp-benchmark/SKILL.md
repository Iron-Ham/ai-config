---
name: run-omp-benchmark
description: Run, resume, grade, audit, and publish production-shaped OMP model benchmarks through `notion local pi`. Use when adding a model, provider, or effort route; reconstructing a merged production change at its pre-merge SHA; comparing Default or SLOW implementers; recovering an interrupted run; judging and source-reconciling patches; normalizing provider incidents and pricing; updating public and private benchmark evidence; or checking whether a routing conclusion is supported by the retained data.
---

# Run an OMP benchmark

Execute the complete benchmark lifecycle without relying on prior session context. Treat the route, provider, serving path, effort, launcher, tool surface, and frozen workload as one experimental treatment.

## Choose the workflow

- **Production implementation:** use the private, checksum-verified production harness supplied by the operator. Read [references/protocol.md](references/protocol.md) completely.
- **Planning or source analysis:** use the repository's `scripts/benchmark-omp-model-pairs.mjs`. Read only the applicable role section in [references/protocol.md](references/protocol.md).
- **Resume or grade an existing run:** preserve raw artifacts, inspect the run's recorded protocol, and resume from the first missing lifecycle stage. Never rerun a paid candidate merely because finalization failed.
- **Publish or audit results:** read [references/publishing.md](references/publishing.md) completely before changing any report, ledger, database view, HTML artifact, or public aggregate.

Do not transfer implementation findings to SMOL, VISION, Plan, DESIGNER, COMMIT, Tiny, Task, or Advisor. Benchmark those contracts separately.

## Establish the study contract

Require these inputs before a paid call:

1. Exact candidate routes: provider/model selector, serving path, reasoning or effort setting, and launcher.
2. Frozen workload: full prompt, pre-merge reference SHA, observed merge SHA, reference change, rubric version, and deterministic validation recipe.
3. Declared cohort: matched controls, workload set, three-trial promotion gate, same-range rule, and stop conditions.
4. Private output and worktree roots outside every repository.
5. Resource policy: disk and memory reservations, concurrency ceiling, sleep prevention, and progress monitoring.
6. Publishing targets: private evidence store and privacy-safe public aggregate, if applicable.

If any item is missing, perform read-only discovery or calibration. Do not improvise a paid treatment.

## Preflight

1. Read repository instructions for the source checkout and every task area the candidate may edit.
2. Verify the source checkout contains both frozen SHAs and is clean.
3. Prepare dependencies once in the shared checkout. For `notion-next`, select pnpm in `.devex.config.yaml`, run `CI=1 notion install` without a short timeout, and start required local services before candidate isolation.
4. Query `notion local pi models --json`. Record the exact route, supported effort levels, limits, prices, and catalog fingerprint. Availability is not performance evidence.
5. Run the retained runtime tests from the `claude-config` root:

```bash
bun scripts/test-omp-benchmark-runtime.mjs
bun scripts/test-omp-benchmark-pricing.mjs
bun scripts/test-benchmark-omp-context-tools.mjs
bun scripts/test-benchmark-output-containment.mjs
```

6. Run the production harness self-check when using the private harness. It must cover path containment, tracked and untracked patch capture, streamed output, validation attribution, treatment isolation, and artifact hashing.
7. Check current disk, memory pressure, swap growth, active benchmark processes, and sleep assertions. Do not launch against assumed machine capacity.

Stop if route identity, catalog metadata, calibration, treatment isolation, or the resource gate is unresolved.

## Calibrate the workload

1. Reconstruct the pre-change checkout at the reference SHA.
2. Apply only the hidden checks or contract extracted from the observed merge.
3. Require the intended failure on the pre-change base and success on the observed merge.
4. Inspect both logs. Missing dependencies, sandbox denials, timeouts, stale generated files, and wrong-checkout test execution are harness failures.
5. Prefer observable behavior over historical symbol names. When a frozen contract is exactness-oriented, declare candidate-native validation and source reconciliation before candidate execution.
6. Record calibration paths and hashes in the trial entry.

Do not call an uncalibrated task production-shaped.

## Launch candidates

Use `notion local pi`, not bare `omp`, OpenCode, or direct provider APIs. Never copy managed credentials into configuration or artifacts.

For pure implementer evidence:

- disable Advisor, extensions, skills, rules, LSP, xdev, Auto QA, and undeclared discovery providers;
- use the same minimal built-in tool surface for every matched route;
- record allowed, observed, and unexpected tools plus Advisor and xdev activity;
- give each candidate its own worktree, output root, OMP state, launcher root, and resource reservation;
- stream stdout and stderr to files so controller memory does not grow with transcript size;
- forbid whole-repository typecheck when the repository delegates it to CI;
- impose no model wall-clock or step timeout. Hours or days are measurements, not automatic failures.

Parallelize to the shared resource gate, not a hardcoded provider count. Serialize only operations that empirically conflict, such as worktree creation or launcher package initialization.

## Monitor and recover

At least every 15 minutes during unattended work:

- verify event-log growth, provider counters, child-process activity, or output timestamps;
- sample free disk, RSS, memory pressure, swap, and sleep assertions;
- admit replacement work immediately when a reserved slot completes;
- distinguish quiet inference from a terminal provider or process failure.

Preserve `omp-events.jsonl`, patch, status, and logs before cleanup. If the model completed but validation or finalization failed, use retained recovery tooling to rebuild `result.json` without another model call. Attribute startup races, checkout failures, wrong-checkout tests, catalog mismatches, and provider-dominated incomplete runs to infrastructure rather than model quality.

## Validate, judge, and reconcile

1. Capture tracked changes and candidate-created untracked regular files in the patch.
2. Run candidate-native validation before hidden overlays, then the frozen contract. Preserve both.
3. Run three independent blind judges with the same rubric. Do not time out judges.
4. Keep raw verdicts separate from source reconciliation.
5. Verify material judge claims against the patch, source, and deterministic evidence.
6. Assign exactly one handoff:
   - **Carry:** no known substantive repair.
   - **Carry with repair:** preserve the work after localized substantive repair.
   - **Redrive:** restarting is safer or cheaper.
7. Keep compliance, completion, validation, quality, and handoff as separate fields. An invalid or noncompliant artifact may retain scores but cannot win promotion.

## Calculate comparable metrics

Use only exact matched cohorts. Apply the formulas and timing rules in [references/protocol.md](references/protocol.md). Recompute every affected score and rank when a route or price changes.

- Preserve raw model-session time.
- Remove exact 429 response and retry-backoff time for the primary speed metric.
- Keep stream-stall and other provider-error normalization as a separate sensitivity.
- Censor provider-dominated incomplete routes instead of extrapolating a competitive result.
- Write pricing changes to a versioned correction artifact; never mutate raw result evidence.

## Decide and publish

After each route's third reconciled trial, record `continue` or `cut`. Do not cut a challenger whose role-relevant quality remains in the champion's range unless it has clearly failed the declared validity or handoff gate. Cost and latency rank same-range candidates; they do not erase them.

Follow [references/publishing.md](references/publishing.md). Update the private ledger and report first, then derive the privacy-safe public aggregate. Lead with actionable route recommendations, state evidence class and limitations, and keep report arithmetic traceable to attached machine-readable artifacts.

## Completion gate

Do not declare the study complete until:

- every declared lane is final, censored, or explicitly cut;
- calibration, candidate-native validation, blind panels, and source reconciliation are attached;
- cost, timing, ranks, and corrections reproduce from raw evidence;
- private report, cohort summary, runbook, ledger views, and public aggregate agree;
- the final HTML is readable in light and dark modes and contains no local-file links;
- the portable harness archive passes its tests, self-check, checksum verification, and privacy scan;
- temporary processes and disposable worktrees are cleaned without deleting retained evidence.
