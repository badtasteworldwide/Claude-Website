/* Bad Taste 3D frame viewer loader (ES module).
   Keeps three.js (~180 KB gzipped) off the page until a viewer is opened,
   or until an autoload viewer scrolls into view. No dynamic import: Shopify's
   minifier rewrites it into require(), which browsers lack. The viewer module is added as a
   <script type="module"> and registers window.BTWframeViewer. */
(function () {
  'use strict';

  var saveData = navigator.connection && navigator.connection.saveData;
  var viewerModule = null;

  function loadViewer(url) {
    if (window.BTWframeViewer) return Promise.resolve(window.BTWframeViewer);
    if (!viewerModule) {
      viewerModule = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.type = 'module';
        s.src = url;
        s.onload = function () {
          if (window.BTWframeViewer) resolve(window.BTWframeViewer);
          else reject(new Error('3D viewer module did not register'));
        };
        s.onerror = function () { viewerModule = null; reject(new Error('3D viewer module failed to load')); };
        document.head.appendChild(s);
      });
    }
    return viewerModule;
  }

  function setStatus(root, msg) {
    var s = root.querySelector('[data-frame3d-status]');
    if (s) s.textContent = msg;
  }

  function start(root) {
    if (root._viewer) return root._viewer;
    var canvas = root.querySelector('[data-frame3d-canvas]');
    var startBtn = root.querySelector('[data-frame3d-start]');
    if (startBtn) startBtn.disabled = true;
    setStatus(root, 'Loading 3D view…');
    root._viewer = loadViewer(root.dataset.module)
      .then(function (mod) {
        canvas.hidden = false;
        return mod.mount(canvas, root.dataset.texture);
      })
      .then(function (viewer) {
        var poster = root.querySelector('[data-frame3d-poster]');
        if (poster) poster.hidden = true;
        if (startBtn) startBtn.hidden = true;
        root.querySelector('[data-frame3d-controls]').hidden = false;
        root.dataset.ready = 'true';
        var spin = root.querySelector('[data-frame3d-action="turntable"]');
        viewer.onInteract = function () {
          viewer.setTurntable(false);
          if (spin) spin.setAttribute('aria-pressed', 'false');
        };
        setStatus(root, '3D view loaded: ' + root.dataset.title + '.');
        return viewer;
      })
      .catch(function (err) {
        console.error(err);
        root._viewer = null;
        if (startBtn) startBtn.disabled = false;
        setStatus(root, 'The 3D view couldn’t load on this device. Photos are still available.');
      });
    return root._viewer;
  }

  /** Swap the design shown in a viewer (homepage picker). */
  function showTexture(root, url, title) {
    root.dataset.texture = url;
    root.dataset.title = title;
    var canvas = root.querySelector('[data-frame3d-canvas]');
    if (canvas) canvas.setAttribute('aria-label', '3D view of ' + title + '. Drag, or use the arrow keys, to rotate.');
    if (!root._viewer) return start(root);
    return root._viewer.then(function (v) {
      if (!v) return;
      setStatus(root, 'Loading ' + title + '…');
      return v.show(url).then(function () { setStatus(root, 'Showing ' + title + '.'); });
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-frame3d-start]');
    if (btn) { start(btn.closest('[data-frame3d]')); return; }

    var act = e.target.closest('[data-frame3d-action]');
    if (act) {
      var root = act.closest('[data-frame3d]');
      if (!root._viewer) return;
      root._viewer.then(function (v) {
        if (!v) return;
        var a = act.dataset.frame3dAction;
        if (a === 'left') v.rotateBy(-0.35);
        else if (a === 'right') v.rotateBy(0.35);
        else if (a === 'reset') v.resetView();
        else {
          var on = act.getAttribute('aria-pressed') !== 'true';
          act.setAttribute('aria-pressed', String(on));
          if (a === 'turntable') v.setTurntable(on);
          if (a === 'plate') v.setPlate(on);
        }
      });
    }
  });

  // Autoload viewers once they're near the viewport (skipped on Data Saver).
  if ('IntersectionObserver' in window && !saveData) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        start(entry.target);
      });
    }, { rootMargin: '200px' });
    document.querySelectorAll('[data-frame3d][data-autoload]').forEach(function (el) { io.observe(el); });
  }

  window.BTWframe3d = { start: start, showTexture: showTexture };
})();
