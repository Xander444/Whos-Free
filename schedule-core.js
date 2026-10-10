(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WhosFreeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const OWN = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  function minutes(value) {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return NaN;
    const [h, m] = value.split(":").map(Number);
    return h <= 23 && m <= 59 ? h * 60 + m : NaN;
  }
  function time(value) {
    const n = Math.max(0, Math.min(1439, Math.round(value)));
    return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  }
  function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(0); date.setFullYear(y, m - 1, d); date.setHours(12, 0, 0, 0);
    return localDate(date) === value;
  }
  function addDays(value, amount) {
    if (!validDate(value)) throw new Error("Choose a valid date.");
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12);
    date.setDate(date.getDate() + amount);
    return localDate(date);
  }
  function dayForDate(value) {
    if (!validDate(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return DAYS[(new Date(y, m - 1, d, 12).getDay() + 6) % 7];
  }
  function cleanName(value) {
    const name = String(value || "").trim();
    if (!name || name.length > 100 || UNSAFE_KEYS.has(name)) throw new Error("Use a name between 1 and 100 characters.");
    return name;
  }
  function text(value, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
  function normalizeMeeting(item, name, kind) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`A meeting for ${name} is not valid.`);
    if (!DAYS.includes(item.day)) throw new Error(`A meeting for ${name} has an invalid day.`);
    if (!Number.isFinite(minutes(item.start)) || !Number.isFinite(minutes(item.end)) || minutes(item.end) <= minutes(item.start)) {
      throw new Error(`A meeting for ${name} needs an end time after its start time.`);
    }
    if (item.date && (!validDate(item.date) || dayForDate(item.date) !== item.day)) throw new Error(`A commitment for ${name} has a date that does not match its weekday.`);
    const result = { day: item.day, start: item.start, end: item.end };
    if (kind === "commitment") {
      result.title = text(item.title || item.course) || "Personal commitment";
      if (item.date) result.date = item.date;
    } else {
      for (const key of ["course", "course_code", "section", "room", "instructor"]) {
        const value = text(item[key]); if (value) result[key] = value;
      }
      if (item.time_source === "printed" || item.time_source === "inferred") result.time_source = item.time_source;
    }
    return result;
  }
  function normalizePerson(person, name) {
    if (!person || typeof person !== "object" || Array.isArray(person) || !Array.isArray(person.classes)) {
      throw new Error(`The schedule for ${name} needs a classes array.`);
    }
    if (person.classes.length > 500) throw new Error(`The schedule for ${name} has too many classes.`);
    const result = { classes: person.classes.map(item => normalizeMeeting(item, name, "class")) };
    if (person.source_file) result.source_file = text(person.source_file, 250);
    if (person.commitments !== undefined) {
      if (!Array.isArray(person.commitments) || person.commitments.length > 500) throw new Error(`The commitments for ${name} are not valid.`);
      result.commitments = person.commitments.map(item => normalizeMeeting(item, name, "commitment"));
    }
    if (person.term) {
      const { start, end } = person.term;
      if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && end < start)) throw new Error(`Check the term dates for ${name}.`);
      if (start || end) result.term = { start: start || "", end: end || "" };
    }
    if (person.excluded_dates !== undefined) {
      if (!Array.isArray(person.excluded_dates) || person.excluded_dates.length > 500 || !person.excluded_dates.every(validDate)) throw new Error(`Check the no-class dates for ${name}.`);
      result.excluded_dates = [...new Set(person.excluded_dates)].sort();
    }
    return result;
  }
  function normalizeDatabase(data) {
    if (!data || typeof data !== "object" || Array.isArray(data) || !data.people || typeof data.people !== "object" || Array.isArray(data.people)) {
      throw new Error("This file does not contain a valid people schedule database.");
    }
    if (data.schema_version != null && ![1, 2].includes(data.schema_version)) throw new Error("This file uses an unsupported schedule format.");
    if (Object.keys(data.people).length > 1000) throw new Error("Import at most 1,000 people at a time.");
    const people = {};
    for (const [key, person] of Object.entries(data.people)) {
      const name = cleanName(key);
      if (OWN(people, name)) throw new Error(`The file contains duplicate entries for ${name}.`);
      people[name] = normalizePerson(person, name);
    }
    return { schema_version: 2, people };
  }
  function termActive(person, date) {
    return !date || !person.term || ((!person.term.start || date >= person.term.start) && (!person.term.end || date <= person.term.end));
  }
  function meetings(person, day, date) {
    const classes = termActive(person, date) && !(person.excluded_dates || []).includes(date)
      ? (person.classes || []).filter(item => item.day === day).map(item => ({ ...item, kind: "class" })) : [];
    const commitments = (person.commitments || []).filter(item => item.day === day && (!item.date || item.date === date)).map(item => ({ ...item, kind: "commitment" }));
    return [...classes, ...commitments].sort((a, b) => minutes(a.start) - minutes(b.start) || minutes(a.end) - minutes(b.end));
  }
  function mergeIntervals(intervals) {
    const sorted = intervals.map(item => [...item]).sort((a, b) => a[0] - b[0]);
    const result = [];
    for (const interval of sorted) {
      const last = result[result.length - 1];
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else result.push(interval);
    }
    return result;
  }
  function availability(person, day, minute, date) {
    const events = meetings(person, day, date);
    const current = events.find(item => minutes(item.start) <= minute && minute < minutes(item.end)) || null;
    const next = events.find(item => minutes(item.start) > minute) || null;
    if (current) {
      const span = mergeIntervals(events.map(item => [minutes(item.start), minutes(item.end)])).find(item => item[0] <= minute && minute < item[1]);
      return { status: "busy", current, next, until: span[1], duration: span[1] - minute };
    }
    if (!termActive(person, date)) return { status: "unknown", current: null, next, reason: "Outside saved term" };
    return { status: "free", current: null, next, until: next ? minutes(next.start) : 1440, duration: (next ? minutes(next.start) : 1440) - minute, holiday: (person.excluded_dates || []).includes(date), hasClasses: events.some(item => item.kind === "class") };
  }
  function overlaps(person) {
    const warnings = [];
    for (const day of DAYS) {
      const classes = (person.classes || []).filter(item => item.day === day).sort((a, b) => minutes(a.start) - minutes(b.start));
      let latestEnd = -1;
      for (const item of classes) {
        if (minutes(item.start) < latestEnd) { warnings.push(`${day}: classes overlap. Check the imported times.`); break; }
        latestEnd = Math.max(latestEnd, minutes(item.end));
      }
    }
    return warnings;
  }
  function commonWindows(people, names, dates, start, end, minDuration) {
    if (!names.length || names.some(name => !OWN(people, name))) return [];
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !(minDuration > 0)) return [];
    const results = [];
    for (const date of dates) {
      const day = dayForDate(date);
      if (!day || names.some(name => !termActive(people[name], date))) continue;
      const busy = mergeIntervals(names.flatMap(name => meetings(people[name], day, date).map(item => [Math.max(start, minutes(item.start)), Math.min(end, minutes(item.end))]).filter(item => item[1] > item[0])));
      let cursor = start;
      for (const [a, b] of [...busy, [end, end]]) {
        if (a - cursor >= minDuration) results.push({ date, day, start: time(cursor), end: time(a), duration: a - cursor });
        cursor = Math.max(cursor, b);
      }
    }
    return results;
  }
  function breakEvents(person, day, date, threshold = 10) {
    if (!termActive(person, date) || (person.excluded_dates || []).includes(date)) return [];
    const classes = mergeIntervals((person.classes || []).filter(item => item.day === day).map(item => [minutes(item.start), minutes(item.end)]));
    const commitments = (person.commitments || []).filter(item => item.day === day && (!item.date || item.date === date)).map(item => [minutes(item.start), minutes(item.end)]);
    const result = [];
    for (let i = 0; i + 1 < classes.length; i++) {
      let start = classes[i][1];
      const end = classes[i + 1][0];
      const busy = mergeIntervals(commitments.filter(item => item[1] > start && item[0] < end));
      for (const [a, b] of [...busy, [end, end]]) {
        const stop = Math.min(a, end);
        if (stop - start > threshold) result.push({ day, start: time(start), end: time(stop), duration: stop - start });
        start = Math.max(start, b);
      }
    }
    return result;
  }
  function mergeReviewed(existing, entries) {
    const people = { ...existing };
    const targets = new Set();
    for (const entry of entries) {
      if (entry.action === "keep") continue;
      const name = cleanName(entry.name);
      if (targets.has(name)) throw new Error(`Two reviewed schedules use the name ${name}. Rename one before saving.`);
      targets.add(name);
      const isRename = entry.originalName && name !== entry.originalName;
      if (OWN(people, name) && !(entry.action === "replace") && name !== entry.originalName) throw new Error(`Choose Replace or a different name for ${name}.`);
      if (entry.action === "copy" && OWN(people, name)) throw new Error(`Give the copied schedule a new name.`);
      if (isRename && entry.action !== "copy") delete people[entry.originalName];
      people[name] = normalizePerson(entry.person, name);
    }
    return normalizeDatabase({ schema_version: 2, people });
  }
  function exportDatabase(data, names, options = {}) {
    const people = {};
    for (const name of names) {
      if (!OWN(data.people, name)) continue;
      const person = normalizePerson(data.people[name], name);
      delete person.source_file;
      person.classes = person.classes.map(item => { const result = { ...item }; delete result.time_source; return result; });
      if (!options.commitments) delete person.commitments;
      people[name] = person;
    }
    return { schema_version: 2, app_url: options.appUrl || "https://xander444.github.io/Whos-Free/", people };
  }
  return { DAYS, minutes, time, localDate, validDate, addDays, dayForDate, cleanName, normalizePerson, normalizeDatabase, termActive, meetings, mergeIntervals, availability, overlaps, commonWindows, breakEvents, mergeReviewed, exportDatabase };
});
