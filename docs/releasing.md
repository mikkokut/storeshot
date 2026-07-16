# Releasing StoreShot

StoreShot uses [Release Please](https://github.com/googleapis/release-please) to
manage versions, `CHANGELOG.md`, Git tags, and GitHub Releases. The same GitHub
Actions workflow publishes completed releases to npm through trusted publishing
(OIDC), so the repository does not need an `NPM_TOKEN` secret.

## One-time GitHub setup

1. Open the repository on GitHub and go to **Settings → Actions → General**.
2. Under **Workflow permissions**, keep the default permission set to
   **Read repository contents and packages permissions**. The release workflow
   declares only the additional permissions it needs.
3. Enable **Allow GitHub Actions to create and approve pull requests** so
   Release Please can maintain its release pull request.
4. Save the settings.
5. In the npm settings for `storeshot`, keep this trusted publisher:

   - Provider: GitHub Actions
   - Organization or user: `mikkokut`
   - Repository: `storeshot`
   - Workflow filename: `publish.yml`
   - Environment: empty
   - Allowed action: `npm publish`

The npm values are case-sensitive. Enter only `publish.yml`, not the full
`.github/workflows/publish.yml` path.

## Write release-aware commits

Release Please derives changelog entries and semantic-version changes from
[Conventional Commit](https://www.conventionalcommits.org/) messages. Use a
release-relevant prefix when a change reaches `main`:

| Commit | Result | Example |
| --- | --- | --- |
| `fix:` | Patch release | `fix: reject paths outside the project` |
| `feat:` | Minor release | `feat: add Android screenshot sets` |
| `feat!:` or a `BREAKING CHANGE:` footer | Breaking release | `feat!: replace the project schema` |
| `docs:`, `test:`, `ci:`, `chore:`, `refactor:` | Normally no release | `docs: explain custom mockups` |

While StoreShot is below `1.0.0`, breaking changes bump the minor version rather
than jumping to `1.0.0`. The release PR remains the final place to review and
adjust the proposed version.

Prefer squash-merging pull requests and make the squash commit or PR title a
clear Conventional Commit. This gives the generated changelog one useful entry
per user-facing change.

## Normal release workflow

1. Merge normal feature and fix work into `main`. Do not manually edit the
   released sections of `CHANGELOG.md` or run `npm version`.
2. The **Release and publish** workflow creates or updates a release pull
   request. It contains the proposed version changes to `package.json` and
   `package-lock.json`, plus the generated `CHANGELOG.md` entry.
3. Continue merging work normally. Release Please keeps the same release pull
   request up to date.
4. When ready to publish, review the release pull request:

   - Confirm the proposed version is appropriate.
   - Edit generated wording if a changelog entry needs clarification.
   - Confirm required CI checks pass.

5. Merge the release pull request. The workflow then creates the matching
   `vX.Y.Z` tag and GitHub Release, runs the full validation gate, previews the
   npm package, and publishes it to npm.
6. Confirm the **Release and publish** workflow succeeded, then verify:

   ```bash
   npm view storeshot version
   npm install --global storeshot@<version>
   storeshot --version
   ```

After the first automated publish succeeds, remove obsolete npm automation
tokens and disallow token-based publishing in the npm package settings when
that option is available.

## Choosing or correcting a version

The normal version is calculated from the commits accumulated in the release
pull request. To request an exact next version, add a `Release-As` footer to a
commit on `main`:

```text
chore: prepare 1.0 release

Release-As: 1.0.0
```

Release Please will update the release pull request to that version. Use this
sparingly; ordinary `fix:`, `feat:`, and breaking-change commits should drive
most releases.

If generated release notes are unclear, edit the changelog in the release pull
request before merging it. Avoid rewriting release tags or changing a version
after it has been published to npm.

## If publishing fails

- If validation fails, fix the problem on `main`. Release Please will update the
  open release pull request, or the failed workflow can be rerun after a
  transient infrastructure error.
- If npm reports an authentication error, confirm that trusted publishing uses
  `mikkokut/storeshot`, the exact filename `publish.yml`, no environment, and
  that the workflow has `id-token: write` permission.
- If Release Please cannot create a pull request, check the repository's GitHub
  Actions workflow permissions described above.
- If npm already contains the version, the workflow exits without trying to
  overwrite it. npm package name/version pairs cannot be reused.
- Never add an npm write token to the repository or workflow. Trusted publishing
  is the normal publication path.
