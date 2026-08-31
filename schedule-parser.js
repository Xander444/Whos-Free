(() => {
  "use strict";

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  const EXPLICIT_RANGE_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:to|[-–—])\s*([01]?\d|2[0-3]):([0-5]\d)\b/i;
  const CODE_RE = /\b([A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2})\b/i;
  const SECTION_RE = /\bsec\.\s*(\d+)\b/i;
  const ROOM_RE = /\bClassroom\s+([A-Z]-\d+)\b/i;

  // Kept separate from the app shell so the parser library is downloaded only
  // when someone actually imports a PDF. The PDF itself never leaves the device.
  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

  let pdfjsPromise = null;

  function median(values) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function minutes(value) {
    const [h, m] = String(value || "").split(":").map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return NaN;
    return h * 60 + m;
  }

  function hhmm(total) {
    const normalized = ((Math.round(total) % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  }

  function normalizeTime(value) {
    const [h, m] = String(value).split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function multiplyMatrices(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }

  function applyMatrix(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  function normalizeRect(x0, y0, x1, y1) {
    return {
      x0: Math.min(x0, x1),
      y0: Math.min(y0, y1),
      x1: Math.max(x0, x1),
      y1: Math.max(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
    };
  }

  function transformRect(viewport, ctm, x, y, width, height) {
    const corners = [
      applyMatrix(ctm, x, y),
      applyMatrix(ctm, x + width, y),
      applyMatrix(ctm, x, y + height),
      applyMatrix(ctm, x + width, y + height),
    ].map(([px, py]) => viewport.convertToViewportPoint(px, py));

    const xs = corners.map(point => point[0]);
    const ys = corners.map(point => point[1]);
    return normalizeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS_URL).then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return pdfjs;
      }).catch(error => {
        pdfjsPromise = null;
        throw new Error(`Could not load the local PDF parser library. Check your internet connection and try again. (${error.message})`);
      });
    }
    return pdfjsPromise;
  }

  function buildTextItems(textContent, viewport, pdfjs) {
    const items = [];

    for (const item of textContent.items || []) {
      const text = String(item.str || "").trim();
      if (!text) continue;

      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.max(1, Math.hypot(tx[2], tx[3]) || Math.abs(item.height || 0) || 8);
      const width = Math.max(1, Math.abs((item.width || 0) * viewport.scale));
      const x0 = tx[4];
      const yBaseline = tx[5];
      const y0 = yBaseline - fontHeight;
      const y1 = yBaseline + Math.max(1, fontHeight * 0.12);

      items.push({
        text,
        x0,
        x1: x0 + width,
        y0,
        y1,
        cx: x0 + width / 2,
        cy: (y0 + y1) / 2,
        height: y1 - y0,
      });
    }

    return items;
  }

  function pathArgCount(op, OPS) {
    if (op === OPS.moveTo || op === OPS.lineTo) return 2;
    if (op === OPS.curveTo) return 6;
    if (op === OPS.curveTo2 || op === OPS.curveTo3) return 4;
    if (op === OPS.rectangle) return 4;
    return 0;
  }

  function buildRectangles(operatorList, viewport, pdfjs) {
    const rects = [];
    const stack = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const OPS = pdfjs.OPS;

    for (let i = 0; i < operatorList.fnArray.length; i += 1) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i] || [];

      if (fn === OPS.save) {
        stack.push([...ctm]);
        continue;
      }
      if (fn === OPS.restore) {
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        continue;
      }
      if (fn === OPS.transform && args.length >= 6) {
        ctm = multiplyMatrices(ctm, args.slice(0, 6).map(Number));
        continue;
      }
      if (fn !== OPS.constructPath) continue;

      const pathOps = Array.from(args[0] || []);
      const coords = Array.from(args[1] || []);
      let pointer = 0;

      for (const pathOp of pathOps) {
        if (pathOp === OPS.rectangle && pointer + 3 < coords.length) {
          const [x, y, width, height] = coords.slice(pointer, pointer + 4).map(Number);
          const rect = transformRect(viewport, ctm, x, y, width, height);
          if (Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0.5 && rect.height > 0.5) {
            rects.push(rect);
          }
        }
        pointer += pathArgCount(pathOp, OPS);
      }
    }

    // Some PDFs draw the same rectangle twice (fill + border). De-duplicate
    // nearly identical geometry before schedule detection.
    const unique = [];
    for (const rect of rects) {
      const duplicate = unique.some(existing =>
        Math.abs(existing.x0 - rect.x0) < 0.6 &&
        Math.abs(existing.y0 - rect.y0) < 0.6 &&
        Math.abs(existing.x1 - rect.x1) < 0.6 &&
        Math.abs(existing.y1 - rect.y1) < 0.6
      );
      if (!duplicate) unique.push(rect);
    }
    return unique;
  }

  function groupTextLines(items, tolerance = 2.7) {
    const sorted = [...items].sort((a, b) => (a.cy - b.cy) || (a.x0 - b.x0));
    const lines = [];

    for (const item of sorted) {
      let line = lines.find(candidate => Math.abs(candidate.cy - item.cy) <= tolerance);
      if (!line) {
        line = { cy: item.cy, items: [] };
        lines.push(line);
      }
      line.items.push(item);
      line.cy = line.items.reduce((sum, current) => sum + current.cy, 0) / line.items.length;
    }

    lines.sort((a, b) => a.cy - b.cy);
    return lines.map(line => line.items
      .sort((a, b) => a.x0 - b.x0)
      .map(item => item.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim())
      .filter(Boolean);
  }

  function textInsideRect(items, rect, inset = 0.8) {
    return items.filter(item =>
      item.cx >= rect.x0 + inset &&
      item.cx <= rect.x1 - inset &&
      item.cy >= rect.y0 + inset &&
      item.cy <= rect.y1 - inset
    );
  }

  function extractPersonName(items) {
    const lines = groupTextLines(items, 3.2);
    for (const line of lines.slice(0, 30)) {
      const match = line.match(/^\s*(.+?)\s+-\s+\d{5,}\s+-\s+[A-Za-z0-9.]+\s*$/);
      if (match) return match[1].trim();
    }
    return null;
  }

  function findDayColumns(items, rects) {
    const dayItems = {};
    for (const day of DAYS) {
      const matches = items.filter(item => item.text === day);
      if (!matches.length) throw new Error(`Could not locate the ${day} column. Make sure this is a Marianopolis Omnivox schedule PDF.`);
      dayItems[day] = matches.sort((a, b) => a.y0 - b.y0)[0];
    }

    const centers = DAYS.map(day => dayItems[day].cx);
    const spacings = centers.slice(1).map((center, index) => center - centers[index]).filter(value => value > 20);
    const defaultWidth = median(spacings);
    if (!Number.isFinite(defaultWidth)) throw new Error("Could not determine the timetable column width.");

    const columns = {};
    for (const day of DAYS) {
      const item = dayItems[day];
      const candidates = rects.filter(rect =>
        rect.x0 <= item.cx && item.cx <= rect.x1 &&
        rect.y0 <= item.cy && item.cy <= rect.y1 &&
        rect.height > 6 && rect.height < 18 &&
        rect.width > defaultWidth * 0.7 && rect.width < defaultWidth * 1.25
      );

      if (candidates.length) {
        const header = candidates.sort((a, b) => Math.abs(a.width - defaultWidth) - Math.abs(b.width - defaultWidth))[0];
        columns[day] = { left: header.x0, right: header.x1, center: item.cx, width: header.width };
      } else {
        columns[day] = {
          left: item.cx - defaultWidth / 2,
          right: item.cx + defaultWidth / 2,
          center: item.cx,
          width: defaultWidth,
        };
      }
    }

    return { columns, dayItems };
  }

  function findTimeMarkers(items, columns, dayItems) {
    const allLeft = Math.min(...Object.values(columns).map(column => column.left));
    const dayBottom = Math.max(...Object.values(dayItems).map(item => item.y1));

    let timeItems = items.filter(item =>
      TIME_RE.test(item.text) &&
      item.x1 <= allLeft + 4 &&
      item.y0 > dayBottom
    );

    // Remove duplicate text items at essentially the same y position.
    timeItems = timeItems.sort((a, b) => a.cy - b.cy).filter((item, index, arr) =>
      index === 0 || Math.abs(item.cy - arr[index - 1].cy) > 1.3 || item.text !== arr[index - 1].text
    );

    if (timeItems.length < 4) throw new Error("Could not find enough timetable time labels in this PDF.");

    const markers = timeItems.map(item => ({
      time: normalizeTime(item.text),
      y0: item.y0,
      y1: item.y1,
      center: item.cy,
    }));

    const starts = markers.filter((_, index) => index % 2 === 0);
    const ends = markers.filter((_, index) => index % 2 === 1);
    if (starts.length < 2 || !ends.length) throw new Error("Could not reconstruct the timetable time grid.");

    const rowSteps = starts.slice(1)
      .map((marker, index) => marker.y0 - starts[index].y0)
      .filter(value => value > 2);
    const rowHeight = median(rowSteps);
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) throw new Error("Could not determine the timetable row height.");

    return { starts, ends, rowHeight };
  }

  function parseClassLines(lines) {
    const joined = lines.join("\n");
    const codeMatch = joined.match(CODE_RE);
    const sectionMatch = joined.match(SECTION_RE);
    const roomMatch = joined.match(ROOM_RE);
    const rangeMatch = joined.match(EXPLICIT_RANGE_RE);
    const codeIndex = lines.findIndex(line => CODE_RE.test(line));
    const titleLines = codeIndex >= 0 ? lines.slice(0, codeIndex) : lines.slice(0, 1);
    const title = titleLines.join(" ").trim();

    let instructor = null;
    if (roomMatch) {
      const roomLineIndex = lines.findIndex(line => ROOM_RE.test(line));
      if (roomLineIndex >= 0) {
        for (const line of lines.slice(roomLineIndex + 1)) {
          if (line.toLowerCase() === "classroom") continue;
          if (EXPLICIT_RANGE_RE.test(line)) continue;
          instructor = line;
          break;
        }
      }
    }

    const result = {
      course: title || null,
      course_code: codeMatch ? codeMatch[1].toUpperCase() : null,
      section: sectionMatch ? sectionMatch[1] : null,
      room: roomMatch ? roomMatch[1].toUpperCase() : null,
      instructor,
    };

    if (rangeMatch) {
      result.explicitTime = {
        start: `${String(Number(rangeMatch[1])).padStart(2, "0")}:${rangeMatch[2]}`,
        end: `${String(Number(rangeMatch[3])).padStart(2, "0")}:${rangeMatch[4]}`,
      };
    }

    return result;
  }

  function nearestMarker(markers, y, edge) {
    let best = null;
    let bestDistance = Infinity;
    for (const marker of markers) {
      const distance = Math.abs(marker[edge] - y);
      if (distance < bestDistance) {
        best = marker;
        bestDistance = distance;
      }
    }
    return { marker: best, distance: bestDistance };
  }

  function timesFromRectangle(rect, starts, ends, rowHeight) {
    const startMatch = nearestMarker(starts, rect.y0, "y0");
    const endMatch = nearestMarker(ends, rect.y1, "y1");
    const tolerance = Math.max(5, rowHeight * 0.38);
    const start = startMatch.marker.time;
    const end = endMatch.marker.time;

    if (startMatch.distance <= tolerance && endMatch.distance <= tolerance && minutes(end) > minutes(start)) {
      return { start, end };
    }

    const validEnds = ends.filter(marker => marker.y1 > startMatch.marker.y0 && minutes(marker.time) > minutes(start));
    if (validEnds.length) {
      const candidate = nearestMarker(validEnds, rect.y1, "y1");
      if (candidate.distance <= tolerance * 1.5) return { start, end: candidate.marker.time };
    }

    const startIndex = starts.reduce((bestIndex, marker, index) =>
      Math.abs(marker.y0 - rect.y0) < Math.abs(starts[bestIndex].y0 - rect.y0) ? index : bestIndex, 0);
    const estimatedRows = Math.max(1, Math.floor((rect.height / rowHeight) + 0.25));
    const fallbackStart = starts[startIndex].time;
    return { start: fallbackStart, end: hhmm(minutes(fallbackStart) + estimatedRows * 30 - 10) };
  }

  function extractClasses(model) {
    const { items, rects } = model;
    const { columns, dayItems } = findDayColumns(items, rects);
    const { starts, ends, rowHeight } = findTimeMarkers(items, columns, dayItems);
    const gridTop = starts[0].y0 - rowHeight * 0.25;
    const classes = [];
    const seen = new Set();

    for (const day of DAYS) {
      const column = columns[day];
      const candidates = rects.filter(rect => {
        const center = (rect.x0 + rect.x1) / 2;
        const horizontalMatch = Math.abs(center - column.center) <= column.width * 0.18;
        const widthMatch = rect.width >= column.width * 0.75 && rect.width <= column.width * 1.18;
        return horizontalMatch && widthMatch && rect.y0 >= gridTop && rect.height >= rowHeight * 1.55;
      });

      for (const rect of candidates) {
        const lines = groupTextLines(textInsideRect(items, rect), 2.8);
        const joined = lines.join("\n");
        if (!lines.length || !CODE_RE.test(joined)) continue;

        const parsed = parseClassLines(lines);
        let start;
        let end;
        if (parsed.explicitTime) {
          ({ start, end } = parsed.explicitTime);
          delete parsed.explicitTime;
        } else {
          ({ start, end } = timesFromRectangle(rect, starts, ends, rowHeight));
        }

        if (minutes(end) <= minutes(start)) {
          throw new Error(`Invalid time range detected for ${day} ${parsed.course_code || parsed.course || "class"}: ${start}-${end}`);
        }

        const item = { day, start, end, ...parsed };
        const key = [day, start, end, item.course_code || "", item.section || ""].join("|");
        if (!seen.has(key)) {
          seen.add(key);
          classes.push(item);
        }
      }
    }

    classes.sort((a, b) => {
      const dayCompare = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
      if (dayCompare) return dayCompare;
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      return String(a.course_code || "").localeCompare(String(b.course_code || ""));
    });

    return classes;
  }

  function parseScheduleModel(model, filename, nameOverride = null) {
    const name = String(nameOverride || extractPersonName(model.items) || "").trim();
    if (!name) {
      const error = new Error("Could not find the student's name in the schedule header.");
      error.code = "NAME_NOT_FOUND";
      throw error;
    }

    const classes = extractClasses(model);
    if (!classes.length) throw new Error("No classes were found. Make sure this is the standard Marianopolis Omnivox weekly schedule PDF.");

    return {
      name,
      person: {
        source_file: filename || "schedule.pdf",
        classes,
      },
    };
  }

  async function pageToModel(page, pdfjs) {
    const viewport = page.getViewport({ scale: 1 });
    const [textContent, operatorList] = await Promise.all([
      page.getTextContent({ disableNormalization: false }),
      page.getOperatorList(),
    ]);

    return {
      items: buildTextItems(textContent, viewport, pdfjs),
      rects: buildRectangles(operatorList, viewport, pdfjs),
    };
  }

  async function parseSchedulePdf(file, options = {}) {
    if (!(file instanceof Blob)) throw new Error("Choose a PDF schedule file.");
    const filename = file.name || "schedule.pdf";
    if (!/\.pdf$/i.test(filename) && file.type !== "application/pdf") throw new Error("Choose a PDF schedule file.");

    const pdfjs = await loadPdfJs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let documentTask;

    try {
      documentTask = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: true });
      const pdf = await documentTask.promise;
      if (pdf.numPages < 1) throw new Error("The PDF has no pages.");
      const page = await pdf.getPage(1);
      const model = await pageToModel(page, pdfjs);
      const result = parseScheduleModel(model, filename, options.nameOverride || null);
      await pdf.destroy();
      return result;
    } catch (error) {
      try { await documentTask?.destroy?.(); } catch { /* ignore cleanup errors */ }
      throw error;
    }
  }

  globalThis.WhosFreeParser = {
    parseSchedulePdf,
    version: "browser-parser-1",
    // Exposed for deterministic local tests; the app UI does not use these.
    __test: { parseScheduleModel, parseClassLines, groupTextLines },
  };
})();
