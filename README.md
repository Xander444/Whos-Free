# Who’s Free? — v10.1

A static app for comparing Marianopolis class schedules, finding shared breaks, and keeping schedule data on the device. No accounts or backend are required.

## Upload this version

1. Unzip `Whos-Free-v10.zip`.
2. Open the `Whos-Free-v10` folder and upload its contents to the **root** of `Xander444/Whos-Free`, replacing the matching existing files. Keep the `assets` folder and its contents together.
3. Keep GitHub Pages configured for the `main` branch and `/ (root)`.
4. Open the site after GitHub Pages finishes deploying. An existing installation may offer **Update & reload**. If it still displays an older version, close its open tabs or Home Screen app and reopen it.

The website files are:

```text
index.html
styles.css
app.js
schedule-core.js       ← new; required
local-store.js         ← new; required
schedule-parser.js
service-worker.js
manifest.webmanifest
assets/
```

`package.json`, `package-lock.json`, and `tests/` support development and testing; the hosted app does not need npm, a build step, or `node_modules`. Do not upload real schedule PDFs or a personal `schedules.json` to the repository.

## What changed

- **Try a demo:** fictional friends and a sample lunch group demonstrate the app without requiring an import. Demo schedules and demo preferences stay separate from real saved data.
- **Useful availability:** cards show the length of the current free window, when a busy period ends, or whether classes are finished. All seven weekdays are supported. Overlapping or adjacent meetings are combined when calculating busy time.
- **Find a shared break:** select friends or a group, choose a date range of one or seven days, and find common windows of 15 minutes to two hours. Select a result to inspect that time in the app.
- **Search and groups:** search by full name or nickname, filter to a saved friend group, and require a minimum free duration.
- **Review imports before saving:** both PDFs and JSON files open an editable weekly preview. Correct names, days, times, courses and rooms, or add missing meetings before saving. Canceling leaves the existing database unchanged.
- **Explicit duplicate handling:** matching names default to Keep existing. Choose Replace, or rename to save another person. The review can display the currently saved timetable for comparison.
- **Schedule editing:** use Schedules → Edit, or a friend’s detail panel, to update their schedule and add weekly or dated personal commitments, optional term dates and no-class dates.
- **Share selected schedules:** choose exactly whose schedules to send or download. Personal commitments are excluded unless explicitly included. Source filenames, nicknames, pins, groups, theme preferences and alert settings are not exported.
- **Spread the word:** the main view invites classmates to share Who’s Free?. The Share Who’s Free? button shares only the public app link through the device’s share sheet, copies it when native sharing is unavailable, or displays a selectable link if clipboard access is blocked.
- **Mobile details:** on narrow screens, a friend’s schedule opens in a sheet with a Back to friends button. Timelines also have a readable full-day meeting list, so class details do not depend on hovering.
- **Accessibility:** dialogs contain keyboard focus, support Escape and restore focus to the opener. Person cards remain actual buttons within list-item wrappers. Clock updates preserve unchanged buttons and their focus.
- **Saved-data recovery:** a localStorage fallback can be recovered even when IndexedDB works but has no record. Newer fallback copies are migrated back to IndexedDB when possible. Failed removal does not falsely report that every copy was deleted.
- **Alerts:** check recently started breaks after short timer delays, combine overlapping classes, respect commitments and class-calendar exceptions, avoid concurrent duplicate checks, and remember delivery only after it succeeds.
- **Offline and updates:** a v10.1 app shell includes the new runtime modules and this update. Missing scripts and styles never receive HTML as a fallback. Old app caches are removed without deleting unrelated caches. Existing sessions can explicitly reload when an update is ready.
- **Usage analytics:** Google Analytics loads by default without a Settings switch, including for people who previously turned the switch off. It records page views and fixed events for demo use, import success/failure, friend selection, shared-break searches, schedule exports and app-link sharing/copying. Custom event fields are limited to import type, coarse count buckets and the canonical public URL. Schedule contents, names, filenames, commitments and schedule times are not included in those events. Google signals and advertising personalization are disabled.

## Using it

On the first visit, choose **Try a demo**, **Add schedule PDF**, or **Import schedules.json**. To find a PDF, open the weekly schedule in Marianopolis Omnivox and download it, or use Print → Save as PDF. English and French schedules are recognized.

Review the extracted timetable against the original PDF before saving. You can skip an individual imported schedule, including a duplicate within the same batch. The parser warns when times were inferred from the timetable layout or when some course codes could not be matched. Overlapping classes also produce a review warning. A PDF that has only scanned images needs a text-based version; this parser does not perform OCR.

The live view uses the device’s local date and time. Turn off Use current time to pick a date and time manually. Selecting a weekday changes the date within the same Monday–Sunday week. Times do not automatically convert between time zones.

“Free” means **no saved class or commitment at that time**. It does not establish that a friend is on campus or wants to meet. Confirm plans with the people involved.

Term dates restrict the validity of a class schedule. Outside a saved term, free availability becomes unknown and the date is excluded from shared-break results. Weekly personal commitments continue independently of the class term; date-specific commitments apply only on their saved date. No-class dates suppress classes but preserve commitments. Without term dates, classes repeat weekly until the user updates them.

## Privacy and backups

PDF parsing happens in the browser. The app does not upload the selected PDF. PDF.js is loaded from the pinned jsDelivr URL only when needed; GSAP provides optional animations. Google Analytics loads automatically and receives the page views and basic usage events described above, along with the browser/device and network information Google Analytics normally processes.

The database uses IndexedDB with a localStorage fallback. Browser data can be cleared or evicted, so periodically download a backup through Schedules → Share selected schedules → Select all → Download file. Include commitments if you want them in that backup. Device preferences and groups are not part of the exported backup.

Existing version-one schedule files are accepted and normalized to schema version two. Files created by newer, unsupported schemas are rejected with an explanation.

## Notification limits

Alerts apply to gaps **longer than 10 minutes between saved classes**. Time before the first class or after the last class is not considered a long-break event. Personal commitments can split or remove a gap.

Checks run while the app is open and running. Brief delays can catch starts within the previous five minutes if the break is still in progress. A closed or suspended static web app cannot reliably schedule future alerts; this release does not add a push server. A failed delivery is retried while it is still eligible.

On iPhone, use Safari → Share → Add to Home Screen for supported PWA features. Settings also includes Home Screen instructions. The browser/device still determines whether notifications are available.

## Tests and local development

Use Node.js 20 or newer:

```sh
npm ci
npm test
```

The suite covers availability boundaries, overlapping meetings, commitments, date calculations, terms, exceptions, common free windows, import collisions, selective exports, storage recovery, app interaction logic, dialog focus, demo isolation, notification retry and service-worker behavior. Two fictional English/French Omnivox-style PDFs exercise the pinned PDF.js parser.

App interaction tests use Happy DOM; they are not a substitute for a visual Safari/iPhone check or tests against actual student PDFs. Browser access to the local upload bundle was unavailable during preparation. Test a real Omnivox PDF and the deployed phone layout after uploading.

For a local preview, serve the folder over HTTP, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening the HTML directly as a file does not provide the same storage/PWA environment.

## Maintenance

Keep the asset query versions in `index.html`, the service-worker registration in `app.js`, and the cache name/pre-cache URLs in `service-worker.js` aligned when shipping another release. Never include personal schedule data in the app-shell cache or repository.
