# Releasing StoreShot

StoreShot uses [Release Please](https://github.com/googleapis/release-please) to
manage versions, `CHANGELOG.md`, Git tags, and GitHub Releases. The same GitHub
Actions workflow publishes completed releases to npm through trusted publishing
(OIDC), so the repository does not need an `NPM_TOKEN` secret.

Release candidates publish to npm's `next` channel.
Stable releases publish to `latest`. Both use the same release PR and publishing
workflow; merging a feature PR prepares a release, while merging the generated
release PR publishes it.

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
   version tag and GitHub Release, runs the full validation gate, previews the
   npm package, and publishes it to npm. Versions with a prerelease suffix go to
   `next`; stable versions go to `latest`.
6. Confirm the **Release and publish** workflow succeeded, then verify:

   ```bash
   npm view storeshot dist-tags --json
   npm view storeshot@<version> version
   npm install --global storeshot@<version>
   storeshot --version
   ```

After the first automated publish succeeds, remove obsolete npm automation
tokens and disallow token-based publishing in the npm package settings when
that option is available.

## Release candidates

These fields in `release-please-config.json` enable the RC cycle:

```json
"versioning": "prerelease",
"prerelease": true,
"prerelease-type": "rc.1"
```

Release Please derives the base version from Conventional Commits and starts
its prerelease suffix at `rc.1`. For example, breaking changes after `0.3.0`
produce `0.4.0-rc.1`. Subsequent release PRs increment the counter, such as
`0.4.0-rc.2`. GitHub releases are marked as prereleases.

Use the normal release workflow above to publish each candidate. Verify the
published channels and install the candidate with:

```bash
npm view storeshot dist-tags --json
npm install --global storeshot@next
storeshot --version
```

Publishing an RC updates `next` and leaves `latest` pointing to the existing
stable version. An exact RC can also be installed with
`npm install --global storeshot@0.4.0-rc.1`.

### Promote to stable

1. Change `"prerelease"` to `false` in `release-please-config.json` and merge it
   into `main` with a releasable commit, such as
   `fix(release): publish stable releases by default`.
2. Keep `"versioning": "prerelease"` through this promotion. Release Please
   removes the prerelease suffix, proposing `0.4.0` after `0.4.0-rc.N` instead
   of incrementing the base version again.
3. Review the stable release PR's version, checks, and changelog. Generated
   notes cover commits since the last RC; update the unreleased entry to
   summarize the full RC cycle if needed.
4. Merge the release PR. The workflow publishes the stable version to `latest`.
5. After the stable release succeeds, remove `versioning`, `prerelease`, and
   `prerelease-type` to restore the default versioning strategy for future
   releases.

Publish a version without the RC suffix for the stable release rather than
moving an RC version to `latest`. Leave package versions, the release manifest,
and tags to Release Please throughout the cycle.

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
