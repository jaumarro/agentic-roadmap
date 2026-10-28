# Releasing

A GitHub release for a tag `vX.Y.Z` publishes that version to npm from the `Release` workflow, after the same checks
as CI. npm trusts that workflow by name, so no npm token is kept anywhere, and the package carries provenance for the
commit it was built from.

## Each release

1. On `main`, with CI green, add the version's section at the top of `CHANGELOG.md` and commit it as
   `docs: changelog for X.Y.Z`.
2. Bump the version; this commits `package.json` and tags it:

   ```bash
   npm version patch   # or minor, as the changelog's first lines say
   ```

3. Push the commit and its tag:

   ```bash
   git push --follow-tags
   ```

4. Publish the release, with the changelog's section as its notes:

   ```bash
   gh release create "v$(node -p 'require("./package.json").version')" --notes "$(awk '/^## /{n++; next} n==1' CHANGELOG.md)"
   ```

   The workflow refuses a tag that does not match `package.json`.

## Which number

| Change                                                             | While 0.x | From 1.0 |
| ------------------------------------------------------------------ | --------- | -------- |
| a fix, nothing else changes                                        | patch     | patch    |
| a new command, flag or optional field                              | minor     | minor    |
| the YAML, a command or its `--json` output stops working as it did | minor     | major    |

## Once, before the first release from the workflow

0.1.0 is published by hand, as npm needs the package to exist first. Then, on npmjs.com, the package's Settings →
Trusted publishing → GitHub Actions: owner `jaumarro`, repository `agentic-roadmap`, workflow `release.yml`,
environment `npm`. From then on, releases need nothing but the steps above.
