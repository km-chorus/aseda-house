/* ==========================================================================
   Aseda House — shared behaviour
   Mobile menu, header (tuck + chapter colour), reveal on scroll,
   room preview, "Today in Accra" slip, gallery drift.
   Every feature checks for its own markup, so this file runs on every page.
   ========================================================================== */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------ */
  function initMenu() {
    const menu = $('#mobile-menu');
    if (!menu) return;
    const openers = $$('[data-menu-open]');
    const closer = $('[data-menu-close]', menu);
    let lastFocus = null;

    $$('.mobile-menu__list li', menu).forEach((li, i) => li.style.setProperty('--i', i));

    const focusables = () =>
      $$('a[href], button:not([disabled])', menu).filter((el) => el.offsetParent !== null);

    function open(trigger) {
      lastFocus = trigger || document.activeElement;
      menu.hidden = false;
      // next frame so the list animation runs
      requestAnimationFrame(() => menu.classList.add('is-open'));
      document.body.classList.add('menu-open');
      openers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
      closer && closer.focus();
    }
    function close() {
      menu.classList.remove('is-open');
      menu.hidden = true;
      document.body.classList.remove('menu-open');
      openers.forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (lastFocus) lastFocus.focus();
    }

    openers.forEach((b) => b.addEventListener('click', () => open(b)));
    closer && closer.addEventListener('click', close);
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a[href]')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (menu.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    // Leaving phone width with the menu open
    window.matchMedia('(min-width: 960px)').addEventListener('change', (mq) => {
      if (mq.matches && !menu.hidden) close();
    });
  }

  /* ------------------------------------------------------------------
     Header: tucked while the homepage hero is on screen, and it takes
     the ground colour of whichever chapter is beneath it.
     ------------------------------------------------------------------ */
  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    const hero = $('.hero');

    // Clear over the hero photograph, a solid bar once the photograph has passed
    if (hero) {
      const io = new IntersectionObserver(
        ([entry]) => header.classList.toggle('is-clear', entry.isIntersecting),
        { rootMargin: `-${header.offsetHeight}px 0px 0px 0px`, threshold: 0 }
      );
      io.observe(hero);
    } else {
      header.classList.remove('is-clear');
    }
  }

  /* ------------------------------------------------------------------
     Reveal on scroll. Content is visible without script (see base.css).
     ------------------------------------------------------------------ */
  function initReveal() {
    const items = $$('[data-reveal]');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    items.forEach((el) => io.observe(el));

    // A jump (anchor link, fast fling) can skip an element without it ever
    // intersecting: reveal everything that is already above the fold line.
    let pending = items.slice();
    let ticking = false;
    function sweep() {
      ticking = false;
      const line = window.innerHeight;
      pending = pending.filter((el) => {
        if (el.classList.contains('is-in')) return false;
        if (el.getBoundingClientRect().top < line) { el.classList.add('is-in'); io.unobserve(el); return false; }
        return true;
      });
      if (!pending.length) window.removeEventListener('scroll', onScroll);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ------------------------------------------------------------------
     Rooms: hovering or focusing a room shows its photograph
     ------------------------------------------------------------------ */
  function initRoomPreview() {
    const img = $('#rooms-preview');
    const cap = $('#rooms-preview-cap');
    if (!img) return;
    const items = $$('.menu-item[data-preview]');
    let current = img.getAttribute('src');
    let token = 0;

    // Warm the cache once the section is near
    const warm = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      items.forEach((a) => { const i = new Image(); i.src = a.dataset.preview; });
      warm.disconnect();
    }, { rootMargin: '400px' });
    warm.observe(img);

    function show(item) {
      items.forEach((a) => a.classList.toggle('is-active', a === item));
      const src = item.dataset.preview;
      if (src === current) return;
      current = src;
      const mine = ++token;
      img.classList.add('is-swapping');
      const next = new Image();
      next.onload = () => {
        if (mine !== token) return;
        img.src = src;
        img.alt = item.dataset.alt || '';
        if (cap) cap.textContent = $('.menu-item__name', item).textContent;
        img.classList.remove('is-swapping');
      };
      next.src = src;
    }
    items.forEach((a) => {
      a.addEventListener('mouseenter', () => show(a));
      a.addEventListener('focus', () => show(a));
    });
    const start = items.find((a) => a.dataset.preview === current);
    if (start) start.classList.add('is-active');
  }

  /* ------------------------------------------------------------------
     Today in Accra: local time, sunrise and sunset for Labadi, and
     whether the pool, kitchen and bar are open right now.
     Accra keeps GMT all year with no daylight saving.
     ------------------------------------------------------------------ */
  const LAT = 5.5571;   // Labadi, Accra
  const LON = -0.1592;
  const TZ = 'Africa/Accra';

  const HOURS = {
    pool:    { open: 6 * 60,       close: 21 * 60,      label: 'Pool' },
    kitchen: { open: 6 * 60 + 30,  close: 22 * 60 + 30, label: 'Kitchen' },
    bar:     { open: 17 * 60,      close: 24 * 60,      label: 'Tide Bar' },
  };

  function sunTimes(date) {
    const rad = Math.PI / 180;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = Math.round(jd - 2451545.0 + 0.0008);
    const jStar = n - LON / 360;
    const M = (357.5291 + 0.98560028 * jStar) % 360;
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    const lambda = (M + C + 180 + 102.9372) % 360;
    const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
    const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosW = (Math.sin(-0.833 * rad) - Math.sin(LAT * rad) * sinDec) / (Math.cos(LAT * rad) * cosDec);
    const w = Math.acos(cosW) / rad;
    const toDate = (j) => new Date((j - 2440587.5) * 86400000);
    return { rise: toDate(jTransit - w / 360), set: toDate(jTransit + w / 360) };
  }

  const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDay = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' });

  function minutesNow(date) {
    const [h, m] = fmtTime.format(date).split(':').map(Number);
    return h * 60 + m;
  }
  const hhmm = (mins) => {
    if (mins >= 24 * 60) return 'midnight';
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  };

  function initLiveStatus() {
    const items = $$('[data-live-status]');
    if (!items.length) return;
    const clock = $('[data-live-clock]');

    function render() {
      const now = new Date();
      const mins = minutesNow(now);
      if (clock) {
        const sun = sunTimes(now);
        clock.textContent = `In Accra it is ${fmtTime.format(now)} on ${fmtDay.format(now)}. Sunset at ${fmtTime.format(sun.set)}.`;
      }

      items.forEach((dd) => {
        const h = HOURS[dd.dataset.liveStatus];
        const isOpen = mins >= h.open && mins < h.close;
        dd.classList.toggle('is-open', isOpen);
        dd.classList.toggle('is-closed', !isOpen);
        dd.textContent = isOpen ? `Open until ${hhmm(h.close)}` : `Opens at ${hhmm(h.open)}`;
      });
    }
    render();
    // Re-render on the next minute boundary, then every minute
    setTimeout(() => { render(); setInterval(render, 60000); }, (60 - new Date().getSeconds()) * 1000);
  }

  /* ------------------------------------------------------------------
     Booking bar: sensible default dates, departure never before
     arrival, and a live quote for the chosen room and nights.
     Without script it is a plain form that posts to booking.html.
     ------------------------------------------------------------------ */
  function initBooking() {
    const form = $('[data-booking]');
    if (!form) return;
    const inEl = $('[data-bk-in]', form);
    const outEl = $('[data-bk-out]', form);
    const roomEl = $('[data-bk-room]', form);
    const guestsEl = $('[data-bk-guests]', form);
    const quote = $('[data-bk-quote]', form);
    const DAY = 86400000;
    const iso = (d) => d.toISOString().slice(0, 10);
    const parse = (v) => (v ? new Date(`${v}T00:00:00Z`) : null);
    const today = new Date(`${iso(new Date())}T00:00:00Z`);
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

    inEl.min = iso(today);
    if (!inEl.value) inEl.value = iso(new Date(today.getTime() + 14 * DAY));
    if (!outEl.value) outEl.value = iso(new Date(parse(inEl.value).getTime() + 3 * DAY));

    function render() {
      const a = parse(inEl.value);
      if (a) outEl.min = iso(new Date(a.getTime() + DAY));
      let b = parse(outEl.value);
      if (a && (!b || b <= a)) { b = new Date(a.getTime() + DAY); outEl.value = iso(b); }

      const opt = roomEl.selectedOptions[0];
      const rate = Number(opt.dataset.rate);
      const max = Number(opt.dataset.max);
      const guests = Number(guestsEl.value);
      const nights = a && b ? Math.round((b - a) / DAY) : 0;
      if (!nights) return;

      const name = opt.textContent;
      if (guests > max) {
        quote.innerHTML = `The ${name} sleeps ${max}. For ${guests}, choose the Two-Bedroom Residence or two rooms.`;
        return;
      }
      quote.innerHTML = `<strong>${nights} ${nights === 1 ? 'night' : 'nights'} in the ${name}, from ${money.format(rate * nights)}</strong> with breakfast. Best rate when you book with the house.`;
    }
    [inEl, outEl, roomEl, guestsEl].forEach((el) => el.addEventListener('change', render));
    render();

    // "Book a stay" in the header scrolls to the bar and puts the cursor in it
    $$('a[href="#top-booking"]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      form.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => inEl.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 500);
    }));
  }

  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    initMenu();
    initHeader();
    initReveal();
    initRoomPreview();
    initLiveStatus();
    initBooking();
  });
})();
