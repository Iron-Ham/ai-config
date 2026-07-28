# OMP production benchmark protocol

## Contents

1. Treatment boundary
2. Route contracts
3. Workload manifest
4. Artifact contract
5. Timing, cost, and value
6. Resource gates
7. Promotion and censoring

## Treatment boundary

A result measures:

`provider/model + serving path + effort + launcher + system/tool surface + frozen workload + harness version`

Do not pool results across OpenCode and OMP, across providers, or across Advisor-on and Advisor-disabled treatments without an explicit sensitivity comparison.

Pure implementation runs must disable Advisor, global extensions, skills, rules, LSP, xdev, Auto QA, and undeclared discovery providers. Record the effective tool schemas and all observed tool executions. Unexpected tools or Advisor injection make the result exploratory.

## Route contracts

- **Default:** general implementation controller.
- **SMOL:** mechanical execution, drafts, and high-volume work.
- **SLOW:** premium implementation.
- **VISION:** image and visual verification.
- **Plan:** plan-mode model.
- **DESIGNER:** product, interaction, and visual design.
- **COMMIT:** commit and short-form repository utility.
- **Tiny:** absolute tiny changes.
- **Task:** design judgment and review of SMOL output.
- **Advisor:** OMP's advisor implementation.

Evidence transfers only to the contract tested.

## Workload manifest

Each production implementation task requires:

- stable slug and domain;
- pre-change reference SHA;
- observed merge SHA;
- reference change identifier stored privately;
- full behavior-oriented prompt;
- local instruction paths;
- candidate-native validation commands;
- hidden contract or tests and their hashes;
- rubric version;
- reference calibration that fails on base and passes on observed merge.

Do not expose observed diffs, hidden tests, post-merge files, or private symbol names to the candidate.

## Artifact contract

Retain at least:

```text
<study>/<workload>/<route>/
  benchmark-config.json
  model-catalog.json
  prompt.md
  omp-events.jsonl
  omp-stderr.txt
  patch.diff
  git-status.txt
  validation-*.stdout.txt
  validation-*.stderr.txt
  result.json
  provider-normalized-timing.json
  pricing-correction.json       # when needed
  source-reconciliation.json
  scoring.json
  judges/<judge>/{events.jsonl,metadata.json,verdict.json}
```

`result.json` must record route and catalog fingerprints, OMP version, prompt and patch hashes, frozen SHAs, process outcome, path-policy outcome, treatment isolation, raw usage, recomputed cost, model-session and wrapper time, first action/text, patch size, validation, and checkout attribution.

## Timing, cost, and value

Keep these fields distinct:

- `raw_model_session_seconds`: immutable event-derived model time.
- `rate_limit_normalized_seconds`: raw time minus recorded 429 response and retry-backoff time. Use this for the primary speed score.
- `provider_incident_normalized_seconds`: optional sensitivity that also removes recorded stream-stall and other provider-error waits.
- wrapper wall time, install, validation, judging, and cleanup: operational measurements, not model-session time.

Calculate metrics only inside an exact matched workload cohort:

```text
cost efficiency = 100 * cheapest eligible cost / route cost
speed efficiency = 100 * fastest eligible normalized time / route normalized time
Quality:Value = 100 * (mean quality / 100)^3 * cost efficiency / 100
weighted Q/C/speed = 60 * (mean quality / 100)^3
                   + 25 * cost efficiency / 100
                   + 15 * speed efficiency / 100
```

Higher is better; rank 1 is best. Validity and handoff gate the result before arithmetic. A zero-patch route cannot win because it was cheap or fast.

Recompute cost from observed usage and the pinned catalog. If catalog metadata was stale, preserve the raw result and attach a versioned correction containing the old rate, new rate, corrected cost, affected metrics, and reason.

## Resource gates

- Reserve at least 4 GiB disk and 4 GiB memory per implementation lane; reserve 1 GiB of each per blind judge, then adjust from observed RSS and checkout growth.
- Prefer at least 150 GiB free disk before ordinary launches. Use 100-150 GiB only for declared, fully reserved continuation with no install or unbudgeted lane. Start no new lane below 100 GiB.
- Require normal memory pressure, no new swap-out growth, and at least 20% memory available after reservations.
- Treat an OMP or controller process above 8 GiB RSS and still growing across two five-minute samples as suspect. Preserve evidence before terminating a confirmed runaway.
- Use `caffeinate -dimsu` for unattended macOS execution.
- Do not terminate a quiet route based only on elapsed time. Confirm provider errors, terminal events, dead children, or missing event progress.

## Promotion and censoring

Give a new route three representative production-shaped trials before broad expansion. Finish an already-running third trial, then record `continue` or `cut`.

Treat a route as in the champion's range when its mean is within five quality points or its judge-score distribution overlaps the eligible champion's, and deterministic/source evidence supports the same handoff band. A shared handoff label alone is insufficient.

Continue when the route is in range, wins quality materially, improves cost or speed without leaving the range, or covers a valuable capability the leaders miss. Cut after true reconciled Redrives or clear domination without a compensating capability or value boundary.

Classify provider-dominated incomplete routes as censored. Keep uncensored protocol no-deliveries as route-reliability evidence. Never convert provider instability into a semantic-quality score.
