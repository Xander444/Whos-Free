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
    isParsing: false,
    notificationsEnabled: false,
    mutedPeople: new Set(),
    nicknames: {},
    pinnedPeople: new Set(),
    accentTheme: "blue",
    lastPeopleSignature: "",
    lastDetailPerson: null,
    lastFreeCountText: "",
  };

  const LOCAL_DB_NAME = "whos-free-local";
  const LOCAL_DB_VERSION = 1;
  const LOCAL_STORE_NAME = "app";
  const LOCAL_SCHEDULE_KEY = "schedules";
  const LOCAL_STORAGE_FALLBACK_KEY = "whos-free-local-schedules";
  const NOTIFICATION_SETTINGS_KEY = "whos-free-notification-settings-v1";
  const NOTIFICATION_HISTORY_KEY = "whos-free-notification-history-v1";
  const PEOPLE_PREFERENCES_KEY = "whos-free-people-preferences-v1";
  const ACCENT_THEME_KEY = "whos-free-accent-theme-v1";
  const ACCENT_THEMES = new Set(["blue", "violet", "rose", "mint", "orange"]);
  const BREAK_THRESHOLD_MINUTES = 10;
  const APP_URL = "https://xander444.github.io/Whos-Free/";

  const els = {
    root: document.documentElement,
    themeMeta: document.querySelector('meta[name="theme-color"]'),
    lightThemeButton: document.getElementById("lightThemeButton"),
    darkThemeButton: document.getElementById("darkThemeButton"),
    scheduleDataButton: document.getElementById("scheduleDataButton"),
    settingsButton: document.getElementById("settingsButton"),
    scheduleFileInput: document.getElementById("scheduleFileInput"),
    schedulePdfInput: document.getElementById("schedulePdfInput"),
    scheduleModal: document.getElementById("scheduleModal"),
    closeScheduleModal: document.getElementById("closeScheduleModal"),
    scheduleStorageStatus: document.getElementById("scheduleStorageStatus"),
    addSchedulePdfButton: document.getElementById("addSchedulePdfButton"),
    parserStatus: document.getElementById("parserStatus"),
    importSchedulesButton: document.getElementById("importSchedulesButton"),
    shareSchedulesButton: document.getElementById("shareSchedulesButton"),
    peopleManagerCount: document.getElementById("peopleManagerCount"),
    peopleManagerList: document.getElementById("peopleManagerList"),
    removeSchedulesButton: document.getElementById("removeSchedulesButton"),
    settingsModal: document.getElementById("settingsModal"),
    closeSettingsModal: document.getElementById("closeSettingsModal"),
    breakNotificationToggle: document.getElementById("breakNotificationToggle"),
    notificationPermissionStatus: document.getElementById("notificationPermissionStatus"),
    testNotificationButton: document.getElementById("testNotificationButton"),
    notificationPeopleCount: document.getElementById("notificationPeopleCount"),
    notificationPeopleList: document.getElementById("notificationPeopleList"),
    colorThemeGrid: document.getElementById("colorThemeGrid"),
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

  function loadAccentTheme() {
    try {
      const saved = localStorage.getItem(ACCENT_THEME_KEY);
      return ACCENT_THEMES.has(saved) ? saved : "blue";
    } catch {
      return "blue";
    }
  }

  function saveAccentTheme(theme) {
    try {
      localStorage.setItem(ACCENT_THEME_KEY, theme);
    } catch {
      // Appearance persistence is optional.
    }
  }

  function syncThemeMeta() {
    // Match Safari/PWA chrome to the currently selected full theme.
    requestAnimationFrame(() => {
      const background = getComputedStyle(els.root).getPropertyValue("--bg").trim();
      if (background) els.themeMeta.setAttribute("content", background);
    });
  }

  function animateThemeSurfaceChange() {
    if (!canAnimate()) return;
    const surfaces = document.querySelectorAll(".control-bar, .people-panel, .detail-panel");
    window.gsap.fromTo(surfaces, { opacity: 0.96, scale: 0.998 }, { opacity: 1, scale: 1, duration: 0.22, stagger: 0.015, ease: "power1.out", clearProps: "opacity,transform" });
  }

  function applyTheme(theme) {
    state.theme = theme;
    els.root.dataset.theme = theme;
    els.lightThemeButton?.classList.toggle("active", theme === "light");
    els.darkThemeButton?.classList.toggle("active", theme === "dark");
    els.lightThemeButton?.setAttribute("aria-pressed", String(theme === "light"));
    els.darkThemeButton?.setAttribute("aria-pressed", String(theme === "dark"));
    saveTheme(theme);
    syncThemeMeta();
  }

  function applyAccentTheme(theme, animate = true) {
    const next = ACCENT_THEMES.has(theme) ? theme : "blue";
    state.accentTheme = next;
    els.root.dataset.accentTheme = next;
    saveAccentTheme(next);
    syncThemeMeta();
    if (animate) animateThemeSurfaceChange();

    if (els.colorThemeGrid) {
      for (const button of els.colorThemeGrid.querySelectorAll("[data-color-theme]")) {
        const active = button.dataset.colorTheme === next;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
        if (active && animate && canAnimate()) {
          window.gsap.fromTo(button, { scale: 0.97 }, { scale: 1, duration: 0.24, ease: "back.out(1.8)", clearProps: "transform" });
        }
      }
    }
  }


  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function canAnimate() {
    return Boolean(window.gsap) && !prefersReducedMotion();
  }

  function animateModalOpen(backdrop, panel) {
    if (!canAnimate() || !backdrop || !panel) return;
    window.gsap.killTweensOf([backdrop, panel]);
    window.gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
    window.gsap.fromTo(
      panel,
      { opacity: 0, y: 8, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: "power2.out" }
    );
  }

  function animateCardsIfNeeded(signature) {
    if (!canAnimate() || state.lastPeopleSignature === signature) return;
    const cards = Array.from(els.peopleList.querySelectorAll(".person-card"));
    if (!cards.length) return;
    window.gsap.fromTo(
      cards,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.24, stagger: 0.025, ease: "power2.out", clearProps: "opacity,transform" }
    );
  }

  function animateSelectedCard() {
    if (!canAnimate()) return;
    const selected = els.peopleList.querySelector(".person-card.selected");
    if (!selected) return;
    window.gsap.fromTo(
      selected,
      { scale: 0.992 },
      { scale: 1, duration: 0.2, ease: "power2.out", clearProps: "transform" }
    );
  }

  function animateDetailIfNeeded(name) {
    if (!canAnimate() || state.lastDetailPerson === name) return;
    const children = Array.from(els.detailPanel.children);
    window.gsap.fromTo(
      children,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.24, stagger: 0.035, ease: "power2.out", clearProps: "opacity,transform" }
    );
    const blocks = Array.from(els.detailPanel.querySelectorAll(".timeline-class"));
    if (blocks.length) {
      window.gsap.fromTo(
        blocks,
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 0.32, stagger: 0.03, ease: "power2.out", clearProps: "transform" }
      );
    }
  }

  function animateCountIfChanged(nextText) {
    if (!canAnimate() || state.lastFreeCountText === nextText) return;
    window.gsap.fromTo(
      els.freeCount,
      { scale: 0.96 },
      { scale: 1, duration: 0.2, ease: "back.out(1.7)", clearProps: "transform" }
    );
  }

  function animateAppEntrance() {
    if (!canAnimate()) return;
    const targets = [
      document.querySelector(".brand-copy"),
      document.querySelector(".header-actions"),
      document.querySelector(".control-bar"),
      document.querySelector(".people-panel"),
      document.querySelector(".detail-panel"),
    ].filter(Boolean);
    window.gsap.fromTo(
      targets,
      { opacity: 0, y: 5 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.035, ease: "power2.out", clearProps: "opacity,transform" }
    );
  }

  function animateSettingsContent() {
    if (!canAnimate()) return;
    const sections = Array.from(els.settingsModal.querySelectorAll(".settings-section"));
    window.gsap.fromTo(
      sections,
      { opacity: 0, y: 4 },
      { opacity: 1, y: 0, duration: 0.22, stagger: 0.035, ease: "power1.out", clearProps: "opacity,transform" }
    );
  }

  function animateRefreshFeedback() {
    if (!canAnimate()) return;
    window.gsap.fromTo(els.refreshButton, { scale: 0.97 }, { scale: 1, duration: 0.18, ease: "back.out(1.6)", clearProps: "transform" });
  }

  function loadNotificationSettings() {
    try {
      const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (!raw) return { enabled: false, mutedPeople: [] };
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed?.enabled),
        mutedPeople: Array.isArray(parsed?.mutedPeople) ? parsed.mutedPeople.filter(Boolean) : [],
      };
    } catch {
      return { enabled: false, mutedPeople: [] };
    }
  }

  function saveNotificationSettings() {
    if (state.isDemo) return;
    try {
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify({
        enabled: state.notificationsEnabled,
        mutedPeople: Array.from(state.mutedPeople).sort((a, b) => a.localeCompare(b)),
      }));
    } catch {
      // Notification preferences are best-effort local settings.
    }
  }

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function readNotificationHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_HISTORY_KEY) || "null");
      if (!parsed || parsed.date !== dateKey() || !Array.isArray(parsed.keys)) {
        return { date: dateKey(), keys: [] };
      }
      return parsed;
    } catch {
      return { date: dateKey(), keys: [] };
    }
  }

  function writeNotificationHistory(history) {
    try {
      localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Duplicate prevention is best-effort.
    }
  }

  function breakEventsForPerson(name, day, date = Core.localDate()) {
    return Core.breakEvents(peopleMap()[name] || { classes: [] }, day, date, BREAK_THRESHOLD_MINUTES).map(item => ({ ...item, name }));
  }

  function groupedBreaksStartingNow(now = new Date(), since = new Date(now.getTime() - 60000)) {
    if (!state.hasData || state.isDemo) return [];
    const date = Core.localDate(now), day = Core.dayForDate(date);
    const minute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const sameDate = Core.localDate(since) === date;
    const earlier = sameDate ? since.getHours() * 60 + since.getMinutes() + since.getSeconds() / 60 : -1;
    const lower = Math.max(earlier, minute - 5);
    return Object.keys(peopleMap()).filter(name => !state.mutedPeople.has(name)).flatMap(name =>
      breakEventsForPerson(name, day, date).filter(item => toMinutes(item.start) > lower && toMinutes(item.start) <= minute && toMinutes(item.end) > minute)
    );
  }

  function compactNameList(names) {
    if (names.length <= 3) {
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return `${names[0]}, ${names[1]} and ${names[2]}`;
    }
    return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
  }

  async function showSystemNotification(title, options = {}) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.active) { await registration.showNotification(title, options); return true; }
    } catch { /* Fall back to a page notification. */ }
    try {
      const notification = new Notification(title, options);
      notification.onclick = () => { window.focus(); notification.close(); };
      return true;
    } catch { return false; }
  }

  async function sendGroupedBreakNotification(breaks) {
    if (!breaks.length) return;

    const names = breaks.map(item => displayName(item.name));
    const durations = breaks.map(item => item.duration);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const allSameEnd = breaks.every(item => item.end === breaks[0].end);

    const title = breaks.length === 1
      ? `${displayName(breaks[0].name)} is on break`
      : `${breaks.length} friends are on break`;

    let body;
    if (breaks.length === 1) {
      body = `Free for ${breaks[0].duration} min · until ${formatTime(breaks[0].end)}`;
    } else if (allSameEnd) {
      body = `${compactNameList(names)} · free until ${formatTime(breaks[0].end)}`;
    } else {
      const durationText = minDuration === maxDuration ? `${minDuration} min` : `${minDuration}–${maxDuration} min`;
      body = `${compactNameList(names)} · breaks ${durationText}`;
    }

    return await showSystemNotification(title, {
      body,
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
      tag: `whos-free-break-${dateKey()}-${breaks[0].start}`,
      data: { url: "./" },
    });
  }

  async function checkBreakNotifications() {
    if (notificationCheckInFlight || state.isDemo || !state.notificationsEnabled || !state.hasData || !("Notification" in window) || Notification.permission !== "granted") return;
    notificationCheckInFlight = true;
    const run = async () => {
      const now = new Date();
      const due = groupedBreaksStartingNow(now, lastNotificationCheck);
      const history = readNotificationHistory(), known = new Set(history.keys);
      const unseen = due.filter(item => !known.has(`${item.name}|${item.day}|${item.start}|${item.end}`));
      if (!unseen.length) { lastNotificationCheck = now; return; }
      const sent = await sendGroupedBreakNotification(unseen);
      if (!sent) return;
      for (const item of unseen) known.add(`${item.name}|${item.day}|${item.start}|${item.end}`);
      writeNotificationHistory({ date: dateKey(now), keys: [...known] });
      lastNotificationCheck = now;
    };
    try {
      if (navigator.locks?.request) await navigator.locks.request("whos-free-notifications", run);
      else await run();
    } finally { notificationCheckInFlight = false; }
  }

  function notificationSupportText() {
    if (!("Notification" in window)) {
      return { tone: "error", text: "Notifications are not supported in this browser. On iPhone, add Who's Free? to the Home Screen and open it from there." };
    }
    if (Notification.permission === "denied") {
      return { tone: "error", text: "Notifications are blocked. Re-enable them in your browser or device settings." };
    }
    if (Notification.permission === "granted") {
      return { tone: "success", text: state.notificationsEnabled ? "Break notifications are on." : "Notification permission is ready. Turn alerts on whenever you want." };
    }
    return { tone: "neutral", text: "Turn alerts on to let Who's Free? ask for notification permission." };
  }

  async function handleNotificationToggle() {
    const requested = els.breakNotificationToggle.checked;

    if (!requested) {
      state.notificationsEnabled = false;
      saveNotificationSettings();
      updateSettingsModal();
      showToast("Break notifications turned off");
      return;
    }

    if (!("Notification" in window)) {
      state.notificationsEnabled = false;
      els.breakNotificationToggle.checked = false;
      updateSettingsModal();
      showToast("Notifications are not supported here");
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = Notification.permission;
      }
    }

    state.notificationsEnabled = permission === "granted";
    saveNotificationSettings();
    updateSettingsModal();

    if (state.notificationsEnabled) {
      showToast("Long break notifications are on");
      checkBreakNotifications();
    } else {
      showToast(permission === "denied" ? "Notifications were blocked" : "Notification permission was not granted");
    }
  }

  async function sendTestNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      showToast("Turn notifications on first");
      return;
    }
    const ok = await showSystemNotification("Who's Free? notifications work", {
      body: "You'll get grouped alerts when friends start breaks longer than 10 minutes.",
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
      tag: "whos-free-test",
      data: { url: "./" },
    });
    showToast(ok ? "Test notification sent" : "Could not show a notification");
  }

  function togglePersonMute(name, button = null) {
    if (state.mutedPeople.has(name)) state.mutedPeople.delete(name);
    else state.mutedPeople.add(name);
    saveNotificationSettings();
    updateSettingsModal();

    if (canAnimate() && button) {
      window.gsap.fromTo(button, { scale: 0.84, rotate: -8 }, { scale: 1, rotate: 0, duration: 0.28, ease: "back.out(2)", clearProps: "transform" });
    }
  }

  function renderNotificationPeople() {
    const names = Object.keys(peopleMap()).sort(comparePeopleNames);
    els.notificationPeopleCount.textContent = String(names.length);
    els.notificationPeopleList.replaceChildren();

    if (!names.length) {
      const empty = document.createElement("p");
      empty.className = "people-manager-empty";
      empty.textContent = "Add a schedule before personalizing people.";
      els.notificationPeopleList.append(empty);
      return;
    }

    for (const name of names) {
      const muted = state.mutedPeople.has(name);
      const pinned = state.pinnedPeople.has(name);
      const nickname = state.nicknames[name] || "";
      const row = document.createElement("div");
      row.className = `notification-person-row people-preference-card${pinned ? " pinned" : ""}`;

      const top = document.createElement("div");
      top.className = "people-preference-top";

      const copy = document.createElement("div");
      copy.className = "notification-person-copy";

      const title = document.createElement("div");
      title.className = "notification-person-name";
      title.textContent = displayName(name);

      const meta = document.createElement("div");
      meta.className = "notification-person-meta";
      const longBreaks = WORK_DAYS.reduce((count, day) => count + breakEventsForPerson(name, day).length, 0);
      const parts = [];
      if (nickname) parts.push(name);
      parts.push(pinned ? "Pinned to top" : `${longBreaks} long break${longBreaks === 1 ? "" : "s"}`);
      if (muted) parts.push("alerts muted");
      meta.textContent = parts.join(" · ");
      copy.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "people-preference-actions";

      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = `preference-icon-button pin-button${pinned ? " active" : ""}`;
      pin.textContent = "📌";
      pin.setAttribute("aria-pressed", String(pinned));
      pin.setAttribute("aria-label", pinned ? `Unpin ${displayName(name)}` : `Pin ${displayName(name)} to the top`);
      pin.title = pinned ? "Unpin" : "Pin to top";
      pin.addEventListener("click", () => togglePersonPin(name, pin));

      const bell = document.createElement("button");
      bell.type = "button";
      bell.className = `bell-button${muted ? " muted" : ""}`;
      bell.textContent = muted ? "🔕" : "🔔";
      bell.setAttribute("aria-pressed", String(muted));
      bell.setAttribute("aria-label", muted ? `Unmute break notifications for ${displayName(name)}` : `Mute break notifications for ${displayName(name)}`);
      bell.title = muted ? "Unmute break notifications" : "Mute break notifications";
      bell.addEventListener("click", () => togglePersonMute(name, bell));

      actions.append(pin, bell);
      top.append(copy, actions);

      const nicknameRow = document.createElement("label");
      nicknameRow.className = "nickname-row";
      const nicknameLabel = document.createElement("span");
      nicknameLabel.className = "nickname-label";
      nicknameLabel.textContent = "Nickname";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "nickname-input";
      input.maxLength = 30;
      input.placeholder = "Use full name";
      input.value = nickname;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", `Nickname for ${name}`);

      const saveValue = () => {
        const next = input.value.trim();
        const before = state.nicknames[name] || "";
        if (next === before) return;
        setNickname(name, next);
        showToast(next ? `Nickname saved: ${next}` : `Showing ${name}`);
      };
      input.addEventListener("change", saveValue);
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });

      nicknameRow.append(nicknameLabel, input);
      row.append(top, nicknameRow);
      els.notificationPeopleList.append(row);
    }

    if (canAnimate()) {
      const rows = Array.from(els.notificationPeopleList.querySelectorAll(".people-preference-card"));
      window.gsap.fromTo(rows, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.018, ease: "power1.out", clearProps: "opacity,transform" });
    }
  }

  function updateSettingsModal() {
    if (!els.settingsModal) return;

    els.breakNotificationToggle.checked = state.notificationsEnabled;
    els.breakNotificationToggle.disabled = state.isDemo;
    const support = notificationSupportText();
    els.notificationPermissionStatus.textContent = support.text;
    els.notificationPermissionStatus.dataset.tone = support.tone;
    els.testNotificationButton.disabled = state.isDemo || !("Notification" in window) || Notification.permission !== "granted";

    applyTheme(state.theme);
    applyAccentTheme(state.accentTheme, false);
    renderNotificationPeople();
  }

  function openSettingsModal() {
    updateSettingsModal(); renderGroups();
    showDialog(els.settingsModal);
    animateSettingsContent();
  }

  function closeSettingsModal() { closeDialog(els.settingsModal); }

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
    const title = c?.title || c?.course || c?.course_code || "Class";
    return c?.room ? `${title} · ${c.room}` : title;
  }

  function shortClassLabel(c) {
    return String(c?.course_code || c?.course || "Class").slice(0, 18);
  }

  function peopleMap() {
    return state.data?.people && typeof state.data.people === "object" ? state.data.people : {};
  }

  function loadPeoplePreferences() {
    try {
      const raw = localStorage.getItem(PEOPLE_PREFERENCES_KEY);
      if (!raw) return { nicknames: {}, pinnedPeople: [] };
      const parsed = JSON.parse(raw);
      const nicknames = parsed?.nicknames && typeof parsed.nicknames === "object" && !Array.isArray(parsed.nicknames)
        ? parsed.nicknames
        : {};
      const pinnedPeople = Array.isArray(parsed?.pinnedPeople) ? parsed.pinnedPeople.filter(Boolean) : [];
      return { nicknames, pinnedPeople };
    } catch {
      return { nicknames: {}, pinnedPeople: [] };
    }
  }

  function savePeoplePreferences() {
    if (state.isDemo) return;
    try {
      localStorage.setItem(PEOPLE_PREFERENCES_KEY, JSON.stringify({
        nicknames: state.nicknames,
        pinnedPeople: Array.from(state.pinnedPeople),
      }));
    } catch {
      // Personalization is best-effort local state.
    }
  }

  function cleanPeoplePreferences() {
    const valid = new Set(Object.keys(peopleMap()));
    let changed = false;
    for (const name of Object.keys(state.nicknames)) {
      if (!valid.has(name)) {
        delete state.nicknames[name];
        changed = true;
      }
    }
    for (const name of Array.from(state.pinnedPeople)) {
      if (!valid.has(name)) {
        state.pinnedPeople.delete(name);
        changed = true;
      }
    }
    if (changed) savePeoplePreferences();
  }

  function displayName(name) {
    const nickname = String(state.nicknames[name] || "").trim();
    return nickname || name;
  }

  function comparePeopleNames(a, b) {
    const pinnedA = state.pinnedPeople.has(a);
    const pinnedB = state.pinnedPeople.has(b);
    if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
    return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" });
  }

  function setNickname(name, value) {
    const next = String(value || "").trim().slice(0, 30);
    if (next) state.nicknames[name] = next;
    else delete state.nicknames[name];
    savePeoplePreferences();
    updateScheduleModal();
    updateSettingsModal();
    refresh({ preserveScroll: true });
  }

  function togglePersonPin(name, button = null) {
    if (state.pinnedPeople.has(name)) state.pinnedPeople.delete(name);
    else state.pinnedPeople.add(name);
    savePeoplePreferences();
    updateSettingsModal();
    refresh({ preserveScroll: true });
    if (button && canAnimate()) {
      window.gsap.fromTo(button, { scale: 0.8, rotate: -7 }, { scale: 1, rotate: 0, duration: 0.3, ease: "back.out(2)", clearProps: "transform" });
    }
  }

  function classesForDay(name, day, date = state.selectedDate) {
    return Core.meetings(peopleMap()[name] || { classes: [] }, day, date);
  }

  function currentClass(name, day, minute) {
    for (const c of classesForDay(name, day)) {
      if (toMinutes(c.start) <= minute && minute < toMinutes(c.end)) return c;
    }
    return null;
  }

  function isFree(name, day, minute) {
    return personAvailability(name, day, minute).status === "free";
  }

  function previousClasses(name, day, minute) {
    return classesForDay(name, day).filter(c => toMinutes(c.end) <= minute);
  }

  function nextClassToday(name, day, minute) {
    return classesForDay(name, day).find(c => toMinutes(c.start) > minute) || null;
  }

  function nextClassInWeek(name, day, minute) {
    const selectedIndex = ALL_DAYS.indexOf(day);
    if (selectedIndex < 0) return null;
    for (let daysAhead = 0; daysAhead < 8; daysAhead++) {
      const date = Core.addDays(state.selectedDate, daysAhead);
      const candidateDay = ALL_DAYS[(selectedIndex + daysAhead) % 7];
      for (const c of classesForDay(name, candidateDay, date)) {
        if (daysAhead === 0 && toMinutes(c.start) <= minute) continue;
        return { day: candidateDay, classItem: c, daysAhead };
      }
    }
    return null;
  }

  function setLiveValues() {
    const now = new Date();
    state.selectedDate = Core.localDate(now);
    state.selectedDay = Core.dayForDate(state.selectedDate);
    state.selectedTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    els.daySelect.value = state.selectedDay;
    els.timeInput.value = state.selectedTime;
    document.getElementById("dateInput").value = state.selectedDate;
  }

  function syncLiveControls() {
    els.liveToggle.checked = state.useLiveTime;
    els.daySelect.disabled = state.useLiveTime;
    document.getElementById("dateInput").disabled = state.useLiveTime;
    els.timeInput.disabled = state.useLiveTime;
  }

  function selectedMoment() {
    const date = document.getElementById("dateInput").value;
    const day = Core.dayForDate(date), time = els.timeInput.value, minute = toMinutes(time);
    if (!day || !Number.isFinite(minute)) return null;
    state.selectedDate = date; state.selectedDay = day; state.selectedTime = time;
    els.daySelect.value = day;
    return { date, day, minute };
  }

  function visiblePeople(day, minute) {
    const people = Object.keys(peopleMap()).sort(comparePeopleNames);
    const free = people.filter(name => isFree(name, day, minute));
    const busy = people.filter(name => personAvailability(name, day, minute).status === "busy");
    const query = document.getElementById("peopleSearch").value.trim().toLocaleLowerCase();
    const group = groups.find(item => item.id === document.getElementById("groupFilter").value);
    const minimum = Number(document.getElementById("minimumFree").value);
    const visible = people.filter(name => {
      if (query && !`${name} ${displayName(name)}`.toLocaleLowerCase().includes(query)) return false;
      if (group && !group.members.includes(name)) return false;
      const availability = personAvailability(name, day, minute);
      if (availability.status === "free") return availability.duration >= minimum;
      return state.showEveryone;
    }).sort((a, b) => {
      const pin = Number(state.pinnedPeople.has(b)) - Number(state.pinnedPeople.has(a));
      if (pin) return pin;
      const rank = name => ({ free: 0, busy: 1, unknown: 2 }[personAvailability(name, day, minute).status]);
      return rank(a) - rank(b) || comparePeopleNames(a, b);
    });
    return { free, busy, visible };
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    if (canAnimate()) {
      window.gsap.killTweensOf(els.toast);
      window.gsap.fromTo(
        els.toast,
        { opacity: 0, y: 8, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "power2.out", clearProps: "transform" }
      );
    }
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      if (canAnimate()) {
        window.gsap.to(els.toast, {
          opacity: 0,
          y: 5,
          duration: 0.15,
          ease: "power1.in",
          onComplete: () => {
            els.toast.hidden = true;
            window.gsap.set(els.toast, { clearProps: "opacity,transform" });
          },
        });
      } else {
        els.toast.hidden = true;
      }
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
    if (state.useLiveTime) setLiveValues();
    syncLiveControls();
    personNodes.clear(); detailSignature = "empty";
    document.querySelector(".main-grid").classList.add("no-data");
    document.querySelector(".people-filters").hidden = true;
    byId("planButton").disabled = true;
    els.peopleHeading.textContent = "Who's Free?";
    els.freeCount.textContent = "Local only";
    els.statusLine.textContent = state.loadError
      ? "Schedule data needs your attention."
      : "Add a schedule PDF or import a shared database.";
    els.viewToggleButton.disabled = true;
    els.peopleList.replaceChildren();

    const fragment = els.dataSetupTemplate.content.cloneNode(true);
    fragment.querySelector(".try-demo").addEventListener("click", startDemo);
    const title = fragment.querySelector(".data-setup-title");
    const message = fragment.querySelector(".data-setup-message");

    if (state.loadError) {
      title.textContent = "Couldn't load that file";
      message.textContent = state.loadError;
    }

    fragment.querySelector(".choose-schedules").addEventListener("click", chooseScheduleFile);
    fragment.querySelector(".add-pdf").addEventListener("click", chooseSchedulePdf);
    els.peopleList.append(fragment);
    renderEmptyDetail();
  }

  function chooseScheduleFile() {
    // Clearing the value allows choosing the same file again after replacing it.
    els.scheduleFileInput.value = "";
    els.scheduleFileInput.click();
  }

  function chooseSchedulePdf() {
    // A real file picker must be opened directly from the user's click/tap.
    // showPicker() is more reliable in Safari/iOS PWAs; click() remains the fallback.
    els.schedulePdfInput.value = "";
    try {
      if (typeof els.schedulePdfInput.showPicker === "function") {
        els.schedulePdfInput.showPicker();
        return;
      }
    } catch (error) {
      console.warn("showPicker() was unavailable; falling back to click().", error);
    }
    els.schedulePdfInput.click();
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
    const result = await deviceStore.read();
    state.storageBackend = deviceStore.backend;
    return result;
  }

  async function saveLocalScheduleRecord(record) {
    try { return await deviceStore.save(record); }
    finally { state.storageBackend = deviceStore.backend; }
  }

  async function deleteLocalScheduleRecord() {
    await deviceStore.remove(); return true;
  }

  function validateData(data) { Core.normalizeDatabase(data); }

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

  function makeCollectionMeta(data, label = "Local schedule collection") {
    return {
      filename: label,
      importedAt: new Date().toISOString(),
      peopleCount: Object.keys(data.people || {}).length,
    };
  }

  async function persistCurrentDatabase(label = "Local schedule collection") {
    if (state.isDemo) throw new Error("Exit demo mode before saving schedules.");
    state.data = Core.normalizeDatabase(state.data);
    const meta = makeCollectionMeta(state.data, label);
    const record = { data: state.data, meta };
    let storageWarning = null;
    try {
      await saveLocalScheduleRecord(record);
      await requestPersistentStorage();
    } catch (error) {
      storageWarning = error.message;
    }
    state.hasData = true;
    state.scheduleMeta = meta;
    state.loadError = null;
    updateScheduleModal();
    updateSettingsModal();
    refresh({ preserveScroll: true });
    return storageWarning;
  }

  function setParserStatus(message, tone = "") {
    els.parserStatus.textContent = message || "";
    els.parserStatus.dataset.tone = tone;
  }

  async function parsePdfWithNameFallback(file) {
    try {
      return await window.WhosFreeParser.parseSchedulePdf(file);
    } catch (error) {
      if (error?.code !== "NAME_NOT_FOUND") throw error;
      const fallback = window.prompt(`Who's schedule is ${file.name}? Enter the student's name:`);
      if (!fallback?.trim()) throw new Error("The student's name is required to add this schedule.");
      return window.WhosFreeParser.parseSchedulePdf(file, { nameOverride: fallback.trim() });
    }
  }

  async function handleSchedulePdfs(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || state.isParsing) return;
    if (state.isDemo) { event.target.value = ""; showToast("Exit demo mode before importing schedules"); return; }
    if (els.scheduleModal.hidden) openScheduleModal();
    state.isParsing = true; updateScheduleModal();
    const entries = [], failures = [];
    try {
      if (!window.WhosFreeParser?.parseSchedulePdf) throw new Error("The PDF parser did not load. Refresh and try again.");
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setParserStatus(`Reading ${file.name} (${index + 1} of ${files.length})…`, "working");
        try {
          if (file.size > 25 * 1024 * 1024) throw new Error("Choose a PDF smaller than 25 MB.");
          const parsed = await parsePdfWithNameFallback(file);
          entries.push({ name: Core.cleanName(parsed.name), person: Core.normalizePerson(parsed.person, parsed.name), warnings: parsed.warnings || [], originalName: null });
        } catch (error) { failures.push(`${file.name}: ${error.message}`); track("app_import_failed", { source: "pdf" }); }
      }
      setParserStatus(failures.length ? failures.join("\n") : "Ready to review. Nothing has been saved yet.", failures.length ? "warning" : "success");
      if (entries.length) beginReview(entries, "pdf", failures);
      else if (!failures.length) setParserStatus("No schedules were found.", "error");
    } catch (error) { setParserStatus(error.message, "error"); track("app_import_failed", { source: "pdf" }); }
    finally { state.isParsing = false; updateScheduleModal(); event.target.value = ""; }
  }

  function databaseJsonText(names = Object.keys(peopleMap()), includeCommitments = false) {
    return `${JSON.stringify(Core.exportDatabase(state.data, names, { commitments: includeCommitments, appUrl: APP_URL }), null, 2)}\n`;
  }

  function downloadDatabaseFile(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "schedules.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function shareSchedules() {
    if (!state.hasData || state.isDemo) return;
    renderChecklist(document.getElementById("sharePeople"), Object.keys(peopleMap()).sort(comparePeopleNames), []);
    document.getElementById("shareCommitments").checked = false;
    updateShareSummary(); showDialog(document.getElementById("shareModal"));
  }

  async function handleLocalScheduleFile(event) {
    const [file] = event.target.files || [];
    if (!file || state.isParsing) return;
    if (state.isDemo) { event.target.value = ""; showToast("Exit demo mode before importing schedules"); return; }
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a schedule file smaller than 10 MB.");
      const imported = Core.normalizeDatabase(JSON.parse(await file.text()));
      const entries = Object.entries(imported.people).map(([name, person]) => ({ name, person, warnings: [], originalName: null }));
      if (!entries.length) throw new Error("This file has no schedules to import.");
      beginReview(entries, "json");
    } catch (error) { setParserStatus(`Could not import this file: ${error.message}`, "error"); openScheduleModal(); track("app_import_failed", { source: "json" }); }
    finally { event.target.value = ""; }
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
      state.data = Core.normalizeDatabase(record.data);
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

  async function removePerson(name) {
    if (!state.hasData || state.isDemo || !Object.hasOwn(peopleMap(), name)) return;
    const label = displayName(name);
    if (!window.confirm(`Remove ${label} from this device?`)) return;
    const people = { ...peopleMap() }; delete people[name];
    if (!Object.keys(people).length) {
      try { await deleteLocalScheduleRecord(); } catch (error) { showToast(error.message); return; }
      state.data = { people: {} }; state.hasData = false; state.scheduleMeta = null; state.loadError = null;
    } else state.data = { schema_version: 2, people };
    state.mutedPeople.delete(name); state.pinnedPeople.delete(name); delete state.nicknames[name];
    saveNotificationSettings(); savePeoplePreferences();
    groups = groups.map(group => ({ ...group, members: group.members.filter(member => member !== name) })); saveGroups(); syncGroupOptions();
    if (state.selectedPerson === name) state.selectedPerson = null;
    let warning = null;
    if (state.hasData) warning = await persistCurrentDatabase("Local schedule collection"); else renderDataSetup();
    updateScheduleModal(); updateSettingsModal(); showToast(warning || `Removed ${label}`);
  }

  function renderPeopleManager() {
    const names = Object.keys(peopleMap()).sort(comparePeopleNames);
    els.peopleManagerCount.textContent = String(names.length);
    els.peopleManagerList.replaceChildren();

    if (!names.length) {
      const empty = document.createElement("p");
      empty.className = "people-manager-empty";
      empty.textContent = "No people added yet.";
      els.peopleManagerList.append(empty);
      return;
    }

    for (const name of names) {
      const row = document.createElement("div");
      row.className = "people-manager-row";

      const copy = document.createElement("div");
      copy.className = "people-manager-copy";
      const title = document.createElement("div");
      title.className = "people-manager-name";
      title.textContent = displayName(name);
      const detail = document.createElement("div");
      detail.className = "people-manager-meta";
      const person = peopleMap()[name] || {};
      const identity = displayName(name) !== name ? `${name} · ` : "";
      detail.textContent = `${identity}${Array.isArray(person.classes) ? person.classes.length : 0} class meetings${person.source_file ? ` · ${person.source_file}` : ""}`;
      copy.append(title, detail);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mini-danger-button";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${displayName(name)}`);
      removeButton.addEventListener("click", () => removePerson(name));

      const actions = document.createElement("div"); actions.className = "people-manager-actions";
      const editButton = makeButton("Edit", "secondary-button compact", () => editPerson(name));
      editButton.setAttribute("aria-label", `Edit schedule for ${displayName(name)}`);
      editButton.disabled = state.isDemo || state.isParsing; removeButton.disabled = state.isDemo || state.isParsing;
      actions.append(editButton, removeButton); row.append(copy, actions);
      els.peopleManagerList.append(row);
    }
  }

  function updateScheduleModal() {
    const peopleCount = Object.keys(peopleMap()).length;
    renderPeopleManager();
    els.addSchedulePdfButton.disabled = state.isParsing || state.isDemo;
    els.importSchedulesButton.disabled = state.isParsing || state.isDemo;
    els.shareSchedulesButton.disabled = state.isParsing || state.isDemo || !state.hasData || peopleCount === 0;
    els.removeSchedulesButton.disabled = state.isParsing || state.isDemo || !state.hasData;

    if (state.isDemo) {
      els.scheduleStorageStatus.innerHTML = '<div class="storage-status-label">Fictional preview</div><div class="storage-status-value">Demo schedules are not saved</div><div class="storage-status-meta">Exit demo to add or manage your own schedules.</div>';
    } else if (state.hasData) {
      const meta = state.scheduleMeta || {};
      els.scheduleStorageStatus.innerHTML = `
        <div class="storage-status-row">
          <div>
            <div class="storage-status-label">Local schedule database</div>
            <div class="storage-status-value"></div>
            <div class="storage-status-meta"></div>
          </div>
          <span class="local-badge">On device</span>
        </div>`;
      els.scheduleStorageStatus.querySelector(".storage-status-value").textContent = meta.filename || "Local schedule collection";
      els.scheduleStorageStatus.querySelector(".storage-status-meta").textContent = `${peopleCount} ${peopleCount === 1 ? "person" : "people"} · ${formatImportedAt(meta.importedAt)}`;
      els.importSchedulesButton.textContent = "Import another schedules.json";
    } else {
      els.scheduleStorageStatus.innerHTML = `
        <div class="storage-status-row">
          <div>
            <div class="storage-status-label">This device</div>
            <div class="storage-status-value">No schedules stored</div>
            <div class="storage-status-meta">Add a PDF to create a database automatically, or import schedules.json.</div>
          </div>
        </div>`;
      els.importSchedulesButton.textContent = "Import schedules.json";
    }
    updateSettingsModal();
  }

  function openScheduleModal() {
    updateScheduleModal(); showDialog(els.scheduleModal);
  }

  function closeScheduleModal() { closeDialog(els.scheduleModal); }

  async function removeSchedules() {
    if (!state.hasData) return;
    const confirmed = window.confirm("Remove the schedules stored in this browser? You can add the JSON file again later.");
    if (!confirmed) return;

    try { await deleteLocalScheduleRecord(); } catch (error) { showToast(error.message); return; }
    state.data = { people: {} };
    state.hasData = false;
    state.scheduleMeta = null;
    state.selectedPerson = null;
    state.loadError = null;
    closeScheduleModal();
    renderDataSetup();
    updateScheduleModal();
    updateSettingsModal();
    showToast("Removed local schedule data");
  }

  function renderPersonCard(name, day, minute) {
    const button = document.createElement("button");
    button.type = "button"; button.dataset.person = name;
    const dot = document.createElement("span"); dot.className = "person-status-dot"; dot.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span"); copy.className = "person-copy";
    const title = document.createElement("span"); title.className = "person-name";
    const detail = document.createElement("span"); detail.className = "person-detail";
    copy.append(title, detail);
    const badge = document.createElement("span"); badge.className = "status-badge";
    button.append(dot, copy, badge);
    button.addEventListener("click", () => {
      state.selectedPerson = name; refresh({ preserveScroll: true });
      track("app_friend_selected");
      if (window.matchMedia("(max-width: 880px)").matches) openMobileDetail(button);
    });
    updatePersonCard(button, name, day, minute);
    return button;
  }

  function renderEmptyDetail() {
    state.lastDetailPerson = null;
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
      markerLabel.dataset.edge = markerLeft < 12 ? "start" : markerLeft > 88 ? "end" : "center";
      markerLabel.textContent = state.useLiveTime ? "now" : formatTime(state.selectedTime);
      timeline.append(marker, markerLabel);
    }

    card.append(timeline);
    return card;
  }

  function renderDetail(name, day, minute) {
    if (!peopleMap()[name]) { state.selectedPerson = null; renderEmptyDetail(); return; }
    const availability = personAvailability(name, day, minute), events = classesForDay(name, day);
    const signature = JSON.stringify([name, displayName(name), state.selectedDate, availability.status, availability.current, availability.next, availability.holiday, events, events.filter(item => toMinutes(item.end) <= minute).length]);
    if (signature === detailSignature) { updateDetailClock(name, day, minute); return; }
    detailSignature = signature;
    els.detailPanel.replaceChildren();
    const header = document.createElement("div"); header.className = "detail-header";
    const actions = document.createElement("div"); actions.className = "detail-top-actions";
    const back = makeButton("Back to friends", "secondary-button compact detail-back", closeMobileDetail);
    const edit = makeButton("Edit schedule", "secondary-button compact", () => editPerson(name)); edit.disabled = state.isDemo;
    actions.append(back, edit);
    const title = document.createElement("h2"); title.id = "detailHeading"; title.textContent = displayName(name);
    const status = document.createElement("p"); status.className = "detail-live-status";
    header.append(actions, title, status);
    els.detailPanel.append(header, timelineCard(name, day, minute));
    const explanation = document.createElement("p"); explanation.className = "availability-note";
    explanation.textContent = availability.status === "unknown" ? "This date is outside the saved term. Update the schedule before making a plan." : availability.holiday ? "A no-class date is saved. Personal commitments still count." : "Based on saved classes and commitments; confirm whether they’re available to meet.";
    els.detailPanel.append(explanation);
    const list = document.createElement("ul"); list.className = "day-meetings"; list.setAttribute("aria-label", "Full day schedule");
    for (const item of events) {
      const row = document.createElement("li");
      const times = document.createElement("strong"); times.textContent = `${formatTime(item.start)}–${formatTime(item.end)}`;
      const copy = document.createElement("span"); copy.textContent = classLabel(item);
      const kind = document.createElement("small"); kind.textContent = item.kind === "commitment" ? "Personal commitment" : "Class";
      row.append(times, copy, kind); list.append(row);
    }
    if (events.length) els.detailPanel.append(list);
    else els.detailPanel.append(detailCard("This day", "No saved classes or commitments", ""));
    const next = availability.next || nextClassInWeek(name, day, minute)?.classItem;
    if (next) els.detailPanel.append(detailCard("Next saved meeting", `${formatTime(next.start)}–${formatTime(next.end)}`, `${next.day} · ${classLabel(next)}`));
    updateDetailClock(name, day, minute);
    animateDetailIfNeeded(name); state.lastDetailPerson = name;
  }

  function refresh({ preserveScroll = false } = {}) {
    if (!state.hasData || state.loadError) { renderDataSetup(); return; }
    els.viewToggleButton.disabled = false;
    document.querySelector(".main-grid").classList.remove("no-data");
    document.querySelector(".people-filters").hidden = false;
    if (state.useLiveTime) setLiveValues();
    syncLiveControls();
    const moment = selectedMoment();
    if (!moment) { showToast("Choose a valid date and time."); return; }
    const { day, minute } = moment, { free, busy, visible } = visiblePeople(day, minute);
    const total = Object.keys(peopleMap()).length, oldScroll = els.peopleList.scrollTop;
    els.peopleHeading.textContent = state.showEveryone ? "Everyone" : "No class now";
    els.viewToggleButton.textContent = state.showEveryone ? "Show only free" : "Show everyone";
    const count = `${free.length} of ${total} free`;
    if (els.freeCount.textContent !== count) { els.freeCount.textContent = count; animateCountIfChanged(count); }
    state.lastFreeCountText = count;
    const summary = `${state.isDemo ? "Demo · " : ""}${state.useLiveTime ? "Live · " : ""}${day}, ${prettyDate(state.selectedDate)} · ${formatTime(state.selectedTime)} · ${busy.length} busy`;
    if (els.statusLine.textContent !== summary) els.statusLine.textContent = summary;
    const wanted = new Set(visible);
    for (const [name, entry] of personNodes) if (!wanted.has(name)) { entry.row.remove(); personNodes.delete(name); }
    for (const empty of els.peopleList.querySelectorAll(".empty-list, .data-setup")) empty.remove();
    if (!visible.length) {
      els.peopleList.replaceChildren(createEmptyList(total ? "No friends match" : "Add a schedule", "Try Show everyone, a shorter break, or another group or time."));
    } else {
      visible.forEach((name, index) => {
        let entry = personNodes.get(name);
        if (!entry) {
          const row = document.createElement("div"); row.setAttribute("role", "listitem");
          const button = renderPersonCard(name, day, minute); row.append(button);
          entry = { row, button }; personNodes.set(name, entry);
        } else updatePersonCard(entry.button, name, day, minute);
        const atPosition = els.peopleList.children[index];
        if (atPosition !== entry.row) els.peopleList.insertBefore(entry.row, atPosition || null);
      });
    }
    if (preserveScroll) els.peopleList.scrollTop = oldScroll;
    if (state.selectedPerson && peopleMap()[state.selectedPerson]) renderDetail(state.selectedPerson, day, minute);
    else if (detailSignature !== "empty") { detailSignature = "empty"; renderEmptyDetail(); }
    document.getElementById("planButton").disabled = total === 0;
  }

  function bindEvents() {
    els.lightThemeButton.addEventListener("click", () => {
      applyTheme("light");
      if (canAnimate()) window.gsap.fromTo(els.lightThemeButton, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: "back.out(1.7)", clearProps: "transform" });
    });
    els.darkThemeButton.addEventListener("click", () => {
      applyTheme("dark");
      if (canAnimate()) window.gsap.fromTo(els.darkThemeButton, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: "back.out(1.7)", clearProps: "transform" });
    });
    els.colorThemeGrid.addEventListener("click", event => {
      const button = event.target.closest("[data-color-theme]");
      if (!button) return;
      applyAccentTheme(button.dataset.colorTheme, true);
    });
    els.scheduleDataButton.addEventListener("click", openScheduleModal);
    els.settingsButton.addEventListener("click", openSettingsModal);
    els.closeScheduleModal.addEventListener("click", closeScheduleModal);
    els.closeSettingsModal.addEventListener("click", closeSettingsModal);
    els.breakNotificationToggle.addEventListener("change", handleNotificationToggle);
    els.testNotificationButton.addEventListener("click", sendTestNotification);
    els.addSchedulePdfButton.addEventListener("click", chooseSchedulePdf);
    els.importSchedulesButton.addEventListener("click", chooseScheduleFile);
    els.shareSchedulesButton.addEventListener("click", shareSchedules);
    els.removeSchedulesButton.addEventListener("click", removeSchedules);
    els.scheduleFileInput.addEventListener("change", handleLocalScheduleFile);
    els.schedulePdfInput.addEventListener("change", handleSchedulePdfs);

    els.scheduleModal.addEventListener("click", event => {
      if (event.target === els.scheduleModal) closeScheduleModal();
    });

    els.settingsModal.addEventListener("click", event => {
      if (event.target === els.settingsModal) closeSettingsModal();
    });



    els.liveToggle.addEventListener("change", () => {
      state.useLiveTime = els.liveToggle.checked;
      if (state.useLiveTime) setLiveValues();
      syncLiveControls();
      refresh();
    });

    els.daySelect.addEventListener("change", () => {
      state.selectedDay = els.daySelect.value;
      const date = document.getElementById("dateInput").value || Core.localDate();
      const delta = ALL_DAYS.indexOf(state.selectedDay) - ALL_DAYS.indexOf(Core.dayForDate(date));
      document.getElementById("dateInput").value = Core.addDays(date, delta);
      refresh();
    });

    els.timeInput.addEventListener("change", () => {
      state.selectedTime = els.timeInput.value;
      refresh();
    });

    els.refreshButton.addEventListener("click", () => {
      refresh();
      animateRefreshFeedback();
    });

    els.viewToggleButton.addEventListener("click", () => {
      state.showEveryone = !state.showEveryone;
      refresh();
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.useLiveTime) refresh();
      if (!document.hidden) checkBreakNotifications();
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || (location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname))) return;
    navigator.serviceWorker.register("./service-worker.js?v=10.1", { updateViaCache: "none" }).then(registration => {
      workerRegistration = registration;
      const offerUpdate = () => { if (registration.waiting && navigator.serviceWorker.controller) document.getElementById("updateBanner").hidden = false; };
      offerUpdate();
      registration.addEventListener("updatefound", () => registration.installing?.addEventListener("statechange", offerUpdate));
      registration.update().catch(() => {});
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloadForUpdate) location.reload(); });
  }

  function init() {
    initFeatures();
    const savedNotificationSettings = loadNotificationSettings();
    state.notificationsEnabled = savedNotificationSettings.enabled;
    state.mutedPeople = new Set(savedNotificationSettings.mutedPeople);

    const savedPeoplePreferences = loadPeoplePreferences();
    state.nicknames = { ...savedPeoplePreferences.nicknames };
    state.pinnedPeople = new Set(savedPeoplePreferences.pinnedPeople);
    state.accentTheme = loadAccentTheme();

    if (!("Notification" in window) || Notification.permission !== "granted") {
      state.notificationsEnabled = false;
      saveNotificationSettings();
    }

    applyTheme(state.theme);
    applyAccentTheme(state.accentTheme, false);
    setLiveValues();
    syncLiveControls();
    bindEvents();
    updateScheduleModal();
    updateSettingsModal();
    registerServiceWorker();
    requestAnimationFrame(animateAppEntrance);

    loadSchedulesFromDevice().then(() => {
      deviceLoaded = true;
      groups = loadGroups(); syncGroupOptions();
      cleanPeoplePreferences();
      updateSettingsModal();
      checkBreakNotifications();
    });

    window.setInterval(() => {
      if (state.useLiveTime && !document.hidden && state.hasData && !state.loadError) {
        refresh({ preserveScroll: true });
      }
      checkBreakNotifications();
    }, 15000);
  }

  const Core = window.WhosFreeCore;
  const deviceStore = window.WhosFreeStorage.createStore({
    readPrimary: () => idbGet(LOCAL_SCHEDULE_KEY), writePrimary: record => idbSet(LOCAL_SCHEDULE_KEY, record), deletePrimary: () => idbDelete(LOCAL_SCHEDULE_KEY),
    readFallback: fallbackRead, writeFallback: fallbackWrite, deleteFallback: fallbackDelete,
  });
  const personNodes = new Map(), dialogs = [];
  const detailHome = document.createComment("Friend detail home");
  const GROUPS_KEY = "whos-free-groups-v1", GA_ID = "G-1L4Z6JCNVV";
  let detailSignature = "", lastNotificationCheck = new Date(Date.now() - 60000), notificationCheckInFlight = false;
  let groups = [], editingGroupId = null, demoSnapshot = null, deviceLoaded = false;
  let reviewEntries = [], reviewSource = "", reviewFailures = [], workerRegistration = null, reloadForUpdate = false;
  let analyticsLoaded = false, deferredInstallPrompt = null;
  state.isDemo = false;

  function byId(id) { return document.getElementById(id); }
  function setText(element, value) { if (element && element.textContent !== value) element.textContent = value; }
  function makeButton(label, className, handler) {
    const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = label;
    if (handler) button.addEventListener("click", handler); return button;
  }
  function prettyDate(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString([], { month: "short", day: "numeric" });
  }
  function durationText(minutes) {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m} min`;
  }
  function personAvailability(name, day, minute) { return Core.availability(peopleMap()[name] || { classes: [] }, day, minute, state.selectedDate); }
  function availabilityCopy(availability) {
    if (availability.status === "unknown") return "Check term dates";
    if (availability.status === "busy") return `${availability.current.kind === "commitment" ? "Busy" : "In class"} until ${formatTime(Core.time(availability.until))}`;
    if (availability.next) return `Free for ${durationText(availability.duration)}`;
    return availability.holiday ? "No classes today" : availability.hasClasses ? "Done with classes" : "No class today";
  }
  function updatePersonCard(button, name, day, minute) {
    const availability = personAvailability(name, day, minute), selected = name === state.selectedPerson, pinned = state.pinnedPeople.has(name);
    button.className = `person-card${selected ? " selected" : ""}${pinned ? " pinned" : ""}`;
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector(".person-status-dot").className = `person-status-dot${availability.status === "busy" ? " busy" : availability.status === "unknown" ? " unknown" : ""}`;
    setText(button.querySelector(".person-name"), `${displayName(name)}${pinned ? " 📌" : ""}`);
    const detail = availability.current ? classLabel(availability.current) : availability.next ? `Next ${formatTime(availability.next.start)} · ${classLabel(availability.next)}` : availability.status === "unknown" ? "Saved schedule does not cover this date" : "No more saved meetings today";
    setText(button.querySelector(".person-detail"), detail);
    const badge = button.querySelector(".status-badge");
    badge.className = `status-badge ${availability.status === "busy" ? "busy" : availability.status === "unknown" ? "unknown" : "free"}`;
    setText(badge, availabilityCopy(availability));
  }
  function updateDetailClock(name, day, minute) {
    setText(els.detailPanel.querySelector(".detail-live-status"), availabilityCopy(personAvailability(name, day, minute)));
    const timeline = els.detailPanel.querySelector(".timeline");
    if (!timeline) return;
    const classes = classesForDay(name, day);
    const first = Math.min(...classes.map(c => toMinutes(c.start))), last = Math.max(...classes.map(c => toMinutes(c.end)));
    const start = Math.max(0, first - 20), end = Math.min(1440, last + 20), span = Math.max(end - start, 60);
    let marker = timeline.querySelector(".timeline-marker"), label = timeline.querySelector(".timeline-marker-label");
    if (minute < start || minute > end) { marker?.remove(); label?.remove(); return; }
    if (!marker) { marker = document.createElement("div"); marker.className = "timeline-marker"; timeline.append(marker); }
    if (!label) { label = document.createElement("div"); label.className = "timeline-marker-label"; timeline.append(label); }
    const left = Math.max(0, Math.min(100, (minute - start) / span * 100));
    marker.style.left = label.style.left = `${left}%`; label.dataset.edge = left < 12 ? "start" : left > 88 ? "end" : "center";
    setText(label, state.useLiveTime ? "now" : formatTime(state.selectedTime));
  }

  function showDialog(element, opener = document.activeElement) {
    if (dialogs.some(item => item.element === element)) return;
    const previous = dialogs[dialogs.length - 1]; if (previous) previous.element.hidden = true;
    element.hidden = false;
    const panel = element.querySelector('[role="dialog"]') || element.firstElementChild;
    dialogs.push({ element, opener });
    document.querySelector(".app-shell").inert = true; document.body.style.overflow = "hidden";
    if (panel) { panel.tabIndex = -1; panel.focus(); animateModalOpen(element, panel); }
  }
  function closeDialog(element = dialogs[dialogs.length - 1]?.element) {
    const current = dialogs[dialogs.length - 1]; if (!current || current.element !== element) return;
    current.element.hidden = true; dialogs.pop();
    if (current.element.id === "mobileDetailModal") {
      detailHome.after(els.detailPanel); els.detailPanel.removeAttribute("role"); els.detailPanel.removeAttribute("aria-modal"); els.detailPanel.removeAttribute("aria-labelledby"); els.detailPanel.removeAttribute("tabindex");
    }
    const previous = dialogs[dialogs.length - 1];
    if (previous) previous.element.hidden = false;
    else { document.querySelector(".app-shell").inert = false; document.body.style.overflow = ""; }
    if (current.opener?.isConnected && !current.opener.closest("[hidden]")) current.opener.focus();
    else if (previous) previous.element.querySelector('[role="dialog"]')?.focus();
  }
  function closeAllDialogs() { while (dialogs.length) closeDialog(); }
  function openMobileDetail(opener) {
    const modal = byId("mobileDetailModal");
    modal.append(els.detailPanel); els.detailPanel.setAttribute("role", "dialog"); els.detailPanel.setAttribute("aria-modal", "true"); els.detailPanel.setAttribute("aria-labelledby", "detailHeading");
    showDialog(modal, opener);
  }
  function closeMobileDetail() { closeDialog(byId("mobileDetailModal")); }
  function trapDialog(event) {
    const current = dialogs[dialogs.length - 1]; if (!current) return;
    if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
    if (event.key !== "Tab") return;
    const controls = [...current.element.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex="0"]')].filter(element => element.getClientRects().length && !element.closest("[hidden]"));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
  }

  function renderChecklist(container, names, selected = []) {
    container.replaceChildren();
    if (!names.length) { const p = document.createElement("p"); p.className = "settings-note"; p.textContent = "Add a schedule first, or try the demo."; container.append(p); return; }
    for (const name of names) {
      const label = document.createElement("label"); label.className = "checklist-person";
      const input = document.createElement("input"); input.type = "checkbox"; input.value = name; input.checked = selected.includes(name);
      const copy = document.createElement("span"); copy.textContent = displayName(name);
      label.append(input, copy); container.append(label);
    }
  }
  function checkedNames(container) { return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value); }
  function loadGroups() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.members)).slice(0, 50).map(item => ({ id: item.id, name: item.name.slice(0, 40), members: item.members.filter(name => Object.hasOwn(peopleMap(), name)) })) : [];
    } catch { return []; }
  }
  function saveGroups() { if (!state.isDemo) { try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch { showToast("Groups could not be saved on this device"); } } }
  function syncGroupOptions() {
    for (const [id, caption] of [["groupFilter", "All friends"], ["planGroup", "Choose friends below"]]) {
      const select = byId(id), before = select.value;
      select.replaceChildren(new Option(caption, ""));
      for (const group of groups) select.append(new Option(group.name, group.id));
      if ([...select.options].some(option => option.value === before)) select.value = before;
    }
  }
  function renderGroups() {
    const list = byId("groupsList"); list.replaceChildren();
    for (const group of groups) {
      const row = document.createElement("div"); row.className = "saved-group";
      const name = document.createElement("span"); name.textContent = `${group.name} · ${group.members.length} friends`;
      const edit = makeButton("Edit", "secondary-button compact", () => { editingGroupId = group.id; byId("groupName").value = group.name; renderChecklist(byId("groupMembers"), Object.keys(peopleMap()).sort(comparePeopleNames), group.members); byId("groupName").focus(); });
      const remove = makeButton("Remove", "secondary-button compact", () => { groups = groups.filter(item => item.id !== group.id); saveGroups(); syncGroupOptions(); renderGroups(); refresh({ preserveScroll: true }); });
      edit.setAttribute("aria-label", `Edit group ${group.name}`); remove.setAttribute("aria-label", `Remove group ${group.name}`);
      row.append(name, edit, remove); list.append(row);
    }
    editingGroupId = null; byId("groupName").value = ""; byId("groupStatus").textContent = "";
    renderChecklist(byId("groupMembers"), Object.keys(peopleMap()).sort(comparePeopleNames));
  }
  function saveGroup() {
    const name = byId("groupName").value.trim(), members = checkedNames(byId("groupMembers"));
    if (!name || !members.length) { byId("groupStatus").textContent = "Name the group and choose at least one friend."; return; }
    if (groups.some(group => group.name.toLowerCase() === name.toLowerCase() && group.id !== editingGroupId)) { byId("groupStatus").textContent = "Use a different group name or edit the existing group."; return; }
    const group = { id: editingGroupId || (crypto.randomUUID?.() || `group-${Date.now()}`), name, members };
    groups = [...groups.filter(item => item.id !== group.id), group]; saveGroups(); syncGroupOptions(); renderGroups();
    byId("groupStatus").textContent = "Group saved."; refresh({ preserveScroll: true });
  }
  function openPlanner() {
    if (!state.hasData) { showToast("Try the demo or add schedules first"); return; }
    syncGroupOptions(); byId("planGroup").value = byId("groupFilter").value;
    const group = groups.find(item => item.id === byId("planGroup").value);
    const initial = group?.members || [...state.pinnedPeople];
    renderChecklist(byId("planPeople"), Object.keys(peopleMap()).sort(comparePeopleNames), initial);
    byId("planDate").value = state.selectedDate || Core.localDate(); byId("planResults").replaceChildren(); byId("planStatus").textContent = "";
    showDialog(byId("planModal"));
  }
  function findSharedBreaks() {
    const names = checkedNames(byId("planPeople")), date = byId("planDate").value;
    const start = toMinutes(byId("planStart").value), end = toMinutes(byId("planEnd").value), duration = Number(byId("planDuration").value);
    byId("planResults").replaceChildren();
    if (!names.length || !Core.validDate(date) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) { byId("planStatus").textContent = "Choose friends, a date, and an end time after the start time."; return; }
    const dates = Array.from({ length: Number(byId("planHorizon").value) }, (_, i) => Core.addDays(date, i));
    const results = Core.commonWindows(peopleMap(), names, dates, start, end, duration);
    const skipped = dates.filter(day => names.some(name => !Core.termActive(peopleMap()[name], day))).length;
    byId("planStatus").textContent = `${results.length ? `${results.length} shared ${results.length === 1 ? "window" : "windows"}` : "No shared time found. Try different hours or a shorter break."}${skipped ? ` · ${skipped} dates outside a saved term were excluded.` : ""}`;
    for (const result of results) {
      const button = makeButton("", "plan-result", () => {
        state.useLiveTime = false; state.selectedDate = result.date; state.selectedTime = result.start;
        byId("dateInput").value = result.date; els.timeInput.value = result.start; state.showEveryone = true;
        byId("peopleSearch").value = ""; byId("groupFilter").value = ""; byId("minimumFree").value = "0";
        closeAllDialogs(); refresh();
      });
      const day = document.createElement("strong"); day.textContent = `${result.day} · ${prettyDate(result.date)}`;
      const times = document.createElement("span"); times.textContent = `${formatTime(result.start)}–${formatTime(result.end)}`;
      const length = document.createElement("small"); length.textContent = `${durationText(result.duration)} together · View this time`;
      button.append(day, times, length); byId("planResults").append(button);
    }
    track("app_shared_break_search", { count_bucket: countBucket(names.length) });
  }

  function startDemo() {
    if (state.isDemo) { closeAllDialogs(); return; }
    if (!deviceLoaded) { showToast("Your saved schedules are still loading. Try again in a moment."); return; }
    demoSnapshot = { data: state.data, hasData: state.hasData, scheduleMeta: state.scheduleMeta, loadError: state.loadError, nicknames: state.nicknames, pinnedPeople: state.pinnedPeople, mutedPeople: state.mutedPeople, notificationsEnabled: state.notificationsEnabled, groups, useLiveTime: state.useLiveTime, selectedDate: state.selectedDate, selectedTime: state.selectedTime, showEveryone: state.showEveryone, selectedPerson: state.selectedPerson };
    const slots = { Alex: [["08:30", "10:00"], ["11:00", "12:00"], ["13:30", "15:00"]], Jamie: [["09:00", "11:00"], ["13:00", "14:30"]], Sam: [["10:00", "12:15"], ["14:00", "16:00"]], Riley: [["08:00", "09:30"], ["12:45", "14:00"]] };
    const people = {};
    for (const [name, times] of Object.entries(slots)) people[name] = { classes: WORK_DAYS.flatMap(day => times.map(([start, end], index) => ({ day, start, end, course: ["Biology", "Calculus", "Literature"][index % 3], room: "Demo room" }))) };
    state.isDemo = true; state.data = { schema_version: 2, people }; state.hasData = true; state.loadError = null;
    state.nicknames = {}; state.pinnedPeople = new Set(["Alex"]); state.mutedPeople = new Set();
    groups = [{ id: "demo-lunch", name: "Lunch friends", members: ["Alex", "Jamie", "Riley"] }];
    state.useLiveTime = false;
    const today = Core.localDate(), offset = (7 - ALL_DAYS.indexOf(Core.dayForDate(today))) % 7;
    state.selectedDate = WORK_DAYS.includes(Core.dayForDate(today)) ? today : Core.addDays(today, offset);
    state.selectedTime = "12:15"; state.selectedPerson = "Alex"; state.showEveryone = false;
    byId("dateInput").value = state.selectedDate; els.timeInput.value = state.selectedTime;
    byId("demoBanner").hidden = false; byId("peopleSearch").value = ""; byId("minimumFree").value = "0";
    personNodes.clear(); els.peopleList.replaceChildren(); detailSignature = ""; syncGroupOptions(); closeAllDialogs(); refresh(); updateScheduleModal(); track("app_demo_started");
  }
  function exitDemo() {
    if (!demoSnapshot) return;
    closeAllDialogs();
    const saved = demoSnapshot; groups = saved.groups; delete saved.groups; Object.assign(state, saved);
    state.isDemo = false; demoSnapshot = null; byId("demoBanner").hidden = true;
    byId("dateInput").value = state.selectedDate; els.timeInput.value = state.selectedTime;
    byId("peopleSearch").value = ""; byId("minimumFree").value = "0"; byId("groupFilter").value = "";
    personNodes.clear(); els.peopleList.replaceChildren(); detailSignature = ""; syncGroupOptions(); refresh(); updateScheduleModal();
  }

  function beginReview(entries, source, failures = []) {
    if (state.isDemo) return;
    reviewEntries = entries; reviewSource = source; reviewFailures = failures;
    byId("reviewPeople").replaceChildren(); byId("reviewError").textContent = "";
    byId("reviewTitle").textContent = source === "edit" ? "Edit schedule" : "Review imported schedules";
    byId("reviewIntro").textContent = failures.length ? `Review the ${entries.length} schedules that could be read. ${failures.length} files failed; details are listed below.` : "Confirm the names and times, then save. Your current schedules stay intact until you save.";
    entries.forEach((entry, index) => buildReviewCard(entry, index));
    if (failures.length) { const p = document.createElement("p"); p.className = "inline-error"; p.textContent = failures.join("\n"); byId("reviewPeople").append(p); }
    showDialog(byId("reviewModal"));
  }
  function editPerson(name) {
    if (state.isDemo) return;
    beginReview([{ name, person: JSON.parse(JSON.stringify(peopleMap()[name])), originalName: name, warnings: [] }], "edit");
  }
  function labelledInput(labelText, type, value = "") {
    const label = document.createElement("label"); const text = document.createElement("span"); text.textContent = labelText;
    const input = document.createElement("input"); input.type = type; input.value = value; if (type === "text") input.maxLength = 200;
    label.append(text, input); return { label, input };
  }
  function buildReviewCard(entry, index) {
    const card = document.createElement("section"); card.className = "review-person"; card.dataset.reviewIndex = String(index); entry.card = card;
    const header = document.createElement("div"); header.className = "form-grid";
    const name = labelledInput("Full name", "text", entry.name); name.input.maxLength = 100; entry.nameInput = name.input; header.append(name.label);
    const choiceLabel = document.createElement("label"); const choiceTitle = document.createElement("span"); choiceTitle.textContent = "Existing schedule";
    const choice = document.createElement("select"); choice.append(new Option("Keep existing", "keep"), new Option("Replace with reviewed schedule", "replace"), new Option("Save as another person (rename above)", "copy"));
    choice.value = entry.originalName ? "replace" : "keep"; choiceLabel.append(choiceTitle, choice); entry.choice = choice; entry.choiceLabel = choiceLabel; header.append(choiceLabel);
    const collision = document.createElement("p"); collision.className = "review-collision settings-note"; entry.collision = collision;
    const warning = document.createElement("p"); warning.className = "review-warning"; entry.warning = warning;
    card.append(header, collision, warning);
    if (!entry.originalName) {
      const skipLabel = document.createElement("label"); skipLabel.className = "analytics-choice";
      const skip = document.createElement("input"); skip.type = "checkbox"; skip.className = "skip-import"; entry.skipInput = skip;
      const copy = document.createElement("span"); copy.textContent = "Skip this schedule";
      skipLabel.append(skip, copy); card.append(skipLabel);
    }
    if (entry.person.source_file) { const file = document.createElement("p"); file.className = "settings-note"; file.textContent = `Source: ${entry.person.source_file}`; card.append(file); }
    const term = document.createElement("details"); term.className = "term-editor";
    const termSummary = document.createElement("summary"); termSummary.textContent = "Term dates & no-class dates (optional)"; term.append(termSummary);
    const termFields = document.createElement("div"); termFields.className = "form-grid";
    const start = labelledInput("Term starts", "date", entry.person.term?.start || ""), end = labelledInput("Term ends", "date", entry.person.term?.end || "");
    const exclusions = labelledInput("No-class dates (YYYY-MM-DD, separated by commas)", "text", (entry.person.excluded_dates || []).join(", ")); exclusions.input.maxLength = 6000;
    entry.termStart = start.input; entry.termEnd = end.input; entry.exclusions = exclusions.input;
    termFields.append(start.label, end.label, exclusions.label); term.append(termFields); card.append(term);
    const preview = document.createElement("div"); preview.className = "week-preview"; preview.setAttribute("aria-label", `Weekly preview for ${entry.name}`); entry.preview = preview; card.append(preview);
    const heading = document.createElement("h3"); heading.textContent = "Classes";
    const rows = document.createElement("div"); rows.className = "meeting-editor"; entry.classRows = rows; card.append(heading, rows);
    for (const item of entry.person.classes) addMeetingRow(entry, item, "class");
    const add = makeButton("+ Add class", "secondary-button compact", () => { addMeetingRow(entry, { day: state.selectedDay || "Monday", start: "09:00", end: "10:00" }, "class"); updateWeekPreview(entry); }); card.append(add);
    const commitments = document.createElement("details"); commitments.className = "commitment-editor"; commitments.open = Boolean(entry.person.commitments?.length);
    const summary = document.createElement("summary"); summary.textContent = "Personal commitments"; commitments.append(summary);
    const commitmentNote = document.createElement("p"); commitmentNote.className = "settings-note"; commitmentNote.textContent = "Work, study or travel time also blocks availability. Leave Date blank to repeat weekly. Commitments are excluded from sharing by default."; commitments.append(commitmentNote);
    const commitmentRows = document.createElement("div"); commitmentRows.className = "meeting-editor"; entry.commitmentRows = commitmentRows; commitments.append(commitmentRows);
    for (const item of entry.person.commitments || []) addMeetingRow(entry, item, "commitment");
    commitments.append(makeButton("+ Add commitment", "secondary-button compact", () => { addMeetingRow(entry, { day: state.selectedDay || "Monday", start: "12:00", end: "13:00", title: "" }, "commitment"); updateWeekPreview(entry); }));
    card.append(commitments);
    const original = document.createElement("details"); original.className = "existing-preview"; entry.originalPreview = original; card.append(original);
    name.input.addEventListener("input", () => updateReviewCollision(entry)); choice.addEventListener("change", () => updateReviewCollision(entry));
    for (const input of [entry.termStart, entry.termEnd, entry.exclusions]) input.addEventListener("change", () => updateWeekPreview(entry));
    byId("reviewPeople").append(card); updateReviewCollision(entry); updateWeekPreview(entry);
  }
  function addMeetingRow(entry, item, kind) {
    const row = document.createElement("div"); row.className = `meeting-row ${kind}`; row.dataset.kind = kind; row.savedItem = item;
    const dayLabel = document.createElement("label"), dayText = document.createElement("span"), day = document.createElement("select"); dayText.textContent = "Day";
    ALL_DAYS.forEach(value => day.append(new Option(value, value))); day.value = item.day || "Monday"; day.dataset.field = "day"; dayLabel.append(dayText, day); row.append(dayLabel);
    for (const [field, title, type, value] of [["start", "Start", "time", item.start || "09:00"], ["end", "End", "time", item.end || "10:00"], [kind === "class" ? "course" : "title", kind === "class" ? "Course" : "Commitment", "text", item.course || item.title || item.course_code || ""]]) {
      const control = labelledInput(title, type, value); control.input.dataset.field = field; row.append(control.label);
    }
    const last = kind === "class" ? labelledInput("Room", "text", item.room || "") : labelledInput("Date (optional)", "date", item.date || "");
    last.input.dataset.field = kind === "class" ? "room" : "date"; row.append(last.label);
    const remove = makeButton("×", "row-remove", () => { row.remove(); updateWeekPreview(entry); }); remove.setAttribute("aria-label", `Remove ${kind} ${item.course || item.title || "meeting"}`); row.append(remove);
    row.addEventListener("change", event => {
      if (kind === "commitment" && event.target.dataset.field === "date" && event.target.value && Core.validDate(event.target.value)) day.value = Core.dayForDate(event.target.value);
      updateWeekPreview(entry);
    });
    (kind === "class" ? entry.classRows : entry.commitmentRows).append(row);
  }
  function readRows(container) {
    return [...container.children].map(row => {
      const item = { ...row.savedItem };
      for (const input of row.querySelectorAll("[data-field]")) {
        if (input.value) item[input.dataset.field] = input.value.trim();
        else delete item[input.dataset.field];
      }
      return item;
    });
  }
  function reviewedPerson(entry) {
    const person = { ...entry.person, classes: readRows(entry.classRows), commitments: readRows(entry.commitmentRows), term: { start: entry.termStart.value, end: entry.termEnd.value }, excluded_dates: entry.exclusions.value.split(/[\s,]+/).filter(Boolean) };
    return Core.normalizePerson(person, Core.cleanName(entry.nameInput.value));
  }
  function updateReviewCollision(entry) {
    const name = entry.nameInput.value.trim(), existing = Object.hasOwn(peopleMap(), name) ? peopleMap()[name] : null;
    entry.choiceLabel.hidden = !existing && !entry.originalName;
    entry.collision.textContent = existing ? `${name} is already saved with ${existing.classes.length} class meetings. ${entry.originalName ? "Save changes, keep the original, or rename to make a copy." : "Choose whether to keep it, replace it, or use a different name."}` : "This will add a new person.";
    entry.originalPreview.hidden = !existing;
    entry.originalPreview.replaceChildren();
    if (existing) {
      const summary = document.createElement("summary"); summary.textContent = "Compare the currently saved schedule"; entry.originalPreview.append(summary);
      const list = document.createElement("ul"); list.className = "existing-meetings";
      for (const item of [...existing.classes, ...(existing.commitments || [])]) { const li = document.createElement("li"); li.textContent = `${item.day} · ${formatTime(item.start)}–${formatTime(item.end)} · ${classLabel(item)}`; list.append(li); }
      entry.originalPreview.append(list);
    }
  }
  function updateWeekPreview(entry) {
    entry.preview.replaceChildren();
    try {
      const person = reviewedPerson(entry);
      const warnings = [...(entry.warnings || []), ...Core.overlaps(person)];
      entry.warning.textContent = warnings.join(" "); entry.warning.hidden = !warnings.length;
      for (const day of ALL_DAYS) {
        const column = document.createElement("div"); column.className = "week-day";
        const title = document.createElement("strong"); title.textContent = day.slice(0, 3); column.append(title);
        const items = [...person.classes, ...(person.commitments || [])].filter(item => item.day === day).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
        for (const item of items) {
          const meeting = document.createElement("div"); meeting.className = `week-meeting${item.title ? " commitment" : ""}`;
          const times = document.createElement("span"); times.textContent = `${shortTime(item.start)}–${shortTime(item.end)}`;
          const course = document.createElement("small"); course.textContent = item.title || item.course || item.course_code || "Class";
          if (item.date) { const date = document.createElement("small"); date.textContent = item.date; meeting.append(date); }
          meeting.append(times, course); column.append(meeting);
        }
        if (!items.length) { const empty = document.createElement("small"); empty.textContent = "No meetings"; column.append(empty); }
        entry.preview.append(column);
      }
    } catch (error) { entry.warning.hidden = false; entry.warning.textContent = error.message; }
  }
  async function saveReviewedSchedules() {
    const button = byId("saveReviewButton"); button.disabled = true; byId("reviewError").textContent = "";
    try {
      const entries = reviewEntries.map(entry => {
        if (entry.skipInput?.checked) return { name: entry.name, originalName: null, action: "keep", person: entry.person };
        const name = Core.cleanName(entry.nameInput.value), exists = Object.hasOwn(peopleMap(), name);
        const action = exists || entry.originalName ? entry.choice.value : "add";
        return { name, originalName: entry.originalName, action, person: action === "keep" ? entry.person : reviewedPerson(entry) };
      });
      if (entries.every(entry => entry.action === "keep")) { closeDialog(); showToast("No schedules were changed"); return; }
      const next = Core.mergeReviewed(peopleMap(), entries);
      state.data = next; state.selectedPerson = null; detailSignature = "";
      const warning = await persistCurrentDatabase("Reviewed schedule collection");
      cleanPeoplePreferences(); groups = groups.map(group => ({ ...group, members: group.members.filter(name => Object.hasOwn(peopleMap(), name)) })); saveGroups(); syncGroupOptions();
      if (reviewSource !== "edit") track("app_import_succeeded", { source: reviewSource, count_bucket: countBucket(entries.filter(entry => entry.action !== "keep").length) });
      closeAllDialogs(); refresh(); setParserStatus("", ""); showToast(warning || "Reviewed schedules saved");
    } catch (error) { byId("reviewError").textContent = error.message; }
    finally { button.disabled = false; }
  }

  function updateShareSummary() {
    const names = checkedNames(byId("sharePeople"));
    byId("shareSummary").textContent = names.length ? `${names.length} ${names.length === 1 ? "schedule" : "schedules"} selected${byId("shareCommitments").checked ? " · includes personal commitments" : " · class schedules only"}.` : "Choose at least one person to share.";
    byId("downloadSelectedButton").disabled = byId("shareSelectedButton").disabled = names.length === 0;
  }
  async function shareSelected(useShareSheet) {
    const names = checkedNames(byId("sharePeople")); if (!names.length || state.isDemo) return;
    const file = new File([databaseJsonText(names, byId("shareCommitments").checked)], "schedules.json", { type: "application/json" });
    try {
      if (useShareSheet && navigator.share && navigator.canShare?.({ files: [file] })) {
        // Keep the file payload simple so iOS and Android share targets agree.
        await navigator.share({ title: "Who's Free? schedules", text: `Open ${APP_URL} and import this schedule file.`, files: [file] });
        showToast("Selected schedules shared");
      } else { downloadDatabaseFile(file); showToast("Downloaded selected schedules"); }
      track("app_schedules_shared", { count_bucket: countBucket(names.length) });
    } catch (error) { if (error?.name !== "AbortError") showToast("Sharing did not finish. Try Download file instead."); }
  }
  async function shareApp() {
    const button = byId("shareAppButton"), status = byId("appShareStatus");
    if (button.disabled) return;
    button.disabled = true; status.hidden = true; status.textContent = "";
    byId("appShareFallback").hidden = true;
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "Who's Free?", text: "Find a friend between classes and compare schedules with Who’s Free?", url: APP_URL });
          status.textContent = "Thanks for spreading the word!"; status.hidden = false;
          track("app_link_shared"); return;
        } catch (error) { if (error?.name === "AbortError") return; }
      }
      try {
        if (typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(APP_URL);
        status.textContent = "Link copied. Send it to a friend!"; status.hidden = false;
        track("app_link_copied");
      } catch {
        status.textContent = "The app link is ready to copy below."; status.hidden = false;
        byId("appShareFallback").hidden = false;
        const link = byId("appShareLink"); link.value = APP_URL; link.focus(); link.select();
      }
    } finally { button.disabled = false; }
  }
  function countBucket(count) { return count === 1 ? "one" : count <= 5 ? "2_to_5" : count <= 20 ? "6_to_20" : "over_20"; }
  function initializeAnalytics() {
    if (analyticsLoaded) return;
    window[`ga-disable-${GA_ID}`] = false;
    analyticsLoaded = true; window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: true, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: APP_URL, page_title: "Who's Free?", page_referrer: "" });
    const script = document.createElement("script"); script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`; document.head.append(script);
  }
  function track(event, values = {}) {
    if (!window.gtag || !["app_demo_started", "app_import_failed", "app_import_succeeded", "app_friend_selected", "app_shared_break_search", "app_schedules_shared", "app_link_shared", "app_link_copied"].includes(event)) return;
    const payload = { page_location: APP_URL };
    if (["pdf", "json"].includes(values.source)) payload.source = values.source;
    if (["one", "2_to_5", "6_to_20", "over_20"].includes(values.count_bucket)) payload.count_bucket = values.count_bucket;
    window.gtag("event", event, payload);
  }
  function initFeatures() {
    if (!detailHome.parentNode) els.detailPanel.before(detailHome);
    initializeAnalytics();
    byId("dateInput").addEventListener("change", () => refresh({ preserveScroll: true }));
    for (const id of ["peopleSearch", "groupFilter", "minimumFree"]) byId(id).addEventListener(id === "peopleSearch" ? "input" : "change", () => refresh({ preserveScroll: true }));
    byId("planButton").addEventListener("click", openPlanner); byId("findBreakButton").addEventListener("click", findSharedBreaks);
    byId("planGroup").addEventListener("change", () => { const group = groups.find(item => item.id === byId("planGroup").value); renderChecklist(byId("planPeople"), Object.keys(peopleMap()).sort(comparePeopleNames), group?.members || []); });
    byId("saveGroupButton").addEventListener("click", saveGroup);
    byId("demoButton").addEventListener("click", startDemo); byId("exitDemoButton").addEventListener("click", exitDemo);
    byId("saveReviewButton").addEventListener("click", saveReviewedSchedules); byId("cancelReviewButton").addEventListener("click", () => closeDialog());
    byId("sharePeople").addEventListener("change", updateShareSummary); byId("shareCommitments").addEventListener("change", updateShareSummary);
    for (const [id, checked] of [["shareSelectAll", true], ["shareSelectNone", false]]) byId(id).addEventListener("click", () => { for (const input of byId("sharePeople").querySelectorAll("input")) input.checked = checked; updateShareSummary(); });
    byId("shareSelectedButton").addEventListener("click", () => shareSelected(true)); byId("downloadSelectedButton").addEventListener("click", () => shareSelected(false));
    byId("shareAppButton").addEventListener("click", shareApp);
    document.addEventListener("keydown", trapDialog);
    document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => closeDialog()));
    for (const id of ["planModal", "shareModal", "reviewModal", "mobileDetailModal"]) byId(id).addEventListener("click", event => { if (event.target === byId(id)) closeDialog(); });
    window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; });
    byId("installButton").addEventListener("click", async () => { if (deferredInstallPrompt) { const prompt = deferredInstallPrompt; deferredInstallPrompt = null; await prompt.prompt(); } else byId("installInstructions").hidden = false; });
    byId("updateAppButton").addEventListener("click", () => { if (!workerRegistration?.waiting) return; reloadForUpdate = true; workerRegistration.waiting.postMessage({ type: "SKIP_WAITING" }); });
    window.addEventListener("resize", () => { if (!window.matchMedia("(max-width: 880px)").matches && dialogs[dialogs.length - 1]?.element.id === "mobileDetailModal") closeMobileDetail(); });
  }


  init();
})();

