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

  /* Find the document's four corners. Returns normalized [tl,tr,br,bl] or null. */
  function detectQuad(cv, imageData) {
    var W = imageData.width, H = imageData.height, area = W * H;
    var src = cv.matFromImageData(imageData);
    var gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    var best = null;

    function consider(bin) {
      var contours = new cv.MatVector(), hier = new cv.Mat();
      cv.findContours(bin, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (var i = 0; i < contours.size(); i++) {
        var c = contours.get(i);
        var a = cv.contourArea(c);
        if (a < 0.12 * area) { c.delete(); continue; }
        var hull = new cv.Mat();
        cv.convexHull(c, hull, false, true);
        var peri = cv.arcLength(hull, true);
        var approx = new cv.Mat();
        var pts = null;
        var epsList = [0.02, 0.03, 0.045, 0.06, 0.08];
        for (var e = 0; e < epsList.length; e++) {
          cv.approxPolyDP(hull, approx, epsList[e] * peri, true);
          if (approx.rows === 4) { pts = matToPts(approx); break; }
          if (approx.rows < 4) break;
        }
        if (pts) {
          var q = orderQuad(pts);
          var qa = polyArea(q);
          // reject near-whole-frame boxes (image border) and very thin shapes
          var minSide = Math.min(dist(q[0], q[1]), dist(q[1], q[2]), dist(q[2], q[3]), dist(q[3], q[0]));
          if (qa < 0.97 * area && minSide > 0.15 * Math.min(W, H) && (!best || qa > best.area)) best = { area: qa, q: q };
        }
        del(c, hull, approx);
      }
      del(contours, hier);
    }

    var edges = new cv.Mat();
    var k3 = cv.Mat.ones(3, 3, cv.CV_8U);
    // pass 1: Canny edges
    cv.Canny(gray, edges, 40, 120);
    cv.dilate(edges, edges, k3, new cv.Point(-1, -1), 2);
    consider(edges);
    // pass 2: Otsu threshold (bright paper on darker background)
    if (!best) {
      cv.threshold(gray, edges, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      var k9 = cv.Mat.ones(9, 9, cv.CV_8U);
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, k9);
      consider(edges);
      k9.delete();
    }
    del(src, gray, edges, k3);
    if (!best) return null;
    return best.q.map(function (p) { return { x: p.x / W, y: p.y / H }; });
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
