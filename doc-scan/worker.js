/* Doc Scan — OpenCV worker: keeps heavy image work off the UI thread */
/* global cv, CVPROC */
'use strict';
var ready = false, queue = [];

function handle(msg) {
  var d = msg.data, res, transfer = [];
  try {
    if (d.type === 'detect') {
      res = { quad: CVPROC.detectQuad(cv, d.image) };
    } else if (d.type === 'process') {
      var r = CVPROC.processImage(cv, d.image, d.opts);
      res = { width: r.width, height: r.height, data: r.data, info: r.info };
      transfer = [r.data.buffer];
    } else {
      res = {};
    }
    self.postMessage({ id: d.id, ok: true, res: res }, transfer);
  } catch (e) {
    self.postMessage({ id: d.id, ok: false, error: String(e && e.message || e) });
  }
}

self.onmessage = function (m) { if (ready) handle(m); else queue.push(m); };

try {
  importScripts('vendor/opencv.js', 'cvproc.js');
  var done = function () {
    if (ready) return;
    ready = true;
    self.postMessage({ type: 'ready' });
    queue.splice(0).forEach(handle);
  };
  // Never resolve a promise with the module itself: it is "thenable" and would loop forever.
  if (cv && cv.Mat) done();
  else if (cv && typeof cv.then === 'function' && !('onRuntimeInitialized' in cv)) cv.then(function (m) { self.cv = m; done(); });
  else { cv.onRuntimeInitialized = done; }
  var poll = setInterval(function () { if (self.cv && self.cv.Mat) { clearInterval(poll); done(); } }, 200);
} catch (e) {
  self.postMessage({ type: 'error', error: String(e && e.message || e) });
}
