# Who's Free? — Web App v6

A privacy-first static web app for comparing Marianopolis schedules.

## What's new in v6

- Long-break notifications for gaps **longer than 10 minutes** between classes.
- Notifications are grouped when multiple unmuted friends start a break at the same time.
- Per-person notification bells: **🔔** receives break alerts, **🔕** mutes that person.
- A dedicated **Settings** panel.
- Subtle GSAP motion for cards, details, modals, timelines, counters, bells, and toasts.
- Responsive phone layout with larger touch targets and modal sizing that fits small screens.
- Small “Made by Xander Vatch” credit at the bottom.
- Service-worker cache bumped to **v6**.

## Privacy model

Schedule PDFs and `schedules.json` stay on the user's device. The app stores the local schedule database in IndexedDB (with a localStorage fallback).

The hosted GitHub Pages site does **not** need a `schedules.json` file.

PDF parsing happens in the browser. PDF.js is loaded from jsDelivr only when a user adds a PDF; the selected PDF itself is not uploaded by the app.

Notification mute preferences are also stored locally and are not included when sharing `schedules.json`.

## Notifications

When enabled, Who's Free? looks for breaks between two classes where:

- the previous class has ended,
- the next class is later the same day, and
- the gap is **more than 10 minutes**.

Time before the first class and time after the last class are not treated as breaks.

If several unmuted people start a qualifying break in the same minute, Who's Free? sends one grouped notification instead of several separate notifications.

### Current limitation

This is still a static GitHub Pages app. Break alerts are checked while the app is open/running. A static site cannot reliably wake itself later after the browser/PWA has been fully closed.

On iPhone, users should add Who's Free? to the Home Screen for the best notification support.

## Files to deploy

Upload these to the **root** of the GitHub repository:

```text
index.html
app.js
schedule-parser.js
styles.css
service-worker.js
manifest.webmanifest
assets/
```

Do **not** upload `schedules.json`.

GitHub Pages:

```text
Branch: main
Folder: / (root)
```

## Updating an existing install

v6 uses versioned files and `whos-free-shell-v6`, so previous installs should update automatically after the GitHub Pages deployment completes.

If a device still shows an older version, close the page/Home Screen app completely and reopen it. Clearing the site's cached website data is only a last resort.

## GSAP

GSAP 3.13.0 is loaded from jsDelivr and is used only for small UI transitions. The app still works if GSAP fails to load; animation helpers automatically fall back to the non-animated UI.

Users with **Reduce Motion** enabled do not get the GSAP motion effects.

## Sharing

The **Share schedules.json** button shares/downloads only the schedule database. Device-specific preferences such as theme, notification settings, muted bells, and notification history are not included.
