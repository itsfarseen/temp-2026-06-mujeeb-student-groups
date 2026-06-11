# Student Group List

A small static web app for splitting an institution's classes into student
groups, previewing the result as a table, and exporting it as CSV. No build
step — just HTML, CSS, and vanilla JavaScript.

## Live site

**https://itsfarseen.github.io/temp-2026-06-mujeeb-student-groups/**

## Deployment

The site is published to GitHub Pages automatically by the
[`Deploy to GitHub Pages`](.github/workflows/pages.yml) workflow on every push
to `main` (and can be triggered manually from the Actions tab).

### One-time setup

For the first deploy to work, GitHub Pages must be enabled with the workflow
as its source:

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.

After that, merging to `main` deploys the latest version.

## Local development

Open `index.html` directly in a browser, or serve the folder, e.g.:

```sh
python3 -m http.server
```

then visit http://localhost:8000.
