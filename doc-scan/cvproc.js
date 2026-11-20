/* Doc Scan — image processing with OpenCV.js (shared by worker.js and tests) */
(function (root) {
  'use strict';

  function del() { for (var i = 0; i < arguments.length; i++) { var m = arguments[i]; if (m && !m.isDeleted()) m.delete(); } }

  function orderQuad(pts) {
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p.x / 4; cy += p.y / 4; });
    var s = pts.slice().sort(function (a, b) {
      return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
    });
    // atan2 order (y down) = clockwise starting from left; rotate so first = min(x+y) (top-left)
    var k = 0, best = Infinity;
    s.forEach(function (p, i) { if (p.x + p.y < best) { best = p.x + p.y; k = i; } });
    return s.slice(k).concat(s.slice(0, k)); // tl, tr, br, bl
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function polyArea(p) {
    var a = 0;
    for (var i = 0; i < p.length; i++) { var j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; }
    return Math.abs(a) / 2;
  }

  function matToPts(m) {
    var out = [];
    for (var i = 0; i < m.rows; i++) out.push({ x: m.data32S[i * 2], y: m.data32S[i * 2 + 1] });
    return out;
  }

  /* Largest-area quadrilateral whose corners are taken from a convex polygon (hull order). */
  function maxAreaQuad(pts) {
    var n = pts.length;
    if (n < 4) return null;
    if (n === 4) return pts.slice();
    var best = null, ba = -1;
    for (var a = 0; a < n - 3; a++) for (var b = a + 1; b < n - 2; b++) for (var c = b + 1; c < n - 1; c++) for (var d = c + 1; d < n; d++) {
      var q = [pts[a], pts[b], pts[c], pts[d]], ar = polyArea(q);
      if (ar > ba) { ba = ar; best = q; }
    }
    return best;
  }

  /* Quad from a contour: convex hull -> simplify to <=14 points -> max-area 4 corners. */
  function quadFromContour(cv, c) {
    var hull = new cv.Mat();
    cv.convexHull(c, hull, false, true);
    var peri = cv.arcLength(hull, true), approx = new cv.Mat(), pts = null;
    var eps = 0.008;
    for (var k = 0; k < 8; k++) {
      cv.approxPolyDP(hull, approx, eps * peri, true);
      if (approx.rows <= 14) break;
      eps *= 1.5;
    }
    if (approx.rows >= 4) pts = maxAreaQuad(matToPts(approx));
    var hullArea = cv.contourArea(hull);
    del(hull, approx);
    return pts ? { q: orderQuad(pts), hullArea: hullArea } : null;
  }

  /* Mean of a 1-channel map inside quad vs. a ring just outside it. */
  function quadContrast(cv, map, q) {
    var W = map.cols, H = map.rows;
    var inner = cv.Mat.zeros(H, W, cv.CV_8U), outer = cv.Mat.zeros(H, W, cv.CV_8U);
    var c = q.reduce(function (s, p) { return { x: s.x + p.x / 4, y: s.y + p.y / 4 }; }, { x: 0, y: 0 });
    var grow = function (f) { return q.map(function (p) { return Math.round(c.x + (p.x - c.x) * f); }).map(function (x, i) { return [x, Math.round(c.y + (q[i].y - c.y) * f)]; }); };
    var fill = function (m, ptsArr, val) {
      var flat = []; ptsArr.forEach(function (p) { flat.push(p[0], p[1]); });
      var mat = cv.matFromArray(4, 1, cv.CV_32SC2, flat), v = new cv.MatVector(); v.push_back(mat);
      cv.fillPoly(m, v, new cv.Scalar(val)); del(mat, v);
    };
    fill(inner, grow(0.9), 255);
    fill(outer, grow(1.15), 255); fill(outer, grow(1.0), 0);
    var mi = cv.mean(map, inner)[0], mo = cv.mean(map, outer)[0];
    var hasOut = cv.countNonZero(outer) > 50;
    del(inner, outer);
    return hasOut ? mi - mo : 40; // quad touching the frame: no ring to compare
  }

  /* Brightness step across a side at point (px,py): inside (along normal n) minus outside, on two smoothed maps. */
  function stepAt(maps, px, py, nx, ny) {
    var best = -999;
    for (var mI = 0; mI < maps.length; mI++) {
      var m = maps[mI], W = m.cols, H = m.rows, d = m.data;
      var xi = Math.round(px + nx * 3), yi = Math.round(py + ny * 3), xo = Math.round(px - nx * 3), yo = Math.round(py - ny * 3);
      var vin = (xi >= 0 && yi >= 0 && xi < W && yi < H) ? d[yi * W + xi] : -1;
      var vout = (xo >= 0 && yo >= 0 && xo < W && yo < H) ? d[yo * W + xo] : -1;
      if (vin < 0) continue;
      if (vout < 0) return 40; // outside the frame: paper runs off the edge
      if (vin - vout > best) best = vin - vout;
    }
    return best;
  }

  /* Fraction of each side that sits on a real paper edge (brighter inside); frame-border sides count as supported. */
  function edgeSupport(maps, q) {
    var W = maps[0].cols, H = maps[0].rows, sides = [];
    for (var s = 0; s < 4; s++) {
      var a = q[s], b = q[(s + 1) % 4];
      var onBorder = function (p) { return p.x < 3 || p.y < 3 || p.x > W - 4 || p.y > H - 4; };
      if (onBorder(a) && onBorder(b) && (Math.abs(a.x - b.x) < 4 || Math.abs(a.y - b.y) < 4)) { sides.push(1); continue; }
      var len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, hit = 0, N = 32;
      for (var k = 0; k < N; k++) {
        var t = 0.08 + 0.84 * k / (N - 1), px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t, m = -999;
        for (var o = -3; o <= 3; o++) m = Math.max(m, stepAt(maps, px + nx * o, py + ny * o, nx, ny));
        if (m > 16) hit++;
      }
      sides.push(hit / N);
    }
    var sorted = sides.slice().sort(function (p, r) { return p - r; });
    return { min: sorted[0], mean: (sides[0] + sides[1] + sides[2] + sides[3]) / 4 };
  }

  /* Snap each side of a rough quad onto the strongest nearby paper edge, then re-intersect the four lines. */
  function refineQuad(maps, q, R) {
    var W = maps[0].cols, H = maps[0].rows, lines = [];
    for (var s = 0; s < 4; s++) {
      var a = q[s], b = q[(s + 1) % 4];
      var len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, pts = [];
      var N = Math.max(12, Math.min(60, Math.round(len / 4)));
      for (var k = 0; k < N; k++) {
        var t = 0.06 + 0.88 * k / (N - 1), px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t, bm = -999, bo = 0;
        for (var o = -R; o <= R; o++) {
          var m = stepAt(maps, px + nx * o, py + ny * o, nx, ny) - Math.abs(o) * 0.6;
          if (m > bm) { bm = m; bo = o; }
        }
        if (bm > 16) pts.push({ x: px + nx * bo, y: py + ny * bo });
      }
      if (pts.length < N * 0.3) { lines.push(null); continue; }
      lines.push(fitLine(pts));
    }
    var out = [];
    for (var c = 0; c < 4; c++) {
      var l1 = lines[(c + 3) % 4], l2 = lines[c];
      var p = l1 && l2 ? intersect(l1, l2) : null;
      if (!p || Math.hypot(p.x - q[c].x, p.y - q[c].y) > R * 2.5) p = q[c];
      out.push({ x: Math.min(W - 1, Math.max(0, p.x)), y: Math.min(H - 1, Math.max(0, p.y)) });
    }
    return out;
  }
  function fitLine(pts) {
    var use = pts;
    for (var it = 0; it < 2; it++) {
      var mx = 0, my = 0; use.forEach(function (p) { mx += p.x; my += p.y; }); mx /= use.length; my /= use.length;
      var sxx = 0, sxy = 0, syy = 0;
      use.forEach(function (p) { var dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; });
      var th = 0.5 * Math.atan2(2 * sxy, sxx - syy), dx0 = Math.cos(th), dy0 = Math.sin(th);
      var line = { x: mx, y: my, dx: dx0, dy: dy0 };
      if (it === 1 || use.length < 8) return line;
      var res = use.map(function (p) { return { p: p, r: Math.abs((p.x - mx) * dy0 - (p.y - my) * dx0) }; }).sort(function (u, v) { return u.r - v.r; });
      use = res.slice(0, Math.max(6, Math.round(res.length * 0.7))).map(function (u) { return u.p; });
    }
    return line;
  }
  function intersect(l1, l2) {
    var den = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(den) < 1e-6) return null;
    var t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / den;
    return { x: l1.x + l1.dx * t, y: l1.y + l1.dy * t };
  }

  /* Find the document's four corners. Returns normalized [tl,tr,br,bl] or null. */
  function detectQuad(cv, imageData) {
    var src0 = cv.matFromImageData(imageData);
    // work at <=480px for speed and to blur away fine wood grain / paper texture
    var sc = Math.min(1, 480 / Math.max(imageData.width, imageData.height));
    var src = new cv.Mat();
    if (sc < 1) cv.resize(src0, src, new cv.Size(Math.round(imageData.width * sc), Math.round(imageData.height * sc)), 0, 0, cv.INTER_AREA);
    else src0.copyTo(src);
    src0.delete();
    var W = src.cols, H = src.rows, area = W * H;
    var rgb = new cv.Mat(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB); src.delete();

    // "paperness": bright and colourless (white/grey paper vs wood, fabric, desks)
    var lab = new cv.Mat(); cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    var ch = new cv.MatVector(); cv.split(lab, ch);
    var L = ch.get(0), A = ch.get(1), B = ch.get(2);
    var paper = new cv.Mat(H, W, cv.CV_8U);
    var ld = L.data, ad = A.data, bd = B.data, pd = paper.data;
    for (var i = 0; i < pd.length; i++) {
      var chroma = Math.abs(ad[i] - 128) + Math.abs(bd[i] - 128);
      var v = ld[i] - 2.2 * chroma;
      pd[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    cv.medianBlur(paper, paper, 5);
    var gray = new cv.Mat(); cv.GaussianBlur(L, gray, new cv.Size(5, 5), 0);
    del(lab, ch, A, B);

    var cands = [];
    function collect(bin, tag) {
      var contours = new cv.MatVector(), hier = new cv.Mat();
      cv.findContours(bin, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      for (var k = 0; k < contours.size(); k++) {
        var c = contours.get(k), a = cv.contourArea(c);
        if (a >= 0.07 * area) {
          var r = quadFromContour(cv, c);
          if (r) {
            var qa = polyArea(r.q);
            var minSide = Math.min(dist(r.q[0], r.q[1]), dist(r.q[1], r.q[2]), dist(r.q[2], r.q[3]), dist(r.q[3], r.q[0]));
            var solidity = a / Math.max(1, r.hullArea), fit = qa / Math.max(1, r.hullArea);
            if (qa < 0.985 * area && minSide > 0.12 * Math.min(W, H) && fit > 0.82 && solidity > 0.75) {
              cands.push({ q: r.q, area: qa, fit: fit, tag: tag });
            }
          }
        }
        c.delete();
      }
      del(contours, hier);
    }

    var bin = new cv.Mat(), k5 = cv.Mat.ones(5, 5, cv.CV_8U), k9 = cv.Mat.ones(9, 9, cv.CV_8U);
    // A) segment paper by paperness (Otsu) — robust on wood / coloured desks
    cv.threshold(paper, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k5);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k9);
    collect(bin, 'paper');
    var seg = new cv.Mat(); cv.threshold(paper, seg, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    var k15 = cv.Mat.ones(15, 15, cv.CV_8U);
    cv.morphologyEx(seg, bin, cv.MORPH_OPEN, k15);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k9);
    collect(bin, 'paper15');
    seg.delete();
    // B) brightness only (grey or slightly tinted paper)
    cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k5);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k9);
    collect(bin, 'bright');
    cv.threshold(gray, seg = new cv.Mat(), 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(seg, bin, cv.MORPH_OPEN, k15);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k9);
    collect(bin, 'bright15');
    del(seg, k15);
    // C) edges (paper on a light desk): strong blur kills grain, then close gaps
    var bl = new cv.Mat(); cv.medianBlur(gray, bl, 7);
    var med = percentileMat(bl, 0.5);
    cv.Canny(bl, bin, Math.max(10, 0.66 * med * 0.5), Math.max(30, 1.33 * med * 0.5));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k5);
    var filled = fillClosed(cv, bin);
    collect(filled, 'edge');
    filled.delete();
    var pb = new cv.Mat(); cv.GaussianBlur(paper, pb, new cv.Size(5, 5), 0);
    cv.Canny(pb, bin, 20, 60);
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k5);
    filled = fillClosed(cv, bin);
    collect(filled, 'pedge');
    pb.delete();
    del(bin, k5, k9, bl, filled);

    // score: big, really quadrilateral, and brighter/whiter inside than just outside
    // smoothed maps for edge tests
    var sm1 = new cv.Mat(), sm2 = new cv.Mat();
    cv.medianBlur(gray, sm1, 5); cv.medianBlur(paper, sm2, 5);
    var maps = [sm1, sm2];

    var best = null;
    cands.forEach(function (c) {
      var con = Math.max(quadContrast(cv, paper, c.q), quadContrast(cv, gray, c.q));
      if (con < 12) return;
      var r1 = refineQuad(maps, c.q, 12);
      c.q = orderQuad(refineQuad(maps, r1, 5));
      var es = edgeSupport(maps, c.q);
      if (es.min < 0.35) return;
      c.area = polyArea(c.q);
      c.score = Math.sqrt(c.area / area) * Math.min(1, con / 60) * c.fit * es.mean * es.mean * (0.5 + es.min);
      if (!best || c.score > best.score) best = c;
    });
    del(rgb, L, paper, gray, sm1, sm2);
    if (!best) return null;
    return best.q.map(function (p) { return { x: Math.min(1, Math.max(0, p.x / W)), y: Math.min(1, Math.max(0, p.y / H)) }; });
  }

  function percentileMat(m, p) {
    var h = new Uint32Array(256), d = m.data;
    for (var i = 0; i < d.length; i += 4) h[d[i]]++;
    var tot = Math.ceil(d.length / 4), acc = 0;
    for (var v = 0; v < 256; v++) { acc += h[v]; if (acc >= tot * p) return v; }
    return 128;
  }

  /* Turn closed edge loops into filled blobs. */
  function fillClosed(cv, edges) {
    var contours = new cv.MatVector(), hier = new cv.Mat();
    cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    var out = cv.Mat.zeros(edges.rows, edges.cols, cv.CV_8U);
    for (var i = 0; i < contours.size(); i++) {
      if (cv.contourArea(contours.get(i)) > 0.07 * edges.rows * edges.cols) cv.drawContours(out, contours, i, new cv.Scalar(255), -1);
    }
    del(contours, hier);
    return out;
  }

  function rotateSmall(cv, mat, deg) {
    if (!deg || Math.abs(deg) < 0.05) return mat;
    var center = new cv.Point(mat.cols / 2, mat.rows / 2);
    var M = cv.getRotationMatrix2D(center, deg, 1);
    var out = new cv.Mat();
    cv.warpAffine(mat, out, M, new cv.Size(mat.cols, mat.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    del(M, mat);
    return out;
  }

  /* Estimate text/table skew in degrees (positive = content tilted clockwise). */
  function estimateSkew(cv, rgb) {
    var scale = Math.min(1, 900 / Math.max(rgb.cols, rgb.rows));
    var small = new cv.Mat();
    cv.resize(rgb, small, new cv.Size(Math.round(rgb.cols * scale), Math.round(rgb.rows * scale)), 0, 0, cv.INTER_AREA);
    var gray = new cv.Mat();
    cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);
    var edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);
    var lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI / 360, 60, small.cols / 5, 8);
    var angles = [];
    for (var i = 0; i < lines.rows; i++) {
      var x1 = lines.data32S[i * 4], y1 = lines.data32S[i * 4 + 1], x2 = lines.data32S[i * 4 + 2], y2 = lines.data32S[i * 4 + 3];
      var a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      if (a > 90) a -= 180; if (a <= -90) a += 180;
      var len = Math.hypot(x2 - x1, y2 - y1);
      if (Math.abs(a) <= 12) angles.push({ a: a, w: len });
      else if (Math.abs(Math.abs(a) - 90) <= 12) angles.push({ a: a > 0 ? a - 90 : a + 90, w: len });
    }
    del(small, gray, edges, lines);
    if (angles.length < 3) return 0;
    angles.sort(function (p, q) { return p.a - q.a; });
    var tot = angles.reduce(function (s, p) { return s + p.w; }, 0), acc = 0;
    for (var j = 0; j < angles.length; j++) { acc += angles[j].w; if (acc >= tot / 2) return Math.round(angles[j].a * 10) / 10; }
    return 0;
  }

  /* Smooth background (paper + lighting) estimate for one channel. */
  function background(cv, ch) {
    var s = Math.min(1, 240 / Math.min(ch.cols, ch.rows));
    var small = new cv.Mat();
    cv.resize(ch, small, new cv.Size(Math.max(8, Math.round(ch.cols * s)), Math.max(8, Math.round(ch.rows * s))), 0, 0, cv.INTER_AREA);
    var k = cv.Mat.ones(7, 7, cv.CV_8U);
    cv.dilate(small, small, k);
    cv.medianBlur(small, small, 21);
    cv.GaussianBlur(small, small, new cv.Size(9, 9), 0);
    var bg = new cv.Mat();
    cv.resize(small, bg, new cv.Size(ch.cols, ch.rows), 0, 0, cv.INTER_LINEAR);
    del(small, k);
    return bg;
  }

  function normalizeChannel(cv, ch) {
    var bg = background(cv, ch);
    var out = new cv.Mat();
    cv.divide(ch, bg, out, 255);
    bg.delete();
    return out;
  }

  /* Map [lo,hi] -> [0,255] in place on an 8-bit Mat */
  function stretch(mat, lo, hi, gamma) {
    var lut = new Uint8Array(256);
    for (var v = 0; v < 256; v++) {
      var t = (v - lo) / Math.max(1, hi - lo);
      t = Math.min(1, Math.max(0, t));
      lut[v] = Math.round(Math.pow(t, gamma || 1) * 255);
    }
    var d = mat.data;
    for (var i = 0; i < d.length; i++) d[i] = lut[d[i]];
  }

  function percentile(mat, p) {
    var h = new Uint32Array(256), d = mat.data, step = Math.max(1, Math.floor(d.length / 200000));
    var n = 0;
    for (var i = 0; i < d.length; i += step) { h[d[i]]++; n++; }
    var target = n * p, acc = 0;
    for (var v = 0; v < 256; v++) { acc += h[v]; if (acc >= target) return v; }
    return 255;
  }

  function filterDoc(cv, rgb) {
    var gray = new cv.Mat();
    cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
    var n = normalizeChannel(cv, gray);
    var lo = Math.min(120, percentile(n, 0.01));
    stretch(n, lo, 225, 1.25);
    gray.delete();
    return n; // 1-channel
  }

  function filterBW(cv, rgb) {
    var gray = new cv.Mat();
    cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
    var n = normalizeChannel(cv, gray);
    var block = Math.max(15, Math.min(75, (Math.round(Math.min(n.cols, n.rows) / 40) | 1)));
    var out = new cv.Mat();
    cv.adaptiveThreshold(n, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 14);
    cv.medianBlur(out, out, 3);
    del(gray, n);
    return out;
  }

  function filterColor(cv, rgb, boost) {
    var chans = new cv.MatVector();
    cv.split(rgb, chans);
    var outV = new cv.MatVector();
    for (var i = 0; i < 3; i++) {
      var c = chans.get(i);
      var n = normalizeChannel(cv, c);
      stretch(n, 0, 238, 1.1);
      outV.push_back(n);
      del(c, n);
    }
    var merged = new cv.Mat();
    cv.merge(outV, merged);
    del(chans, outV);
    if (boost) {
      var hsv = new cv.Mat();
      cv.cvtColor(merged, hsv, cv.COLOR_RGB2HSV);
      var d = hsv.data;
      for (var j = 1; j < d.length; j += 3) d[j] = Math.min(255, Math.round(d[j] * 1.3));
      cv.cvtColor(hsv, merged, cv.COLOR_HSV2RGB);
      hsv.delete();
    }
    return merged;
  }

  /* True if the page has real colour (stamps, signatures, highlighter) after white-balancing. */
  function isColorful(cv, rgb) {
    var s = Math.min(1, 800 / Math.max(rgb.cols, rgb.rows));
    var small = new cv.Mat();
    cv.resize(rgb, small, new cv.Size(Math.round(rgb.cols * s), Math.round(rgb.rows * s)), 0, 0, cv.INTER_AREA);
    var wb = filterColor(cv, small, false);
    var hsv = new cv.Mat();
    cv.cvtColor(wb, hsv, cv.COLOR_RGB2HSV);
    var d = hsv.data, n = 0, hit = 0;
    for (var i = 0; i < d.length; i += 3) { n++; if (d[i + 1] > 80 && d[i + 2] > 60) hit++; }
    del(small, wb, hsv);
    return hit / n > 0.0015;
  }

  /*
   * opts: { quad: [{x,y}]*4 normalized | null, rot: 0|90|180|270, fine: deg (+ = clockwise),
   *         filter: 'auto'|'orig'|'doc'|'bw'|'color', autoDeskew, autoLight, autoFilter, mode, maxSide }
   */
  function processImage(cv, imageData, opts) {
    opts = opts || {};
    var info = { tilt: 0, filter: opts.filter || 'auto', warped: false };
    var rgba = cv.matFromImageData(imageData);
    var mat = new cv.Mat();
    cv.cvtColor(rgba, mat, cv.COLOR_RGBA2RGB);
    rgba.delete();
    var W = imageData.width, H = imageData.height;

    if (opts.quad) {
      var q = opts.quad.map(function (p) { return { x: p.x * W, y: p.y * H }; });
      var ow = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
      var oh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
      var maxSide = opts.maxSide || 3000;
      var sc = Math.min(1, maxSide / Math.max(ow, oh));
      ow = Math.max(16, Math.round(ow * sc)); oh = Math.max(16, Math.round(oh * sc));
      var srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
      var dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, ow, 0, ow, oh, 0, oh]);
      var M = cv.getPerspectiveTransform(srcPts, dstPts);
      var warped = new cv.Mat();
      cv.warpPerspective(mat, warped, M, new cv.Size(ow, oh), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
      del(srcPts, dstPts, M, mat);
      // trim a hair off each side so the paper edge / background never shows
      var bpx = Math.round(Math.min(ow, oh) * 0.006);
      if (bpx > 0) { var roi = warped.roi(new cv.Rect(bpx, bpx, ow - 2 * bpx, oh - 2 * bpx)); mat = roi.clone(); del(roi, warped); }
      else mat = warped;
      info.warped = true;
      var top = Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x), bot = Math.atan2(q[2].y - q[3].y, q[2].x - q[3].x);
      info.tilt = Math.round((top + bot) / 2 * 1800 / Math.PI) / 10;
      if (opts.mode === 'card') {
        if (mat.rows > mat.cols) { var r = new cv.Mat(); cv.rotate(mat, r, cv.ROTATE_90_COUNTERCLOCKWISE); mat.delete(); mat = r; }
        var cw = mat.cols, cr = new cv.Mat();
        cv.resize(mat, cr, new cv.Size(cw, Math.round(cw * 54 / 85.6)), 0, 0, cv.INTER_LINEAR);
        mat.delete(); mat = cr;
      }
    } else if (opts.autoDeskew) {
      var sk = estimateSkew(cv, mat);
      if (sk) { mat = rotateSmall(cv, mat, sk); info.tilt = sk; }
    }

    var rot = ((opts.rot || 0) % 360 + 360) % 360;
    if (rot) {
      var code = rot === 90 ? cv.ROTATE_90_CLOCKWISE : rot === 180 ? cv.ROTATE_180 : cv.ROTATE_90_COUNTERCLOCKWISE;
      var rr = new cv.Mat(); cv.rotate(mat, rr, code); mat.delete(); mat = rr;
    }
    if (opts.fine) mat = rotateSmall(cv, mat, -opts.fine);

    var f = opts.filter || 'auto';
    if (f === 'auto') {
      if (opts.autoLight === false) f = 'orig';
      else if (opts.autoFilter === false) f = 'doc';
      else f = isColorful(cv, mat) ? 'color' : 'doc';
    }
    info.filter = f;
    var out;
    if (f === 'doc') out = filterDoc(cv, mat);
    else if (f === 'bw') out = filterBW(cv, mat);
    else if (f === 'color') out = filterColor(cv, mat, true);
    else out = mat.clone();
    mat.delete();

    var rgbaOut = new cv.Mat();
    cv.cvtColor(out, rgbaOut, out.channels() === 1 ? cv.COLOR_GRAY2RGBA : cv.COLOR_RGB2RGBA);
    out.delete();
    var res = { width: rgbaOut.cols, height: rgbaOut.rows, data: new Uint8ClampedArray(rgbaOut.data), info: info };
    rgbaOut.delete();
    return res;
  }

  var api = { detectQuad: detectQuad, processImage: processImage, estimateSkew: estimateSkew, orderQuad: orderQuad };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CVPROC = api;
})(typeof self !== 'undefined' ? self : this);
