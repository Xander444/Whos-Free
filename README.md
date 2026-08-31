# Who's Free? — local-data web app with PDF import

A static, GitHub Pages-friendly version of **Who's Free?**.

The site itself contains **no student schedule database**. Schedule data is created/imported by the user and saved locally in that browser.

## What this version does

- Same free/busy UI, timeline, current-time mode, manual day/time, Show everyone, and light/dark themes.
- **Add schedule PDF**: choose one or more standard Marianopolis Omnivox weekly schedule PDFs.
- The browser parser reads the student's name, class day, start/end time, course, code, section, room, and instructor.
- If no schedule database exists yet, adding the first PDF automatically creates one.
- If a database already exists, imported PDFs are added to it. Importing the same student again updates that student's schedule.
- **Import schedules.json** merges a friend's database into the local one instead of wiping existing people.
- **Share schedules.json** opens the system share sheet when file sharing is supported (useful on iPhone/iPad). Otherwise it downloads `schedules.json`, which can be sent through Messages/AirDrop/etc.
- Individual people can be removed from the Schedules manager.
- All local schedule data is stored in IndexedDB (with localStorage fallback).

## Privacy model

- Do **not** upload `schedules.json` to GitHub.
- PDFs are read with JavaScript in the browser and are not uploaded by the app.
- The app's Content Security Policy blocks normal `fetch`/XHR/WebSocket connections (`connect-src 'none'`).
- PDF parsing lazy-loads a pinned copy of Mozilla PDF.js (`pdfjs-dist@4.10.38`) from jsDelivr only when the user chooses a PDF. That CDN request receives normal web request metadata such as an IP address, but this app never sends the selected PDF or parsed schedule data to it.
- Sharing `schedules.json` intentionally shares the complete local schedule database with the recipient you choose.

## GitHub Pages deployment

Put the **contents of this folder** in the root of your `Whos-Free` repository:

```text
Whos-Free/
├── index.html
├── app.js
├── schedule-parser.js
├── styles.css
├── service-worker.js
├── manifest.webmanifest
├── README.md
└── assets/
```

In GitHub:

1. Open **Settings → Pages**.
2. Choose **Deploy from a branch**.
3. Branch: **main**.
4. Folder: **/ (root)**.
5. Save.

Do not include any `schedules.json` file in the repository.

## Using it

### Start from a PDF

1. Open the website.
2. Click **Add schedule PDF**.
3. Choose the Omnivox schedule PDF.
4. The app creates its local database automatically and adds the student.

### Add more people

Open **Schedules → Add schedule PDF**. Multiple PDFs can be selected at once.

### Share your database

Open **Schedules → Share schedules.json**.

- On supported phones/tablets, the normal system share sheet opens and you can choose Messages, AirDrop, Files, etc.
- If the browser cannot share files directly, `schedules.json` downloads instead. Send that downloaded file to your friend.

Your friend opens **Schedules → Import schedules.json** and selects the file. It merges with the schedules already stored on their device.

## Parser scope

The built-in parser is designed for the standard **Marianopolis College / Omnivox COURSE SCHEDULE** PDF layout used by the existing desktop parser. It intentionally does not try to parse arbitrary calendar PDFs.

The PDF parser uses the first page of the weekly schedule, matching the five weekday columns and the printed timetable time markers. It uses explicit printed class time ranges when present and otherwise matches class blocks to the timetable grid.

## Updating the site

The service-worker cache is currently `whos-free-shell-v3`. If you make significant future frontend changes and users appear stuck on an older installed version, increment that cache name before deploying.


## v4 reliability fix

This build uses the native `showPicker()` API when available for PDF selection, with a normal `click()` fallback. It also changes the service worker to network-first caching and versions the main JavaScript/CSS URLs so GitHub Pages updates do not mix new HTML with stale JavaScript.
