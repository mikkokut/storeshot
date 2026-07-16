# Releasing StoreShot

StoreShot publishes stable releases to npm from GitHub Actions. A `vX.Y.Z` Git
tag is the release trigger, and the tag must match the version in `package.json`.
The workflow uses npm trusted publishing (OIDC), so the repository does not need
an `NPM_TOKEN` secret.

## One-time setup and first release

The `storeshot` package does not exist on npm yet. npm only allows a trusted
publisher to be configured after the package exists, so `0.1.0` must be
published manually once.

1. Create an account at [npmjs.com](https://www.npmjs.com/) if needed, verify
   the account email address, and enable two-factor authentication for
   authorization and publishing.
2. Make sure the publishing-workflow and package-metadata changes are merged
   into `main` and pushed to GitHub.
3. From a clean checkout of `main`, sign in and verify the account:

   ```bash
   npm login
   npm whoami
   ```

4. Validate exactly what will be released:

   ```bash
   npm ci
   npm run check
   npm pack --dry-run
   ```

   Read the package-content list. It should contain the built `dist/` files,
   documentation, notices, and licenses, but no source-only secrets or local
   project data.

5. Publish the initial release:

   ```bash
   npm publish
   ```

   npm runs `prepublishOnly`, so the validation gate runs again before upload.
   Complete the two-factor prompt when npm asks for it.

6. Configure trusted publishing on the new package:

   - Open the `storeshot` package on npm while signed in, then go to
     **Settings** and find **Trusted Publisher**.
   - Select **GitHub Actions**.
   - Organization or user: `mikkokut`
   - Repository: `storeshot`
   - Workflow filename: `publish.yml`
   - Environment: leave empty
   - Allowed action: `npm publish`

   The names are case-sensitive. Enter only `publish.yml`, not the full
   `.github/workflows/publish.yml` path.

7. Create and push the initial release tag. The workflow recognizes that
   `0.1.0` already exists and exits successfully:

   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```

8. Confirm that the **Publish to npm** workflow succeeded in GitHub Actions and
   that `npm view storeshot version` prints `0.1.0`.

After the first trusted publish succeeds, remove any old npm automation tokens.
In the npm package settings, disallow token-based publishing if that option is
available. Keep trusted publishing enabled.

## Publishing later versions

Prepare releases on `main`, after all intended changes have landed.

1. Update `CHANGELOG.md`: move relevant entries from **Unreleased** into a new
   version section with the release date, and restore an empty **Unreleased**
   section for future work.
2. Check the working tree and run the release gate:

   ```bash
   git status --short
   npm ci
   npm run check
   npm pack --dry-run
   ```

3. Choose the semantic-version increment:

   - `patch` for backward-compatible fixes (`0.1.0` to `0.1.1`)
   - `minor` for backward-compatible features (`0.1.0` to `0.2.0`)
   - `major` for breaking changes once the project reaches `1.0.0`
   - While the project is on `0.x`, use a minor bump for meaningful breaking
     changes and explain them in the changelog.

4. Commit the changelog and other release preparation, then make sure the tree
   is clean:

   ```bash
   git add CHANGELOG.md
   git commit -m "Prepare v0.1.1 release"
   git status --short
   ```

5. Let npm update both `package.json` and `package-lock.json`, create the version
   commit, and create the matching Git tag:

   ```bash
   npm version patch -m "Release v%s"
   ```

   Replace `patch` with `minor`, `major`, or an exact version when appropriate.
   Do not use `--force`; `npm version` intentionally requires a clean tree.

6. Inspect the result before publishing:

   ```bash
   git show --stat --oneline HEAD
   git tag --points-at HEAD
   ```

7. Push the version commit and tag together:

   ```bash
   git push origin main --follow-tags
   ```

8. Watch the **Publish to npm** workflow. When it succeeds, verify the registry:

   ```bash
   npm view storeshot version
   npm install --global storeshot@0.1.1
   storeshot --version
   ```

   Replace `0.1.1` with the released version. Optionally create a GitHub Release
   from the same tag and copy the corresponding changelog section into it.

## If publishing fails

- Fix the cause; do not delete and recreate a published npm version. npm package
  name/version pairs cannot be reused.
- If validation fails before `npm publish`, fix the code on `main`, remove the
  unpublished local and remote tag, bump again, and push the corrected tag.
- If npm reports an authentication error, confirm that trusted publishing uses
  `mikkokut/storeshot`, the exact filename `publish.yml`, no environment, and
  that the workflow has `id-token: write` permission.
- If npm already contains the version, the workflow exits successfully without
  attempting to overwrite it.
- Never add an npm write token to the repository or workflow. Trusted publishing
  is the normal release path after the initial bootstrap release.
