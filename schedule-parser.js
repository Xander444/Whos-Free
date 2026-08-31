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

  function transformPoint(viewport, ctm, x, y) {
    const [ux, uy] = applyMatrix(ctm, x, y);
    const [vx, vy] = viewport.convertToViewportPoint(ux, uy);
    return { x: vx, y: vy };
  }

  function makeLine(a, b) {
    if (!a || !b) return null;
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) return null;
    return {
      x0: a.x,
      y0: a.y,
      x1: b.x,
      y1: b.y,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
      length,
      horizontal: Math.abs(dy) <= 1.4,
      vertical: Math.abs(dx) <= 1.4,
    };
  }

  function dedupeRects(rects) {
    const unique = [];
    for (const rect of rects) {
      const duplicate = unique.some(existing =>
        Math.abs(existing.x0 - rect.x0) < 0.7 &&
        Math.abs(existing.y0 - rect.y0) < 0.7 &&
        Math.abs(existing.x1 - rect.x1) < 0.7 &&
        Math.abs(existing.y1 - rect.y1) < 0.7
      );
      if (!duplicate) unique.push(rect);
    }
    return unique;
  }

  function dedupeLines(lines) {
    const unique = [];
    for (const line of lines) {
      const duplicate = unique.some(existing => {
        if (line.horizontal && existing.horizontal) {
          return Math.abs(((line.y0 + line.y1) / 2) - ((existing.y0 + existing.y1) / 2)) < 0.8 &&
            Math.abs(line.minX - existing.minX) < 1.2 &&
            Math.abs(line.maxX - existing.maxX) < 1.2;
        }
        if (line.vertical && existing.vertical) {
          return Math.abs(((line.x0 + line.x1) / 2) - ((existing.x0 + existing.x1) / 2)) < 0.8 &&
            Math.abs(line.minY - existing.minY) < 1.2 &&
            Math.abs(line.maxY - existing.maxY) < 1.2;
        }
        return false;
      });
      if (!duplicate) unique.push(line);
    }
    return unique;
  }

  function buildGeometry(operatorList, viewport, pdfjs) {
    const rects = [];
    const lines = [];
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
      let current = null;
      let subpathStart = null;

      for (const pathOp of pathOps) {
        if (pathOp === OPS.moveTo && pointer + 1 < coords.length) {
          current = transformPoint(viewport, ctm, Number(coords[pointer]), Number(coords[pointer + 1]));
          subpathStart = current;
        } else if (pathOp === OPS.lineTo && pointer + 1 < coords.length) {
          const next = transformPoint(viewport, ctm, Number(coords[pointer]), Number(coords[pointer + 1]));
          const line = makeLine(current, next);
          if (line) lines.push(line);
          current = next;
        } else if (pathOp === OPS.curveTo && pointer + 5 < coords.length) {
          current = transformPoint(viewport, ctm, Number(coords[pointer + 4]), Number(coords[pointer + 5]));
        } else if ((pathOp === OPS.curveTo2 || pathOp === OPS.curveTo3) && pointer + 3 < coords.length) {
          current = transformPoint(viewport, ctm, Number(coords[pointer + 2]), Number(coords[pointer + 3]));
        } else if (pathOp === OPS.rectangle && pointer + 3 < coords.length) {
          const [x, y, width, height] = coords.slice(pointer, pointer + 4).map(Number);
          const rect = transformRect(viewport, ctm, x, y, width, height);
          if (Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0.35 && rect.height > 0.35) {
            rects.push(rect);
          }

          const p0 = transformPoint(viewport, ctm, x, y);
          const p1 = transformPoint(viewport, ctm, x + width, y);
          const p2 = transformPoint(viewport, ctm, x + width, y + height);
          const p3 = transformPoint(viewport, ctm, x, y + height);
          for (const [a, b] of [[p0, p1], [p1, p2], [p2, p3], [p3, p0]]) {
            const line = makeLine(a, b);
            if (line) lines.push(line);
          }
          current = p0;
          subpathStart = p0;
        } else if (pathOp === OPS.closePath && current && subpathStart) {
          const line = makeLine(current, subpathStart);
          if (line) lines.push(line);
          current = subpathStart;
        }
        pointer += pathArgCount(pathOp, OPS);
      }
    }

    const uniqueRects = dedupeRects(rects);

    // Browser-printed Omnivox schedules often encode table borders as thin
    // filled rectangles rather than standalone cell rectangles. Treat those
    // as line segments too, so the parser can reconstruct class cells.
    for (const rect of uniqueRects) {
      if (rect.width >= 8 && rect.height <= 2.5) {
        const y = (rect.y0 + rect.y1) / 2;
        const line = makeLine({ x: rect.x0, y }, { x: rect.x1, y });
        if (line) lines.push(line);
      }
      if (rect.height >= 8 && rect.width <= 2.5) {
        const x = (rect.x0 + rect.x1) / 2;
        const line = makeLine({ x, y: rect.y0 }, { x, y: rect.y1 });
        if (line) lines.push(line);
      }
    }

    return { rects: uniqueRects, lines: dedupeLines(lines) };
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
    const startIndex = Math.max(0, starts.indexOf(startMatch.marker));
    const tolerance = Math.max(5, rowHeight * 0.42);

    // Strongest signal: a class cell spans an integer number of visual
    // timetable rows. Map the top to a printed start label and use the number
    // of rows to choose the matching printed end label. This is much more
    // stable for browser-printed PDFs than comparing the bottom edge directly
    // to a text baseline.
    const rowEstimate = rect.height / rowHeight;
    const roundedRows = Math.max(1, Math.round(rowEstimate));
    if (
      startMatch.distance <= tolerance * 1.5 &&
      Math.abs(rowEstimate - roundedRows) <= 0.28 &&
      startIndex + roundedRows - 1 < ends.length
    ) {
      const start = starts[startIndex].time;
      const end = ends[startIndex + roundedRows - 1].time;
      if (minutes(end) > minutes(start)) return { start, end };
    }

    const endMatch = nearestMarker(ends, rect.y1, "y1");
    const start = startMatch.marker.time;
    const end = endMatch.marker.time;

    if (startMatch.distance <= tolerance && endMatch.distance <= tolerance && minutes(end) > minutes(start)) {
      return { start, end };
    }

    // A cell bottom can also line up more closely with the next row's start
    // label than the previous row's end label. Support that geometry too.
    const nextStarts = starts
      .map((marker, index) => ({ marker, index }))
      .filter(entry => entry.index > startIndex);
    if (nextStarts.length) {
      let best = nextStarts[0];
      let bestDistance = Math.abs(best.marker.y0 - rect.y1);
      for (const entry of nextStarts.slice(1)) {
        const distance = Math.abs(entry.marker.y0 - rect.y1);
        if (distance < bestDistance) {
          best = entry;
          bestDistance = distance;
        }
      }
      const endIndex = best.index - 1;
      if (bestDistance <= tolerance * 1.5 && endIndex >= startIndex && endIndex < ends.length) {
        const candidateEnd = ends[endIndex].time;
        if (minutes(candidateEnd) > minutes(start)) return { start, end: candidateEnd };
      }
    }

    const validEnds = ends.filter(marker => marker.y1 > startMatch.marker.y0 && minutes(marker.time) > minutes(start));
    if (validEnds.length) {
      const candidate = nearestMarker(validEnds, rect.y1, "y1");
      if (candidate.distance <= tolerance * 1.8) return { start, end: candidate.marker.time };
    }

    const fallbackRows = Math.max(1, Math.floor((rect.height / rowHeight) + 0.25));
    const fallbackStart = starts[startIndex].time;
    const fallbackEndIndex = startIndex + fallbackRows - 1;
    if (fallbackEndIndex < ends.length) {
      return { start: fallbackStart, end: ends[fallbackEndIndex].time };
    }
    return { start: fallbackStart, end: hhmm(minutes(fallbackStart) + fallbackRows * 30 - 10) };
  }

  function horizontalOverlap(leftA, rightA, leftB, rightB) {
    return Math.max(0, Math.min(rightA, rightB) - Math.max(leftA, leftB));
  }

  function dedupeNumbers(values, tolerance = 1.3) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const groups = [];
    for (const value of sorted) {
      const last = groups[groups.length - 1];
      if (!last || Math.abs(last[last.length - 1] - value) > tolerance) {
        groups.push([value]);
      } else {
        last.push(value);
      }
    }
    return groups.map(group => group.reduce((sum, value) => sum + value, 0) / group.length);
  }

  function columnBoundaries(model, column, gridTop, gridBottom, rowHeight) {
    const values = [];

    for (const line of model.lines || []) {
      if (!line.horizontal) continue;
      const y = (line.y0 + line.y1) / 2;
      if (y < gridTop - rowHeight || y > gridBottom + rowHeight) continue;
      const overlap = horizontalOverlap(line.minX, line.maxX, column.left, column.right);
      if (overlap >= column.width * 0.55) values.push(y);
    }

    for (const rect of model.rects || []) {
      if (rect.y1 < gridTop - rowHeight || rect.y0 > gridBottom + rowHeight) continue;
      const overlap = horizontalOverlap(rect.x0, rect.x1, column.left, column.right);
      if (overlap < column.width * 0.55) continue;

      // Full-width cells and thin border rectangles both contribute useful
      // top/bottom boundaries.
      if (rect.width >= column.width * 0.70 || rect.height <= 2.5) {
        values.push(rect.y0, rect.y1);
      }
    }

    return dedupeNumbers(values, Math.max(1.0, rowHeight * 0.10));
  }

  function courseCodeMatches(text) {
    const matches = String(text || "").match(new RegExp(CODE_RE.source, "ig")) || [];
    return [...new Set(matches.map(value => value.toUpperCase()))];
  }

  function candidateCellFromBoundaries(model, column, anchor, targetCode, boundaries, rowHeight) {
    if (boundaries.length < 2) return null;

    const above = boundaries.filter(y => y < anchor.cy - 0.8).slice(-6).reverse();
    const below = boundaries.filter(y => y > anchor.cy + 0.8).slice(0, 6);
    let best = null;

    for (const top of above) {
      for (const bottom of below) {
        const height = bottom - top;
        if (height < rowHeight * 1.35 || height > rowHeight * 10.5) continue;

        const rect = {
          x0: column.left,
          x1: column.right,
          y0: top,
          y1: bottom,
          width: column.width,
          height,
        };
        const lines = groupTextLines(textInsideRect(model.items, rect, 0.2), 2.8);
        if (!lines.length) continue;

        const joined = lines.join("\n");
        const codes = courseCodeMatches(joined);
        if (!codes.includes(targetCode)) continue;

        // A valid class region should describe one class. Reject regions that
        // swallow a neighboring class because that tends to produce wrong
        // start/end times.
        const otherCodes = codes.filter(code => code !== targetCode);
        if (otherCodes.length) continue;

        let score = 20;
        if (SECTION_RE.test(joined)) score += 7;
        if (ROOM_RE.test(joined)) score += 7;
        if (lines.some(line => !CODE_RE.test(line) && !SECTION_RE.test(line) && !ROOM_RE.test(line) && line.toLowerCase() !== "classroom")) score += 4;
        score += Math.min(lines.length, 7);
        score -= Math.abs((height / rowHeight) - Math.round(height / rowHeight)) * 7;
        score -= (height / rowHeight) * 0.25;

        if (!best || score > best.score || (score === best.score && height < best.rect.height)) {
          best = { rect, lines, score };
        }
      }
    }

    return best;
  }

  function existingCellForAnchor(model, column, anchor, rowHeight, gridTop) {
    const candidates = (model.rects || []).filter(rect => {
      const center = (rect.x0 + rect.x1) / 2;
      const horizontalMatch = Math.abs(center - column.center) <= column.width * 0.20;
      const widthMatch = rect.width >= column.width * 0.72 && rect.width <= column.width * 1.22;
      const containsAnchor = anchor.cx >= rect.x0 - 1 && anchor.cx <= rect.x1 + 1 && anchor.cy >= rect.y0 - 1 && anchor.cy <= rect.y1 + 1;
      return horizontalMatch && widthMatch && containsAnchor && rect.y0 >= gridTop - rowHeight * 0.35 && rect.height >= rowHeight * 1.35;
    });
    if (!candidates.length) return null;

    candidates.sort((a, b) => a.height - b.height);
    for (const rect of candidates) {
      const lines = groupTextLines(textInsideRect(model.items, rect), 2.8);
      const codes = courseCodeMatches(lines.join("\n"));
      if (codes.length === 1 && codes[0] === anchor.text.match(CODE_RE)?.[1]?.toUpperCase()) {
        return { rect, lines };
      }
    }
    return null;
  }

  function extractClasses(model) {
    const { items, rects } = model;
    const { columns, dayItems } = findDayColumns(items, rects);
    const { starts, ends, rowHeight } = findTimeMarkers(items, columns, dayItems);
    const gridTop = starts[0].y0 - rowHeight * 0.45;
    const gridBottom = ends[ends.length - 1].y1 + rowHeight * 0.75;
    const classes = [];
    const seen = new Set();

    for (const day of DAYS) {
      const column = columns[day];
      const boundaries = columnBoundaries(model, column, gridTop, gridBottom, rowHeight);

      // Anchor parsing on the course-code text itself. This works for both the
      // original Omnivox PDFs (where class cells are rectangles) and
      // browser-printed versions (where the timetable is often a network of
      // horizontal/vertical line segments instead).
      const anchors = items
        .filter(item =>
          item.cy >= gridTop &&
          item.cy <= gridBottom &&
          item.cx >= column.left - 1 &&
          item.cx <= column.right + 1 &&
          CODE_RE.test(item.text)
        )
        .sort((a, b) => a.cy - b.cy);

      for (const anchor of anchors) {
        const targetMatch = anchor.text.match(CODE_RE);
        if (!targetMatch) continue;
        const targetCode = targetMatch[1].toUpperCase();

        let cell = existingCellForAnchor(model, column, anchor, rowHeight, gridTop);
        if (!cell) {
          cell = candidateCellFromBoundaries(model, column, anchor, targetCode, boundaries, rowHeight);
        }

        if (!cell) {
          // Last-resort text window. It is intentionally conservative: if the
          // page contains no usable cell geometry at all, collect a small
          // vertical region around the code and infer the row span from the
          // nearest printed time labels.
          const centerY = anchor.cy;
          const topStart = nearestMarker(starts, centerY, "center").marker;
          const startIndex = Math.max(0, starts.indexOf(topStart));
          const top = starts[startIndex].y0 - rowHeight * 0.35;
          const bottomIndex = Math.min(ends.length - 1, startIndex + 3);
          const bottom = ends[bottomIndex].y1 + rowHeight * 0.35;
          const rect = { x0: column.left, x1: column.right, y0: top, y1: bottom, width: column.width, height: bottom - top };
          const lines = groupTextLines(textInsideRect(items, rect, 0.2), 2.8);
          const codes = courseCodeMatches(lines.join("\n"));
          if (codes.length === 1 && codes[0] === targetCode) cell = { rect, lines };
        }

        if (!cell) continue;

        const parsed = parseClassLines(cell.lines);
        if (!parsed.course_code) parsed.course_code = targetCode;

        let start;
        let end;
        if (parsed.explicitTime) {
          ({ start, end } = parsed.explicitTime);
          delete parsed.explicitTime;
        } else {
          ({ start, end } = timesFromRectangle(cell.rect, starts, ends, rowHeight));
        }

        if (minutes(end) <= minutes(start)) continue;

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

    const geometry = buildGeometry(operatorList, viewport, pdfjs);
    return {
      items: buildTextItems(textContent, viewport, pdfjs),
      rects: geometry.rects,
      lines: geometry.lines,
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
    version: "browser-parser-2",
    // Exposed for deterministic local tests; the app UI does not use these.
    __test: { parseScheduleModel, parseClassLines, groupTextLines, extractClasses },
  };
})();
