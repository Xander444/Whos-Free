(() => {
  "use strict";

  const WORK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const ALL_DAYS = [...WORK_DAYS, "Saturday", "Sunday"];

  const state = {
    data: { people: {} },
    hasData: false,
    scheduleMeta: null,
    storageBackend: "checking",
    useLiveTime: true,
    selectedDay: "Monday",
    selectedTime: "12:00",
    selectedPerson: null,
    showEveryone: false,
    theme: loadTheme(),
    loadError: null,
  };

  const LOCAL_DB_NAME = "whos-free-local";
  const LOCAL_DB_VERSION = 1;
  const LOCAL_STORE_NAME = "app";
  const LOCAL_SCHEDULE_KEY = "schedules";
  const LOCAL_STORAGE_FALLBACK_KEY = "whos-free-local-schedules";

  const els = {
    root: document.documentElement,
    themeMeta: document.querySelector('meta[name="theme-color"]'),
    lightThemeButton: document.getElementById("lightThemeButton"),
    darkThemeButton: document.getElementById("darkThemeButton"),
    scheduleDataButton: document.getElementById("scheduleDataButton"),
    scheduleFileInput: document.getElementById("scheduleFileInput"),
    scheduleModal: document.getElementById("scheduleModal"),
    closeScheduleModal: document.getElementById("closeScheduleModal"),
    scheduleStorageStatus: document.getElementById("scheduleStorageStatus"),
    importSchedulesButton: document.getElementById("importSchedulesButton"),
    removeSchedulesButton: document.getElementById("removeSchedulesButton"),
    liveToggle: document.getElementById("liveToggle"),
    daySelect: document.getElementById("daySelect"),
    timeInput: document.getElementById("timeInput"),
    refreshButton: document.getElementById("refreshButton"),
    peopleHeading: document.getElementById("peopleHeading"),
    viewToggleButton: document.getElementById("viewToggleButton"),
    freeCount: document.getElementById("freeCount"),
    statusLine: document.getElementById("statusLine"),
    peopleList: document.getElementById("peopleList"),
    detailPanel: document.getElementById("detailPanel"),
    toast: document.getElementById("toast"),
    dataSetupTemplate: document.getElementById("dataSetupTemplate"),
  };

  function loadTheme() {
    try {
      const saved = localStorage.getItem("whos-free-theme");
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
      return "dark";
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem("whos-free-theme", theme);
    } catch {
      // Theme persistence is optional.
    }
  }

  function applyTheme(theme) {
    state.theme = theme;
    els.root.dataset.theme = theme;
    els.lightThemeButton.classList.toggle("active", theme === "light");
    els.darkThemeButton.classList.toggle("active", theme === "dark");
    els.lightThemeButton.setAttribute("aria-pressed", String(theme === "light"));
    els.darkThemeButton.setAttribute("aria-pressed", String(theme === "dark"));
    els.themeMeta.setAttribute("content", theme === "light" ? "#F3F6FA" : "#0A0F18");
    saveTheme(theme);
  }

  function toMinutes(hhmm) {
    if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) return NaN;
    const [hour, minute] = hhmm.split(":").map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN;
    return hour * 60 + minute;
  }

  function formatTime(hhmm) {
    const minutes = toMinutes(hhmm);
    if (!Number.isFinite(minutes)) return hhmm || "";
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
  }

  function shortTime(hhmm) {
    const minutes = toMinutes(hhmm);
    if (!Number.isFinite(minutes)) return hhmm || "";
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, "0")}`;
  }

  function classLabel(c) {
    const title = c?.course || c?.course_code || "Class";
    return c?.room ? `${title} · ${c.room}` : title;
  }

  function shortClassLabel(c) {
    return String(c?.course_code || c?.course || "Class").slice(0, 18);
  }

  function peopleMap() {
    return state.data?.people && typeof state.data.people === "object" ? state.data.people : {};
  }

  function classesForDay(name, day) {
    const person = peopleMap()[name] || {};
    const classes = Array.isArray(person.classes) ? person.classes : [];
    return classes
      .filter(c => c && c.day === day && Number.isFinite(toMinutes(c.start)) && Number.isFinite(toMinutes(c.end)))
      .slice()
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  }

  function currentClass(name, day, minute) {
    for (const c of classesForDay(name, day)) {
      if (toMinutes(c.start) <= minute && minute < toMinutes(c.end)) return c;
    }
    return null;
  }

  function isFree(name, day, minute) {
    if (!WORK_DAYS.includes(day)) return true;
    return currentClass(name, day, minute) === null;
  }

  function previousClasses(name, day, minute) {
    if (!WORK_DAYS.includes(day)) return [];
    return classesForDay(name, day).filter(c => toMinutes(c.end) <= minute);
  }

  function nextClassToday(name, day, minute) {
    if (!WORK_DAYS.includes(day)) return null;
    return classesForDay(name, day).find(c => toMinutes(c.start) > minute) || null;
  }

  function nextClassInWeek(name, day, minute) {
    const person = peopleMap()[name] || {};
    if (!Array.isArray(person.classes) || person.classes.length === 0) return null;

    const selectedIndex = ALL_DAYS.indexOf(day);
    if (selectedIndex < 0) return null;

    for (let daysAhead = 0; daysAhead < 8; daysAhead += 1) {
      const candidateDay = ALL_DAYS[(selectedIndex + daysAhead) % 7];
      if (!WORK_DAYS.includes(candidateDay)) continue;

      for (const c of classesForDay(name, candidateDay)) {
        if (daysAhead === 0 && toMinutes(c.start) <= minute) continue;
        return { day: candidateDay, classItem: c, daysAhead };
      }
    }
    return null;
  }

  function setLiveValues() {
    const now = new Date();
    const day = now.toLocaleDateString("en-CA", { weekday: "long" });
    state.selectedDay = ALL_DAYS.includes(day) ? day : "Monday";
    state.selectedTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    els.daySelect.value = state.selectedDay;
    els.timeInput.value = state.selectedTime;
  }

  function syncLiveControls() {
    els.liveToggle.checked = state.useLiveTime;
    els.daySelect.disabled = state.useLiveTime;
    els.timeInput.disabled = state.useLiveTime;
  }

  function selectedMoment() {
    const day = els.daySelect.value;
    const time = els.timeInput.value;
    const minute = toMinutes(time);
    if (!ALL_DAYS.includes(day) || !Number.isFinite(minute)) return null;
    state.selectedDay = day;
    state.selectedTime = time;
    return { day, minute };
  }

  function visiblePeople(day, minute) {
    const people = Object.keys(peopleMap()).sort((a, b) => a.localeCompare(b));
    const free = people.filter(name => isFree(name, day, minute));
    const freeSet = new Set(free);
    const busy = people.filter(name => !freeSet.has(name));
    return { free, busy, visible: state.showEveryone ? [...free, ...busy] : free };
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2600);
  }

  function createEmptyList(headline, detail) {
    const wrap = document.createElement("div");
    wrap.className = "empty-list";
    wrap.innerHTML = `<h3></h3><p></p>`;
    wrap.querySelector("h3").textContent = headline;
    wrap.querySelector("p").textContent = detail;
    return wrap;
  }

  function renderDataSetup() {
    els.peopleHeading.textContent = "Who's Free?";
    els.freeCount.textContent = "Local only";
    els.statusLine.textContent = state.loadError
      ? "Schedule data needs your attention."
      : "Choose the schedule file once on this device.";
    els.viewToggleButton.disabled = true;
    els.peopleList.replaceChildren();

    const fragment = els.dataSetupTemplate.content.cloneNode(true);
    const title = fragment.querySelector(".data-setup-title");
    const message = fragment.querySelector(".data-setup-message");

    if (state.loadError) {
      title.textContent = "Couldn't load that file";
      message.textContent = state.loadError;
    }

    fragment.querySelector(".choose-schedules").addEventListener("click", chooseScheduleFile);
    els.peopleList.append(fragment);
    renderEmptyDetail();
  }

  function chooseScheduleFile() {
    // Clearing the value allows choosing the same file again after replacing it.
    els.scheduleFileInput.value = "";
    els.scheduleFileInput.click();
  }

  function openLocalDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
          db.createObjectStore(LOCAL_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local storage."));
    });
  }

  async function idbGet(key) {
    const db = await openLocalDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE_NAME, "readonly");
        const request = tx.objectStore(LOCAL_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not read local schedule data."));
      });
    } finally {
      db.close();
    }
  }

  async function idbSet(key, value) {
    const db = await openLocalDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE_NAME, "readwrite");
        tx.objectStore(LOCAL_STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Could not save local schedule data."));
        tx.onabort = () => reject(tx.error || new Error("Could not save local schedule data."));
      });
    } finally {
      db.close();
    }
  }

  async function idbDelete(key) {
    const db = await openLocalDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE_NAME, "readwrite");
        tx.objectStore(LOCAL_STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Could not remove local schedule data."));
        tx.onabort = () => reject(tx.error || new Error("Could not remove local schedule data."));
      });
    } finally {
      db.close();
    }
  }

  function fallbackRead() {
    const raw = localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function fallbackWrite(value) {
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(value));
  }

  function fallbackDelete() {
    localStorage.removeItem(LOCAL_STORAGE_FALLBACK_KEY);
  }

  async function readLocalScheduleRecord() {
    try {
      const record = await idbGet(LOCAL_SCHEDULE_KEY);
      state.storageBackend = "indexeddb";
      return record || null;
    } catch {
      try {
        const record = fallbackRead();
        state.storageBackend = "localstorage";
        return record;
      } catch {
        state.storageBackend = "memory";
        return null;
      }
    }
  }

  async function saveLocalScheduleRecord(record) {
    try {
      await idbSet(LOCAL_SCHEDULE_KEY, record);
      state.storageBackend = "indexeddb";
      return;
    } catch {
      try {
        fallbackWrite(record);
        state.storageBackend = "localstorage";
        return;
      } catch {
        state.storageBackend = "memory";
        throw new Error("This browser would not allow the app to save a local copy. The schedules will work until the page is closed, but may need to be selected again later.");
      }
    }
  }

  async function deleteLocalScheduleRecord() {
    let removed = false;
    try {
      await idbDelete(LOCAL_SCHEDULE_KEY);
      removed = true;
    } catch {
      // Try fallback storage too.
    }
    try {
      fallbackDelete();
      removed = true;
    } catch {
      // Nothing else to remove.
    }
    return removed;
  }

  function validateData(data) {
    if (!data || typeof data !== "object" || !data.people || typeof data.people !== "object" || Array.isArray(data.people)) {
      throw new Error("This JSON does not contain a valid 'people' schedule database.");
    }

    for (const [name, person] of Object.entries(data.people)) {
      if (!person || typeof person !== "object") {
        throw new Error(`The schedule entry for ${name} is not valid.`);
      }
      if (person.classes !== undefined && !Array.isArray(person.classes)) {
        throw new Error(`The classes for ${name} are not in the expected format.`);
      }
      for (const classItem of person.classes || []) {
        if (!classItem || typeof classItem !== "object") {
          throw new Error(`A class for ${name} is not valid.`);
        }
        if (!ALL_DAYS.includes(classItem.day)) {
          throw new Error(`A class for ${name} has an invalid day.`);
        }
        const start = toMinutes(classItem.start);
        const end = toMinutes(classItem.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          throw new Error(`A class for ${name} has an invalid start or end time.`);
        }
      }
    }
  }

  function makeScheduleMeta(file, data) {
    return {
      filename: file?.name || "schedules.json",
      importedAt: new Date().toISOString(),
      peopleCount: Object.keys(data.people || {}).length,
    };
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {
      // Persistence requests are optional and browser-controlled.
    }
  }

  async function handleLocalScheduleFile(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    const hadData = state.hasData;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      validateData(data);

      const meta = makeScheduleMeta(file, data);
      const record = { data, meta };
      let storageWarning = null;
      try {
        await saveLocalScheduleRecord(record);
        await requestPersistentStorage();
      } catch (error) {
        storageWarning = error.message;
      }

      state.data = data;
      state.hasData = true;
      state.scheduleMeta = meta;
      state.loadError = null;
      state.selectedPerson = null;
      closeScheduleModal();
      refresh();
      updateScheduleModal();
      showToast(storageWarning || `Saved ${meta.peopleCount} schedules on this device`);
    } catch (error) {
      const message = `That file could not be loaded: ${error.message}`;
      if (hadData) {
        state.loadError = null;
        refresh({ preserveScroll: true });
        showToast(message);
      } else {
        state.hasData = false;
        state.data = { people: {} };
        state.scheduleMeta = null;
        state.loadError = message;
        renderDataSetup();
      }
      updateScheduleModal();
      openScheduleModal();
    } finally {
      event.target.value = "";
    }
  }

  async function loadSchedulesFromDevice() {
    els.statusLine.textContent = "Checking this device for schedule data…";
    try {
      const record = await readLocalScheduleRecord();
      if (!record?.data) {
        state.hasData = false;
        state.data = { people: {} };
        state.scheduleMeta = null;
        state.loadError = null;
        renderDataSetup();
        updateScheduleModal();
        return;
      }

      validateData(record.data);
      state.data = record.data;
      state.hasData = true;
      state.scheduleMeta = record.meta || {
        filename: "schedules.json",
        importedAt: null,
        peopleCount: Object.keys(record.data.people || {}).length,
      };
      state.loadError = null;
      refresh();
      updateScheduleModal();
    } catch (error) {
      state.hasData = false;
      state.data = { people: {} };
      state.scheduleMeta = null;
      state.loadError = `The saved local copy could not be read: ${error.message}`;
      renderDataSetup();
      updateScheduleModal();
    }
  }

  function formatImportedAt(value) {
    if (!value) return "Previously imported on this device";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Previously imported on this device";
    return `Imported ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  }

  function updateScheduleModal() {
    if (state.hasData) {
      const meta = state.scheduleMeta || {};
      const peopleCount = Object.keys(peopleMap()).length;
      els.scheduleStorageStatus.innerHTML = `
        <div class="storage-status-row">
          <div>
            <div class="storage-status-label">Stored schedule file</div>
            <div class="storage-status-value"></div>
            <div class="storage-status-meta"></div>
          </div>
          <span class="local-badge">On device</span>
        </div>`;
      els.scheduleStorageStatus.querySelector(".storage-status-value").textContent = meta.filename || "schedules.json";
      els.scheduleStorageStatus.querySelector(".storage-status-meta").textContent = `${peopleCount} people · ${formatImportedAt(meta.importedAt)}`;
      els.importSchedulesButton.textContent = "Replace schedules.json";
      els.removeSchedulesButton.disabled = false;
    } else {
      els.scheduleStorageStatus.innerHTML = `
        <div class="storage-status-row">
          <div>
            <div class="storage-status-label">This device</div>
            <div class="storage-status-value">No schedules stored</div>
            <div class="storage-status-meta">Choose the JSON file you were sent to get started.</div>
          </div>
        </div>`;
      els.importSchedulesButton.textContent = "Choose schedules.json";
      els.removeSchedulesButton.disabled = true;
    }
  }

  function openScheduleModal() {
    updateScheduleModal();
    els.scheduleModal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => els.closeScheduleModal.focus());
  }

  function closeScheduleModal() {
    els.scheduleModal.hidden = true;
    document.body.style.overflow = "";
  }

  async function removeSchedules() {
    if (!state.hasData) return;
    const confirmed = window.confirm("Remove the schedules stored in this browser? You can add the JSON file again later.");
    if (!confirmed) return;

    await deleteLocalScheduleRecord();
    state.data = { people: {} };
    state.hasData = false;
    state.scheduleMeta = null;
    state.selectedPerson = null;
    state.loadError = null;
    closeScheduleModal();
    renderDataSetup();
    updateScheduleModal();
    showToast("Removed local schedule data");
  }

  function renderPersonCard(name, day, minute) {
    const busyClass = currentClass(name, day, minute);
    const busy = Boolean(busyClass);
    const selected = name === state.selectedPerson;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `person-card${selected ? " selected" : ""}`;
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-pressed", String(selected));

    const dot = document.createElement("span");
    dot.className = `person-status-dot${busy ? " busy" : ""}`;
    dot.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "person-copy";

    const personName = document.createElement("span");
    personName.className = "person-name";
    personName.textContent = name;

    const detail = document.createElement("span");
    detail.className = "person-detail";
    if (busy) {
      detail.textContent = classLabel(busyClass);
    } else {
      const next = nextClassToday(name, day, minute);
      detail.textContent = next ? `Next ${formatTime(next.start)} · ${classLabel(next)}` : "No more classes today";
    }

    copy.append(personName, detail);

    const badge = document.createElement("span");
    badge.className = `status-badge ${busy ? "busy" : "free"}`;
    badge.textContent = busy ? `IN CLASS\nuntil ${formatTime(busyClass.end)}` : "FREE";
    badge.style.whiteSpace = "pre-line";

    button.append(dot, copy, badge);
    button.addEventListener("click", () => {
      state.selectedPerson = name;
      refresh({ preserveScroll: true });
      if (window.matchMedia("(max-width: 880px)").matches) {
        requestAnimationFrame(() => els.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    });

    return button;
  }

  function renderEmptyDetail() {
    els.detailPanel.innerHTML = `
      <div class="empty-detail">
        <div class="empty-symbol" aria-hidden="true">◎</div>
        <h2>Select someone</h2>
        <p>See their day at a glance, including their class timeline.</p>
      </div>`;
  }

  function detailCard(title, headline, detail, accent = "accent") {
    const card = document.createElement("section");
    card.className = "detail-card";

    const label = document.createElement("div");
    label.className = `detail-label${accent === "busy" ? " busy" : ""}`;
    label.textContent = title;

    const headlineEl = document.createElement("div");
    headlineEl.className = "detail-headline";
    headlineEl.textContent = headline;

    card.append(label, headlineEl);

    if (detail) {
      const copy = document.createElement("div");
      copy.className = "detail-copy";
      copy.textContent = detail;
      card.append(copy);
    }

    return card;
  }

  function timelineCard(name, day, minute) {
    const classes = classesForDay(name, day);
    const card = document.createElement("section");
    card.className = "detail-card timeline-card";

    const label = document.createElement("div");
    label.className = "detail-label";
    label.textContent = `${day} timeline`;
    card.append(label);

    if (classes.length === 0) {
      const copy = document.createElement("div");
      copy.className = "detail-copy";
      copy.textContent = "No classes this day.";
      card.append(copy);
      return card;
    }

    const first = Math.min(...classes.map(c => toMinutes(c.start)));
    const last = Math.max(...classes.map(c => toMinutes(c.end)));
    const rangeStart = Math.max(0, first - 20);
    const rangeEnd = Math.min(24 * 60, last + 20);
    const span = Math.max(rangeEnd - rangeStart, 60);

    const pos = value => ((value - rangeStart) / span) * 100;

    const timeline = document.createElement("div");
    timeline.className = "timeline";
    timeline.append(Object.assign(document.createElement("div"), { className: "timeline-axis" }));

    classes.forEach((c, index) => {
      const start = toMinutes(c.start);
      const end = toMinutes(c.end);
      const left = Math.max(0, Math.min(100, pos(start)));
      const right = Math.max(left, Math.min(100, pos(end)));
      const width = Math.max(1.5, right - left);

      const block = document.createElement("div");
      const timingClass = end <= minute ? "past" : start <= minute && minute < end ? "current" : "future";
      block.className = `timeline-class ${timingClass}`;
      block.style.left = `${left}%`;
      block.style.width = `${width}%`;
      block.title = `${formatTime(c.start)}–${formatTime(c.end)} · ${classLabel(c)}`;
      if (width >= 15) block.textContent = shortClassLabel(c);
      timeline.append(block);

      const timeLabel = document.createElement("div");
      timeLabel.className = `timeline-time${index === 0 ? " start" : ""}`;
      timeLabel.style.left = `${left}%`;
      timeLabel.textContent = shortTime(c.start);
      timeline.append(timeLabel);
    });

    const lastClass = classes.reduce((latest, c) => toMinutes(c.end) > toMinutes(latest.end) ? c : latest, classes[0]);
    const endLabel = document.createElement("div");
    endLabel.className = "timeline-time end";
    endLabel.style.left = `${Math.max(0, Math.min(100, pos(toMinutes(lastClass.end))))}%`;
    endLabel.textContent = shortTime(lastClass.end);
    timeline.append(endLabel);

    if (minute >= rangeStart && minute <= rangeEnd) {
      const markerLeft = Math.max(0, Math.min(100, pos(minute)));
      const marker = document.createElement("div");
      marker.className = "timeline-marker";
      marker.style.left = `${markerLeft}%`;
      const markerLabel = document.createElement("div");
      markerLabel.className = "timeline-marker-label";
      markerLabel.style.left = `${markerLeft}%`;
      markerLabel.textContent = "selected time";
      timeline.append(marker, markerLabel);
    }

    card.append(timeline);
    return card;
  }

  function renderDetail(name, day, minute) {
    if (!peopleMap()[name]) {
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    const current = currentClass(name, day, minute);
    const busy = Boolean(current);
    const previous = previousClasses(name, day, minute);
    const nextToday = nextClassToday(name, day, minute);

    els.detailPanel.replaceChildren();

    const header = document.createElement("div");
    header.className = "detail-header";
    const nameEl = document.createElement("h2");
    nameEl.textContent = name;
    const statusRow = document.createElement("div");
    statusRow.className = "detail-status-row";

    const badge = document.createElement("span");
    badge.className = `status-badge ${busy ? "busy" : "free"}`;
    badge.textContent = busy ? "IN CLASS" : "FREE";
    statusRow.append(badge);

    if (busy) {
      const until = document.createElement("span");
      until.className = "until-copy";
      until.textContent = `until ${formatTime(current.end)}`;
      statusRow.append(until);
    }

    header.append(nameEl, statusRow);
    els.detailPanel.append(header, timelineCard(name, day, minute));

    if (busy) {
      els.detailPanel.append(detailCard(
        "Current class",
        `${formatTime(current.start)}–${formatTime(current.end)}`,
        classLabel(current),
        "busy"
      ));
    }

    if (previous.length > 0) {
      const last = previous[previous.length - 1];
      els.detailPanel.append(detailCard(
        "Earlier today",
        `${previous.length} class${previous.length === 1 ? "" : "es"} finished`,
        `Last ended at ${formatTime(last.end)}\n${classLabel(last)}`
      ));
    } else {
      els.detailPanel.append(detailCard(
        "Earlier today",
        "No classes finished yet",
        "They haven't had a class end today."
      ));
    }

    if (nextToday) {
      const until = toMinutes(nextToday.start) - minute;
      const hours = Math.floor(until / 60);
      const mins = until % 60;
      const away = hours && mins ? `in ${hours}h ${mins}m` : hours ? `in ${hours}h` : `in ${mins}m`;
      els.detailPanel.append(detailCard(
        "Next class",
        `${formatTime(nextToday.start)}–${formatTime(nextToday.end)}`,
        `${away}\n${classLabel(nextToday)}`
      ));
    } else {
      const future = nextClassInWeek(name, day, minute);
      if (future) {
        const when = future.daysAhead > 0 ? `Next ${future.day}` : future.day;
        els.detailPanel.append(detailCard(
          "Next class",
          "No more classes today",
          `${when} at ${formatTime(future.classItem.start)}\n${classLabel(future.classItem)}`
        ));
      } else {
        els.detailPanel.append(detailCard("Next class", "No upcoming class found", ""));
      }
    }
  }

  function refresh({ preserveScroll = false } = {}) {
    if (!state.hasData || state.loadError) {
      renderDataSetup();
      return;
    }

    els.viewToggleButton.disabled = false;

    if (state.useLiveTime) setLiveValues();
    syncLiveControls();

    const moment = selectedMoment();
    if (!moment) {
      showToast("Choose a valid day and time.");
      return;
    }

    const { day, minute } = moment;
    const { free, busy, visible } = visiblePeople(day, minute);
    const peopleCount = Object.keys(peopleMap()).length;
    const oldScroll = els.peopleList.scrollTop;

    els.peopleHeading.textContent = state.showEveryone ? "Everyone" : state.useLiveTime ? "Free now" : "Free";
    els.viewToggleButton.textContent = state.showEveryone ? "Show only free" : "Show everyone";
    els.freeCount.textContent = `${free.length} of ${peopleCount} free`;
    els.statusLine.textContent = `${state.useLiveTime ? "Live · " : ""}${day} at ${formatTime(state.selectedTime)} · ${busy.length} in class`;

    els.peopleList.replaceChildren();

    if (peopleCount === 0) {
      els.peopleList.append(createEmptyList("No people in this file", "Replace the schedule file from the Schedules button."));
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    if (visible.length === 0) {
      els.peopleList.append(createEmptyList("Nobody is free", "Try another time or choose Show everyone."));
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    if (state.selectedPerson && !visible.includes(state.selectedPerson)) {
      state.selectedPerson = null;
    }

    visible.forEach(name => els.peopleList.append(renderPersonCard(name, day, minute)));

    if (preserveScroll) els.peopleList.scrollTop = oldScroll;

    if (state.selectedPerson) renderDetail(state.selectedPerson, day, minute);
    else renderEmptyDetail();
  }

  function bindEvents() {
    els.lightThemeButton.addEventListener("click", () => applyTheme("light"));
    els.darkThemeButton.addEventListener("click", () => applyTheme("dark"));
    els.scheduleDataButton.addEventListener("click", openScheduleModal);
    els.closeScheduleModal.addEventListener("click", closeScheduleModal);
    els.importSchedulesButton.addEventListener("click", chooseScheduleFile);
    els.removeSchedulesButton.addEventListener("click", removeSchedules);
    els.scheduleFileInput.addEventListener("change", handleLocalScheduleFile);

    els.scheduleModal.addEventListener("click", event => {
      if (event.target === els.scheduleModal) closeScheduleModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !els.scheduleModal.hidden) closeScheduleModal();
    });

    els.liveToggle.addEventListener("change", () => {
      state.useLiveTime = els.liveToggle.checked;
      if (state.useLiveTime) setLiveValues();
      syncLiveControls();
      refresh();
    });

    els.daySelect.addEventListener("change", () => {
      state.selectedDay = els.daySelect.value;
      state.selectedPerson = null;
      refresh();
    });

    els.timeInput.addEventListener("change", () => {
      state.selectedTime = els.timeInput.value;
      state.selectedPerson = null;
      refresh();
    });

    els.refreshButton.addEventListener("click", () => refresh());

    els.viewToggleButton.addEventListener("click", () => {
      state.showEveryone = !state.showEveryone;
      state.selectedPerson = null;
      refresh();
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.useLiveTime) refresh();
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app works normally even if PWA caching isn't available.
    });
  }

  function init() {
    applyTheme(state.theme);
    setLiveValues();
    syncLiveControls();
    bindEvents();
    updateScheduleModal();
    loadSchedulesFromDevice();
    registerServiceWorker();

    window.setInterval(() => {
      if (state.useLiveTime && !document.hidden && state.hasData && !state.loadError) refresh({ preserveScroll: true });
    }, 15000);
  }

  init();
})();
