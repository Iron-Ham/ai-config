# Production coding model-evaluation evidence

This directory contains only privacy-safe aggregates used by the production coding model-evaluation report.
Historical OpenCode aggregates and current OMP aggregates remain versioned separately; do not pool protocols without an explicit comparison.

## Operator workflow

- `run-omp-benchmark/SKILL.md` is the no-context workflow for designing, running, recovering, judging, scoring, and publishing a production-shaped OMP benchmark. Its references define the strict treatment, artifact contract, resource gates, and public/private publishing boundary.

## Published evidence

- `omp-strict-k3-opus-confirmation-2026-07-28.json` records the strict Advisor-disabled K3/Opus confirmation, provider-normalized timing, censored-route treatment, and matched value metrics.
- `omp-strict-glm-sol-confirmation-2026-07-28.json` records the strict Advisor-disabled native-editor GLM/Sol comparison and source-reconciled route decision.
- `production-confirmation.json` compares controller completion, boundary compliance, quality, latency, and cost on two production-shaped source-analysis workloads.
- `planning-evaluation.json` records the repeated production-shaped planning comparison.
- `production-coding-cohorts.json` records privacy-safe backend, frontend, mixed, tooling, IaC, final ten-route iOS, and Android implementation outcomes, plus a seven-workload default-candidate aggregate. Validation and compliance remain separate from blind quality.
- `expanded-production-reference-calibration.json` records the privacy-safe 10/10 effective reference-calibration gate for the expanded workload definitions. Every definition now has at least one strict candidate artifact or provider-censored attempt.
- `omp-production-candidate-cohort-2026-07-27.json` records the current privacy-safe OMP production cohort, including anonymous judge panels, validation and compliance, cost, model-session time, role-scoped retention decisions, and the same-range rule.
- `small-model-utility.json` records the repeated session-title and project-copy-name utility comparison.
- `exact-file-reader.json` records preliminary isolated exact-file reader calibration.
- `reader-startup-crossover.json` records the preliminary full-config reader startup crossover.
- `pricing-frontier-sample.json` records the matched GPT-5.5 xhigh and Sol high pricing sample.
- `open-weight-provider-frontier.json` records the Fireworks/Baseten route catalog, cost and timing evidence boundary, role decisions, and matched evaluation protocol.
- `matched-switch-gate-final.json` records the final repeated Terra-versus-Sol gate. Its frozen judge-packet provenance is mixed: native editor uses schema v1, while native offline/data and modern client use schema v2. Historical judge outputs were not silently regenerated after the harness changed; final source reconciliation and scoring use the retained outputs under a common decision process, and future matched runs use schema v2.

The HTML report labels within-experiment findings, task-class transfer, policy choices, and unmeasured questions separately. Results from one protocol are not treated as results from another.

## Private evaluation boundary

Production source, repository and product identity, paths, symbols, commit and snapshot identifiers, prompts, rubrics, raw answers, grader keys, grader identity, session IDs, and run fingerprints are not published. Public workloads use generic labels only.

Raw runs live outside the repository in private directories. The runner:

- requires a clean frozen worktree;
- denies edits, shell, network, and advisor access to planning and source-analysis controllers;
- validates that tool paths stay inside the worktree;
- removes controller step and model wall-clock ceilings for production-shaped candidate work; a resource watchdog records progress and intervenes only for terminal provider failures, unsafe machine pressure, or a genuinely stalled process rather than elapsed time alone;
- records stage completion and incomplete-cost lower bounds;
- pins trusted provider/model metadata and rejects route identity mismatches while replacing permissions, agents, MCP access, and instructions with the locked benchmark boundary;
- recomputes known OpenAI, Anthropic, Fireworks, and Baseten costs from observed usage;
- records launcher startup, time to first observed action, time to first text, model-session duration, and per-step decision latency without mislabeling those event-derived metrics as vendor TTFT;
- binds configuration, model catalogs, repository state, runner source, seed, execution order, session, and transcript hashes into artifact fingerprints;
- revalidates reused raw event logs and text before reuse; and
- emits anonymous grading packets for every nonempty candidate artifact, including failed or timed-out work, while keeping completion, validation, and compliance visible as separate outcomes.

`scripts/benchmark-omp-model-pairs.mjs` runs the production planning and source-analysis protocols and retains support for reproducing the archived reviewer evidence. `scripts/summarize-blind-grades.mjs` joins independent blind grades to private answer keys without publishing those keys.

The open-weight provider study treats `(model, provider, serving path, reasoning setting)` as the route. Fireworks Standard, Fireworks Fast, and Baseten must use exact pinned IDs and a contemporaneous Terra reference. Candidate routes receive three representative production-shaped trials before a role-scoped promotion decision. Same-range quality is a retention condition: a challenger cannot be cut from a role when its mean is within five points of the champion or its per-trial judge-score distribution overlaps the champion's, provided deterministic and source-reconciled evidence supports the same handoff band. Cost and latency rank retained routes; they do not eliminate them. Planning and bounded-reader roles require separate repeated protocols. Small-model utility results apply only to the exact output contract tested. Luna low for project-copy names and Kimi K2.7 Code through Baseten for session titles are measured recommendations, not installed defaults.

## Archived historical evidence

- `automatic-advisor-causal.json` records the completed causal pilot.
- `advisor-model-comparison.json` records the completed reviewer-model proxy.

Advisor evaluation is closed. These files remain for audit and reproducibility; neither supports automatic advisor routing or an active follow-up study.

No authenticated Fireworks outcome is published in this snapshot because the evaluation environment did not expose a Fireworks credential. The installed provider catalog and commands were resolved successfully, but availability is not reported as quality or latency evidence. Fireworks Fast's vendor throughput claims remain contextual until end-to-end OMP measurements justify its 1.5× GLM or 2× Kimi list-price premium.

These evaluations inform cost-aware defaults for high-stakes production work, with iOS weighted heavily because it is the primary workload. They do not establish a universal model ranking, and they do not replace edit, build, simulator, CI, rollout, or production verification.
