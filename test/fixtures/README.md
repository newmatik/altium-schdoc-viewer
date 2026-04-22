# Test fixtures

`.SchDoc`, `.SchDot`, and `.PrjPcb` files are **not tracked** in this repo — they're
gitignored to prevent accidentally publishing customer-proprietary content. Tests that
need a real Altium binary fixture skip themselves (`describe.skipIf(!hasFixture)`) when
the file is absent, so the suite passes in CI and on public forks.

## Running the full test suite locally

If you have legitimate access to a real `.SchDoc`, drop it in this folder as
`AFE-Eval_Schematics_B.SchDoc` and the fixture-dependent tests will run. The file must:

- not be tracked (the `.gitignore` at the repo root blocks it)
- remain outside any backup / sync tool that uploads to a public location

## Contributing a public-domain fixture

If you can produce a small `.SchDoc` from open-licensed artwork (e.g. a KiCad demo
re-exported via Altium, or an OSHWA-licensed board), that would let CI exercise the real
record path. Check the license, document provenance in this file, and open a PR.

Until then, the unit tests in `test/bom.test.ts` that don't depend on a real fixture
(`compressDesignatorRange`) are the safety net.
