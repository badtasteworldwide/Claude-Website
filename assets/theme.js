/* BAD TASTE WORLDWIDE — Shopify theme controller */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  function money(cents) {
    var fmt = window.BTW && window.BTW.moneyFormat ? window.BTW.moneyFormat : '${{amount}}';
    var amount = (cents / 100).toFixed(2);
    return fmt.replace(/\{\{\s*amount[^}]*\}\}/, amount);
  }

  /* ---------------- Marquees (promo bar, trust strip) ---------------- */
  function initMarquees() {
    $$('[data-marquee]').forEach(function (el) {
      if (el.dataset.marqueeInit) return;
      el.dataset.marqueeInit = 'true';
      // Duplicate for a seamless loop; the copy is hidden from assistive tech and tab order.
      Array.prototype.slice.call(el.children).forEach(function (child) {
        var copy = child.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        $$('a, button', copy).forEach(function (a) { a.tabIndex = -1; });
        el.appendChild(copy);
      });
    });
    // Pause control for auto-scrolling text (WCAG 2.2.2); remembered per browser.
    var KEY = 'btw-motion-paused';
    function apply(paused) {
      document.documentElement.classList.toggle('motion-paused', paused);
      $$('[data-marquee-toggle]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(paused));
        b.setAttribute('aria-label', paused ? 'Play scrolling text' : 'Pause scrolling text');
        b.textContent = paused ? '▶' : '❚❚';
      });
    }
    withPrivacyApi(function () { apply(recall(KEY) === '1'); });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-marquee-toggle]')) return;
      var paused = !document.documentElement.classList.contains('motion-paused');
      store(KEY, paused ? '1' : '0');
      apply(paused);
    });
  }

  /* ---------------- Consent-aware storage ----------------
     Device storage for preferences only happens when Shopify's Customer
     Privacy API allows it (always true outside consent regions). */
  function canStore() {
    var cp = window.Shopify && window.Shopify.customerPrivacy;
    return !!(cp && cp.preferencesProcessingAllowed && cp.preferencesProcessingAllowed());
  }
  function store(k, v) { if (!canStore()) return; try { localStorage.setItem(k, v); } catch (e) {} }
  function recall(k) { if (!canStore()) return null; try { return localStorage.getItem(k); } catch (e) { return null; } }
  function withPrivacyApi(cb) {
    if (window.Shopify && window.Shopify.loadFeatures) {
      window.Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], function () { cb(); });
    } else cb();
  }

  /* ---------------- Dialog focus management ---------------- */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  var activeDialog = null;
  function openDialog(el, onClose) {
    activeDialog = { el: el, onClose: onClose, returnTo: document.activeElement };
    var first = $$(FOCUSABLE, el).filter(function (n) { return n.offsetParent !== null; })[0];
    if (first) setTimeout(function () { first.focus(); }, 50);
  }
  function closeDialog() {
    if (!activeDialog) return;
    var ret = activeDialog.returnTo;
    activeDialog = null;
    if (ret && ret.focus) ret.focus();
  }
  document.addEventListener('keydown', function (e) {
    if (!activeDialog) return;
    if (e.key === 'Escape') { e.preventDefault(); activeDialog.onClose(); return; }
    if (e.key !== 'Tab') return;
    var nodes = $$(FOCUSABLE, activeDialog.el).filter(function (n) { return n.offsetParent !== null; });
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------------- Cart drawer ---------------- */
  function openDrawer() {
    var d = $('#drawer'); var o = $('#drawerOverlay');
    if (!d) return;
    if (d.dataset.open === 'true') return;
    d.dataset.open = 'true'; d.setAttribute('aria-hidden', 'false'); d.inert = false;
    if (o) o.dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    openDialog(d, closeDrawer);
  }
  function closeDrawer() {
    var d = $('#drawer'); var o = $('#drawerOverlay');
    if (!d) return;
    if (d.dataset.open !== 'true') return;
    d.dataset.open = 'false'; d.setAttribute('aria-hidden', 'true'); d.inert = true;
    if (o) o.dataset.open = 'false';
    document.body.style.overflow = '';
    closeDialog();
  }
  window.BTWopenDrawer = openDrawer;
  window.BTWcloseDrawer = closeDrawer;

  function refreshDrawer(openAfter) {
    return fetch(window.location.pathname + '?sections=cart-drawer')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var html = data['cart-drawer'];
        if (!html) return;
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        var fresh = wrap.querySelector('#cart-drawer-root');
        var current = $('#cart-drawer-root');
        if (fresh && current) {
          var wasOpen = $('#drawer') && $('#drawer').dataset.open === 'true';
          current.replaceWith(fresh);
          bindDrawer();
          if (wasOpen) {
            // Re-render keeps the drawer open without stealing focus again.
            var nd = $('#drawer'), no = $('#drawerOverlay');
            nd.dataset.open = 'true'; nd.setAttribute('aria-hidden', 'false'); nd.inert = false;
            if (no) no.dataset.open = 'true';
            if (activeDialog) activeDialog.el = nd;
          } else if (openAfter) openDrawer();
        }
        return fetch('/cart.js').then(function (r) { return r.json(); }).then(updateCartCount);
      });
  }

  function updateCartCount(cart) {
    $$('[data-cart-count]').forEach(function (el) { el.textContent = cart.item_count; });
    var btn = $('#openCart');
    if (btn) btn.setAttribute('aria-label', 'Cart, ' + cart.item_count + (cart.item_count === 1 ? ' item' : ' items'));
    var status = $('[data-cart-status]');
    if (status) status.textContent = cart.item_count + (cart.item_count === 1 ? ' item' : ' items') + ' in your cart';
  }

  function bindDrawer() {
    var overlay = $('#drawerOverlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);
    var close = $('#closeDrawer');
    if (close) close.addEventListener('click', closeDrawer);
    var items = $('#drawerItems');
    if (items) items.addEventListener('click', onDrawerItemClick);
  }

  function onDrawerItemClick(e) {
    var t = e.target;
    var key = t.dataset.lineKey;
    if (!key) return;
    var qty;
    if (t.dataset.qty === '+') qty = parseInt(t.dataset.current, 10) + 1;
    else if (t.dataset.qty === '-') qty = Math.max(0, parseInt(t.dataset.current, 10) - 1);
    else if (t.dataset.remove !== undefined) qty = 0;
    else return;
    e.preventDefault();
    changeLine(key, qty);
  }

  function changeLine(key, qty) {
    return fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key, quantity: qty })
    }).then(function () { return refreshDrawer(false); });
  }

  function addItems(items, openAfter) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (err) { throw err; });
      return refreshDrawer(openAfter !== false);
    });
  }
  window.BTWaddItems = addItems;

  /* ---------------- Product forms (PDP + quick add) ---------------- */
  function bindProductForms() {
    document.addEventListener('submit', function (e) {
      var form = e.target.closest('form[data-product-form]');
      if (!form) return;
      e.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      var original = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
      var id = form.querySelector('[name="id"]').value;
      var qtyEl = form.querySelector('[name="quantity"]');
      var qty = qtyEl ? parseInt(qtyEl.value, 10) || 1 : 1;
      addItems([{ id: parseInt(id, 10), quantity: qty }])
        .catch(function (err) { alert((err && err.description) || 'Could not add to cart.'); })
        .finally(function () { if (btn) { btn.disabled = false; btn.textContent = original; } });
    });

    // one-click quick add buttons (single-variant products)
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-quick-add]');
      if (!t) return;
      e.preventDefault();
      var original = t.textContent;
      t.disabled = true; t.textContent = 'Adding…';
      addItems([{ id: parseInt(t.dataset.quickAdd, 10), quantity: 1 }])
        .catch(function (err) { alert((err && err.description) || 'Could not add to cart.'); })
        .finally(function () { t.disabled = false; t.textContent = original; });
    });
  }

  /* ---------------- Quantity steppers ---------------- */
  function bindQtySteppers() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-step], [data-qty-minus], [data-qty-plus]');
      if (!t) return;
      var input = t.parentElement.querySelector('input[type="number"]');
      if (!input) return;
      var up = t.hasAttribute('data-qty-plus') || t.dataset.step === '+';
      var min = parseInt(input.min, 10);
      if (isNaN(min)) min = 1;
      var v = parseInt(input.value, 10);
      if (isNaN(v)) v = min;
      input.value = Math.max(min, v + (up ? 1 : -1));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /* ---------------- PDP variant picker ---------------- */
  function bindVariantPickers() {
    $$('[data-variant-picker]').forEach(function (picker) {
      var json = $('[data-variants-json]', picker.closest('[data-pdp]') || document);
      if (!json) return;
      var variants = JSON.parse(json.textContent);
      picker.addEventListener('change', function () {
        var selected = $$('input[type=radio]:checked, select', picker).map(function (el) { return el.value; });
        var match = variants.find(function (v) {
          return selected.every(function (val, i) { return v.options[i] === val; });
        });
        var pdp = picker.closest('[data-pdp]');
        var idInput = $('form[data-product-form] [name="id"]', pdp);
        var btn = $('form[data-product-form] [type="submit"]', pdp);
        var priceEl = $('[data-price]', pdp);
        var compareEl = $('[data-compare-price]', pdp);
        if (!match) { if (btn) { btn.disabled = true; btn.textContent = 'Unavailable'; } return; }
        if (idInput) idInput.value = match.id;
        if (priceEl) priceEl.textContent = money(match.price);
        if (compareEl) {
          if (match.compare_at_price > match.price) {
            compareEl.textContent = money(match.compare_at_price);
            compareEl.hidden = false;
          } else compareEl.hidden = true;
        }
        if (btn) {
          btn.disabled = !match.available;
          btn.textContent = match.available ? (btn.dataset.label || 'Add To Cart →') : 'Sold Out';
        }
        if (match.featured_media && match.featured_media.preview_image) {
          var img = $('.pdp__main-img img', pdp);
          if (img) { img.removeAttribute('srcset'); img.src = match.featured_media.preview_image.src; }
        }
      });
    });
    // PDP thumbnails (photos + optional 3D view)
    document.addEventListener('click', function (e) {
      var t = e.target.closest('.pdp__thumb, [data-pdp-show-3d]');
      if (!t) return;
      var pdp = t.closest('[data-pdp]');
      if (!t.classList.contains('pdp__thumb')) t = $('.pdp__thumb--3d', pdp) || t;
      var mainBox = $('[data-pdp-main]', pdp);
      var stage = $('[data-pdp-3d]', pdp);
      var main = mainBox && $('img', mainBox);
      var show3d = t.hasAttribute('data-pdp-show-3d');
      if (!show3d && !(main && t.dataset.src)) return;
      $$('.pdp__thumb', pdp).forEach(function (th) { th.dataset.active = String(th === t); });
      if (stage) stage.hidden = !show3d;
      if (mainBox) mainBox.hidden = show3d;
      if (show3d) {
        var viewer = $('[data-frame3d]', stage);
        if (viewer && window.BTWframe3d) window.BTWframe3d.start(viewer);
        return;
      }
      // srcset wins over src, so both must change.
      if (t.dataset.srcset) main.srcset = t.dataset.srcset;
      main.src = t.dataset.src;
      main.alt = ($('img', t) || {}).alt || main.alt;
    });
  }

  /* ---------------- Hero plate theme switcher ---------------- */
  function bindHeroSwitcher() {
    $$('[data-hero]').forEach(function (hero) {
      var chips = $$('.theme-chip', hero);
      if (!chips.length) return;
      function setTheme(chip) {
        var top = $('[data-plate-top]', hero);
        var bottom = $('[data-plate-bottom]', hero);
        var num = $('[data-plate-number]', hero);
        var plate = $('.plate', hero);
        if (top) { top.textContent = chip.dataset.frameTop; top.style.background = chip.dataset.color1; }
        if (bottom) { bottom.textContent = chip.dataset.frameBottom; bottom.style.background = chip.dataset.color1; }
        if (num) num.textContent = chip.dataset.number;
        if (plate) plate.style.setProperty('--frame-grad', 'linear-gradient(135deg, ' + chip.dataset.color1 + ', ' + chip.dataset.color2 + ')');
        chips.forEach(function (c) { c.dataset.active = String(c === chip); });
      }
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () { setTheme(chip); });
        chip.addEventListener('mouseenter', function () { setTheme(chip); });
      });
    });
  }

  /* ---------------- Bundle builder ---------------- */
  function bindBundle() {
    $$('[data-bundle]').forEach(function (section) {
      var jsonEl = $('[data-bundle-json]', section);
      if (!jsonEl) return;
      var products = JSON.parse(jsonEl.textContent).filter(Boolean);
      var max = parseInt(section.dataset.bundleMax, 10) || 3;
      var picked = [];
      var slotsEl = $('[data-bundle-slots]', section);
      var optionsEl = $('[data-bundle-options]', section);
      var countEl = $('[data-bundle-count]', section);
      var totalEl = $('[data-bundle-total]', section);
      var addBtn = $('[data-bundle-add-btn]', section);

      function findProduct(id) {
        return products.filter(function (p) { return String(p.id) === String(id); })[0];
      }
      function render() {
        var slots = [];
        for (var i = 0; i < max; i++) {
          var pid = picked[i];
          if (pid) {
            var p = findProduct(pid);
            slots.push('<div class="bundle__slot" data-filled="true"><button class="remove" type="button" data-bundle-remove="' + i + '" aria-label="Remove">✕</button>' + p.thumb + '</div>');
          } else {
            slots.push('<div class="bundle__slot">SLOT ' + (i + 1) + '<br>empty</div>');
          }
        }
        slotsEl.innerHTML = slots.join('');
        countEl.textContent = '(' + picked.length + '/' + max + ')';
        var total = picked.reduce(function (s, id) { return s + findProduct(id).price; }, 0);
        totalEl.textContent = money(total);
        $$('[data-bundle-option]', optionsEl).forEach(function (btn) {
          btn.dataset.selected = String(picked.indexOf(btn.dataset.bundleOption) !== -1);
        });
        $$('.bundle__tier', section).forEach(function (t) {
          t.dataset.hit = String(picked.length >= parseInt(t.dataset.count, 10));
        });
      }
      optionsEl.addEventListener('click', function (e) {
        var t = e.target.closest('[data-bundle-option]');
        if (!t) return;
        if (picked.length >= max) picked.shift();
        picked.push(t.dataset.bundleOption);
        render();
      });
      slotsEl.addEventListener('click', function (e) {
        var idx = e.target.dataset.bundleRemove;
        if (idx === undefined) return;
        picked.splice(parseInt(idx, 10), 1);
        render();
      });
      if (addBtn) addBtn.addEventListener('click', function () {
        if (!picked.length) return;
        var counts = {};
        picked.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
        var items = Object.keys(counts).map(function (id) { return { id: parseInt(id, 10), quantity: counts[id] }; });
        addBtn.disabled = true; addBtn.textContent = 'Adding…';
        addItems(items).then(function () {
          picked = []; render();
        }).catch(function (err) {
          alert((err && err.description) || 'Could not add bundle.');
        }).finally(function () {
          addBtn.disabled = false; addBtn.textContent = addBtn.dataset.label || 'Add Bundle →';
        });
      });
      render();
    });
  }

  /* ---------------- Frame finder quiz ---------------- */
  function bindQuiz() {
    $$('[data-quiz]').forEach(function (section) {
      var jsonEl = $('[data-quiz-json]', section);
      var card = $('[data-quiz-card]', section);
      if (!jsonEl || !card) return;
      var data = JSON.parse(jsonEl.textContent); // { questions: [{q, options:[{emoji,label,tag}]}], results: {tag: {title, url, blurb}} }
      data.questions = (data.questions || []).filter(Boolean);
      data.questions.forEach(function (q) { q.options = (q.options || []).filter(Boolean); });
      Object.keys(data.results || {}).forEach(function (k) { if (!data.results[k]) delete data.results[k]; });
      var idx = 0; var tally = {};

      function renderQuestion() {
        var q = data.questions[idx];
        if (!q) return renderResult();
        var progress = data.questions.map(function (_, i) {
          return '<span data-done="' + (i <= idx) + '"></span>';
        }).join('');
        card.innerHTML =
          '<div class="quiz__progress">' + progress + '</div>' +
          '<div style="font-family:var(--font-mono); font-size:11px; text-transform:uppercase; letter-spacing:0.15em; color:var(--ink-soft); margin-bottom:6px;">Question ' + (idx + 1) + ' of ' + data.questions.length + '</div>' +
          '<h3 class="quiz__q" tabindex="-1">' + q.q + '</h3>' +
          '<div class="quiz__options">' + q.options.map(function (o) {
            return '<button type="button" class="quiz__option" data-tag="' + o.tag + '"><span class="quiz__option-emoji" aria-hidden="true">' + o.emoji + '</span><span>' + o.label + '</span></button>';
          }).join('') + '</div>';
      }
      function renderResult() {
        var winner = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0];
        var res = data.results[winner] || data.results[Object.keys(data.results)[0]];
        if (!res) { card.innerHTML = ''; return; }
        card.innerHTML =
          '<div class="quiz__result">' +
          '<div class="section__eyebrow" style="background:var(--pink); color:var(--paper);">YOUR RESULT</div>' +
          '<h3 tabindex="-1" style="margin-top:12px; font-family:var(--font-display); text-transform:uppercase;">' + res.title + '</h3>' +
          (res.blurb ? '<p style="margin:10px 0 20px;">' + res.blurb + '</p>' : '') +
          '<div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">' +
          '<a class="btn btn--lg" href="' + res.url + '">Shop My Match →</a>' +
          '<button type="button" class="btn btn--lg btn--paper" data-quiz-retry>Retake Quiz</button>' +
          '</div></div>';
      }
      // Answer buttons are replaced on each step, so move focus to the new heading.
      function focusHeading() { var h = $('h3', card); if (h) h.focus({ preventScroll: true }); }
      card.addEventListener('click', function (e) {
        var opt = e.target.closest('.quiz__option');
        if (opt) {
          var tag = opt.dataset.tag;
          tally[tag] = (tally[tag] || 0) + 1;
          idx++;
          renderQuestion();
          focusHeading();
        }
        if (e.target.closest('[data-quiz-retry]')) {
          idx = 0; tally = {}; renderQuestion(); focusHeading();
        }
      });
      renderQuestion();
    });
  }

  /* ---------------- Sticky buy bar ---------------- */
  function bindBuybar() {
    var bar = $('#buybar');
    if (!bar) return;
    var shown = false;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      var show = y > 900 && (document.body.scrollHeight - y - window.innerHeight) > 600;
      if (show !== shown) { shown = show; bar.dataset.visible = String(show); }
    }, { passive: true });
  }

  /* ---------------- Discount modal (once per visitor, after 2 min on site) ---------------- */
  function bindExitModal() {
    var overlay = $('#modalOverlay');
    if (!overlay) return;
    overlay.inert = true;
    var SHOWN_KEY = 'btw-discount-shown';
    var START_KEY = 'btw-visit-start';
    var DELAY_MS = 2 * 60 * 1000;
    // Without storage consent the clock and "shown" flag live in memory only.
    var memory = {};
    function get(k) { return canStore() ? recall(k) : (memory[k] || null); }
    function set(k, v) { if (canStore()) store(k, v); else memory[k] = v; }
    if (get(SHOWN_KEY)) return;
    // Time on site is counted across page views, so navigating doesn't reset the clock.
    var start = parseInt(get(START_KEY), 10);
    if (!start) { start = Date.now(); set(START_KEY, String(start)); }
    function show() {
      if (get(SHOWN_KEY)) return;
      // Don't interrupt someone mid-checkout-flow in the cart.
      if (activeDialog) { setTimeout(show, 30000); return; }
      set(SHOWN_KEY, '1');
      overlay.dataset.open = 'true';
      overlay.inert = false;
      openDialog(overlay, hide);
    }
    function hide() {
      if (overlay.dataset.open !== 'true') return;
      overlay.dataset.open = 'false';
      overlay.inert = true;
      closeDialog();
    }
    setTimeout(show, Math.max(0, start + DELAY_MS - Date.now()));
    ['#modalClose', '#modalDecline', '#modalClaim'].forEach(function (sel) {
      var el = $(sel); if (el) el.addEventListener('click', hide);
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
  }

  /* ---------------- Newsletter (customer form ajax-ish feedback) ---------------- */
  function bindNewsletterFocus() {
    if (window.location.hash === '#newsletter-form' || window.location.search.indexOf('customer_posted=true') !== -1) {
      var el = $('.newsletter');
      if (el) el.scrollIntoView();
    }
  }

  /* ---------------- Init ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initMarquees();
    bindDrawer();
    bindProductForms();
    bindQtySteppers();
    bindVariantPickers();
    bindHeroSwitcher();
    bindBundle();
    bindQuiz();
    bindBuybar();
    if (window.BTW && window.BTW.exitModal) withPrivacyApi(bindExitModal);
    bindNewsletterFocus();
    var openCart = $('#openCart');
    if (openCart) openCart.addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
  });
})();
