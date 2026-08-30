# Who's Free? — private local-data web app

This version is designed to be hosted **without any `schedules.json` file on the server**.

The website contains only the UI. Each friend receives `schedules.json` separately and chooses it on their own device the first time they open the site. The app saves a private copy in that browser using IndexedDB (with localStorage as a fallback). Future visits load that local copy automatically.

## Privacy model

The app code never fetches `schedules.json`, never uploads the selected file, and never sends schedule contents to a backend. All schedule calculations happen in the browser.

The selected JSON is stored under the website's browser storage (IndexedDB). That means:

- a different browser needs its own import;
- a different device needs its own import;
- clearing the site's browser data removes the saved schedules;
- changing to a different domain/origin means importing again;
- anyone who can use the app on that device can see the schedule information the UI displays.

The host still receives ordinary requests for the website files (`index.html`, `app.js`, icons, etc.), but not the schedule JSON through this app.

## Test locally

Run from this folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Choose your `schedules.json` when prompted. Reload the page to confirm that the schedules load again without selecting the file.


## iPhone install

Once hosted over HTTPS:

1. Open the site in Safari.
2. Tap Share → **Add to Home Screen**.
3. Open Who's Free? from the Home Screen.
4. Import `schedules.json` once from the Files picker.

The Home Screen version will then keep its own local browser copy. If iOS ever clears the site's storage, the user can simply choose the JSON file again.
