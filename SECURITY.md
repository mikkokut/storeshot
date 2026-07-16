# Security policy

## Supported versions

StoreShot is pre-release software. Security fixes are made against the latest
`0.x` release and the current default branch; older prereleases are not
maintained.

## Reporting a vulnerability

Please do not report a vulnerability in a public issue. Use the repository's
private vulnerability reporting feature on GitHub. If private reporting is not
available, contact the maintainer privately through the contact information on
their GitHub profile.

Include the affected version, impact, reproduction steps, and any suggested
mitigation. Do not include real user screenshots, credentials, tokens, or other
sensitive project data. You should receive an acknowledgement within seven days,
although this volunteer project cannot guarantee a resolution timeline.

## Local server model

StoreShot serves a user-selected project directory and binds to `127.0.0.1` by
default. Exposing the service with `--host` changes its threat model. Only do so
on a trusted network, and do not place untrusted files in the project directory.
