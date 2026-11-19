/* ==========================================================================
   Aseda House — booking flow
   booking.html: choose dates, a room and a rate.
   checkout.html: guest details, arrival, payment choice, confirmation.
   State travels in the URL (checkin, checkout, guests, room, rate), so every
   step can be bookmarked, shared or reloaded without losing anything.
   ========================================================================== */
(() => {
  'use strict';

  /* ---------------- Settings to confirm before launch ---------------- */
  const CONFIG = {
    currency: 'USD',
    taxRate: 0.21,            // VAT and levies on the room total: confirm with the accountant
    taxLabel: 'Taxes and levies (21%)',
    saverDiscount: 0.10,      // Advance saver: 10% off, non-refundable, paid now
    transferFee: 45,          // airport pickup, free with suites or 4+ nights
    freeTransferNights: 4,
    maxNights: 30,
    // Where a finished reservation is sent. Leave empty until the booking
    // engine or reservations inbox is connected (see the report).
    endpoint: '',
  };

  const ROOMS = [
    { id: 'garden-room', name: 'Garden Room', size: 28, beds: 'King or twin', max: 2, rate: 185, suite: false,
      img: 'assets/images/rooms/garden-room-800.webp', alt: 'A timber-framed bed under warm lamps, louvred doors to the garden',
      features: ['Opens onto the frangipani garden', 'Rain shower', 'Work desk by the window'] },
    { id: 'ocean-view-room', name: 'Ocean View Room', size: 32, beds: 'King bed', max: 2, rate: 240, suite: false,
      img: 'assets/images/rooms/ocean-view-room-800.webp', alt: 'Round-topped windows open onto the sea, the bed facing the view',
      features: ['Balcony over the sea', 'Rain shower', 'Minibar filled to order'] },
    { id: 'courtyard-studio', name: 'Courtyard Studio', size: 38, beds: 'King and single', max: 3, rate: 275, suite: false,
      img: 'assets/images/rooms/courtyard-studio-800.webp', alt: 'Two beds and a work table in a bright room with a timber ceiling',
      features: ['Kitchenette for longer stays', 'Sleeps three', 'Courtyard view'] },
    { id: 'junior-suite', name: 'Junior Suite', size: 46, beds: 'King and sofa bed', max: 3, rate: 360, suite: true,
      img: 'assets/images/rooms/junior-suite-1400.webp', alt: 'A tufted sofa at the foot of a wide bed, tall curtains drawn back',
      features: ['Separate sitting area', 'Bath and shower', 'Airport car included'] },
    { id: 'ocean-suite', name: 'Ocean Suite', size: 64, beds: 'King and sofa bed', max: 3, rate: 520, suite: true,
      img: 'assets/images/rooms/ocean-suite-800.webp', alt: 'Folding timber doors open the bedroom to the terrace and the sea',
      features: ['Corner terrace over Labadi beach', 'Bath and shower', 'Airport car included'] },
    { id: 'residence', name: 'Two-Bedroom Residence', size: 110, beds: 'Two bedrooms', max: 5, rate: 780, suite: true,
      img: 'assets/images/rooms/residence-800.webp', alt: 'A glass-walled main bedroom with a sitting area and timber floor',
      features: ['Private plunge pool', 'Full kitchen and dining table', 'Airport car included'] },
  ];

  const RATES = {
    flex: { name: 'Flexible rate', terms: 'Free cancellation until 48 hours before arrival. Pay at the hotel.', pay: 'hotel' },
    saver: { name: 'Advance saver', terms: 'Save 10%. Non-refundable, paid when you book.', pay: 'now' },
  };

  /* ---------------- Helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const DAY = 86400000;
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: CONFIG.currency, maximumFractionDigits: 0 });
  const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const iso = (d) => d.toISOString().slice(0, 10);
  const parse = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? new Date(`${v}T00:00:00Z`) : null);
  const today = () => new Date(`${iso(new Date())}T00:00:00Z`);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const findRoom = (id) => ROOMS.find((r) => r.id === id) || null;

  /** Reads and repairs the stay from the URL: dates in the future, departure after arrival. */
  function readStay() {
    const q = new URLSearchParams(location.search);
    const t = today();
    let a = parse(q.get('checkin'));
    let b = parse(q.get('checkout'));
    if (!a || a < t) a = new Date(t.getTime() + 14 * DAY);
    if (!b || b <= a) b = new Date(a.getTime() + 3 * DAY);
    if ((b - a) / DAY > CONFIG.maxNights) b = new Date(a.getTime() + CONFIG.maxNights * DAY);
    const guests = Math.min(5, Math.max(1, parseInt(q.get('guests'), 10) || 2));
    const room = findRoom(q.get('room'));
    const rate = RATES[q.get('rate')] ? q.get('rate') : null;
    return { checkin: iso(a), checkout: iso(b), nights: Math.round((b - a) / DAY), guests, room: room ? room.id : null, rate };
  }

  function nightly(room, rateKey) {
    return rateKey === 'saver' ? Math.round(room.rate * (1 - CONFIG.saverDiscount)) : room.rate;
  }

  /** Every figure the summary shows, from one place. */
  function price(stay, { transfer = false } = {}) {
    const room = findRoom(stay.room);
    if (!room || !stay.rate) return null;
    const perNight = nightly(room, stay.rate);
    const roomTotal = perNight * stay.nights;
    const transferFree = room.suite || stay.nights >= CONFIG.freeTransferNights;
    const transferCost = transfer && !transferFree ? CONFIG.transferFee : 0;
    const taxes = Math.round(roomTotal * CONFIG.taxRate);
    return { room, perNight, roomTotal, transferFree, transferCost, taxes, total: roomTotal + transferCost + taxes };
  }

  const stayQuery = (stay, extra = {}) =>
    new URLSearchParams({ checkin: stay.checkin, checkout: stay.checkout, guests: stay.guests, ...(stay.room ? { room: stay.room } : {}), ...(stay.rate ? { rate: stay.rate } : {}), ...extra }).toString();

  const guestsLabel = (n) => (n === 1 ? '1 adult' : n === 2 ? '2 adults' : `${n} guests`);
  const nightsLabel = (n) => `${n} ${n === 1 ? 'night' : 'nights'}`;

  /* ---------------- Summary panel (both pages) ---------------- */
  function renderSummary(el, stay, opts = {}) {
    const p = price(stay, opts);
    const rows = [
      ['Arrive', `${longDate.format(parse(stay.checkin))}, from 14:00`],
      ['Depart', `${longDate.format(parse(stay.checkout))}, by 12:00`],
      ['Guests', guestsLabel(stay.guests)],
    ];
    let body = `<h2 class="summary__title">Your stay</h2>
      <dl class="summary__rows">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

    if (!p) {
      body += `<p class="summary__empty">Choose a room and a rate to see your total.</p>`;
    } else {
      body += `<div class="summary__room">
          <img src="${p.room.img}" width="800" height="533" alt="">
          <div><p class="summary__room-name">${esc(p.room.name)}</p><p class="summary__room-rate">${esc(RATES[stay.rate].name)}</p></div>
        </div>
        <dl class="summary__rows summary__money">
          <div><dt>${money.format(p.perNight)} × ${nightsLabel(stay.nights)}</dt><dd>${money.format(p.roomTotal)}</dd></div>
          ${opts.transfer ? `<div><dt>Airport pickup</dt><dd>${p.transferFree ? 'Included' : money.format(p.transferCost)}</dd></div>` : ''}
          <div><dt>${CONFIG.taxLabel}</dt><dd>${money.format(p.taxes)}</dd></div>
          <div class="summary__total"><dt>Total</dt><dd>${money.format(p.total)}</dd></div>
        </dl>
        <p class="summary__note">${esc(RATES[stay.rate].terms)} Breakfast included.</p>`;
    }
    if (opts.action) body += opts.action;
    el.innerHTML = body;
  }

  /* =====================================================================
     Step 1 — booking.html
     ===================================================================== */
  function initBookingPage() {
    const list = $('[data-room-list]');
    if (!list) return;
    const form = $('[data-search]');
    const summary = $('[data-summary]');
    const stay = readStay();

    // Search form mirrors the stay and rewrites the URL on change
    const f = {
      checkin: $('[name="checkin"]', form),
      checkout: $('[name="checkout"]', form),
      guests: $('[name="guests"]', form),
    };
    f.checkin.min = iso(today());

    function syncForm() {
      f.checkin.value = stay.checkin;
      f.checkout.value = stay.checkout;
      f.checkout.min = iso(new Date(parse(stay.checkin).getTime() + DAY));
      f.guests.value = String(stay.guests);
    }

    function update(pushHistory) {
      const a = parse(f.checkin.value) || parse(stay.checkin);
      let b = parse(f.checkout.value);
      if (!b || b <= a) b = new Date(a.getTime() + DAY);
      stay.checkin = iso(a);
      stay.checkout = iso(b);
      stay.nights = Math.min(CONFIG.maxNights, Math.round((b - a) / DAY));
      stay.guests = parseInt(f.guests.value, 10);
      const chosen = findRoom(stay.room);
      if (chosen && chosen.max < stay.guests) { stay.room = null; stay.rate = null; }
      syncForm();
      render();
      updateMobileBar();
      const url = `${location.pathname}?${stayQuery(stay)}`;
      history[pushHistory ? 'pushState' : 'replaceState'](null, '', url);
    }
    form.addEventListener('change', () => update(false));
    form.addEventListener('submit', (e) => { e.preventDefault(); update(true); list.focus({ preventScroll: true }); });

    function offerHTML(room) {
      const fits = room.max >= stay.guests;
      const rates = Object.entries(RATES).map(([key, r]) => {
        const per = nightly(room, key);
        const checked = stay.room === room.id && stay.rate === key;
        return `<label class="rate${checked ? ' is-checked' : ''}">
            <input type="radio" name="offer" value="${room.id}|${key}" ${checked ? 'checked' : ''} ${fits ? '' : 'disabled'}>
            <span class="rate__text">
              <span class="rate__name">${r.name}</span>
              <span class="rate__terms">${r.terms}</span>
            </span>
            <span class="rate__price">
              <strong class="tabular">${money.format(per)}</strong><span> a night</span>
              <span class="rate__total tabular">${money.format(per * stay.nights)} for ${nightsLabel(stay.nights)}</span>
            </span>
          </label>`;
      }).join('');
      return `<article class="offer${fits ? '' : ' is-unavailable'}${stay.room === room.id ? ' is-selected' : ''}" id="offer-${room.id}" aria-labelledby="name-${room.id}">
          <figure class="offer__img"><img src="${room.img}" width="800" height="533" loading="lazy" alt="${esc(room.alt)}"></figure>
          <div class="offer__body">
            <h2 class="offer__name" id="name-${room.id}">${room.name}</h2>
            <p class="offer__meta">${room.size} m² · ${room.beds} · Up to ${room.max} ${room.max === 1 ? 'guest' : 'guests'}</p>
            <ul class="offer__features">${room.features.map((x) => `<li>${x}</li>`).join('')}</ul>
            ${fits
              ? `<fieldset class="rates"><legend class="visually-hidden">Rates for the ${room.name}</legend>${rates}</fieldset>`
              : `<p class="offer__note">Sleeps up to ${room.max}. For ${guestsLabel(stay.guests)}, choose a larger room or book two.</p>`}
          </div>
        </article>`;
    }

    function render() {
      // The room the guest arrived with goes first; rooms too small go last
      const order = ROOMS.slice().sort((a, b) =>
        (b.id === stay.room) - (a.id === stay.room) || (b.max >= stay.guests) - (a.max >= stay.guests));
      list.innerHTML = order.map(offerHTML).join('');
      const ready = stay.room && stay.rate;
      renderSummary(summary, stay, {
        action: `<a class="btn btn--accent btn--block summary__cta${ready ? '' : ' is-disabled'}" ${ready ? `href="checkout.html?${stayQuery(stay)}"` : 'aria-disabled="true" role="link"'}>Continue to your details</a>`,
      });
    }

    list.addEventListener('change', (e) => {
      if (e.target.name !== 'offer') return;
      const [room, rate] = e.target.value.split('|');
      stay.room = room;
      stay.rate = rate;
      $$('.rate', list).forEach((l) => l.classList.toggle('is-checked', l.contains(e.target)));
      $$('.offer', list).forEach((o) => o.classList.toggle('is-selected', o.id === `offer-${room}`));
      renderSummary(summary, stay, {
        action: `<a class="btn btn--accent btn--block summary__cta" href="checkout.html?${stayQuery(stay)}">Continue to your details</a>`,
      });
      history.replaceState(null, '', `${location.pathname}?${stayQuery(stay)}`);
      updateMobileBar(); // on a phone the summary sits below the list, so a bar carries the next step
    });

    // Phone: a fixed bar with the total and the continue button
    const bar = $('[data-mobile-bar]');
    function updateMobileBar() {
      if (!bar) return;
      const p = price(stay);
      bar.hidden = !p;
      if (!p) return;
      $('[data-mobile-total]', bar).textContent = `${money.format(p.total)} total`;
      $('[data-mobile-detail]', bar).textContent = `${p.room.name}, ${nightsLabel(stay.nights)}`;
      $('a', bar).href = `checkout.html?${stayQuery(stay)}`;
    }

    window.addEventListener('popstate', () => { Object.assign(stay, readStay()); syncForm(); render(); updateMobileBar(); });
    syncForm();
    render();
    updateMobileBar();
    if (stay.room) $(`#offer-${stay.room}`)?.scrollIntoView({ block: 'nearest' });
  }

  /* =====================================================================
     Step 2 and 3 — checkout.html
     ===================================================================== */
  function initCheckoutPage() {
    const form = $('[data-checkout]');
    if (!form) return;
    const stay = readStay();
    const summary = $('[data-summary]');
    const room = findRoom(stay.room);

    if (!room || !stay.rate || room.max < stay.guests) {
      $('[data-checkout-body]').innerHTML = `<div class="notice"><h2 class="t-h3">Choose a room first</h2>
        <p>We could not find a room and rate for this stay.</p>
        <a class="btn btn--accent" href="booking.html?${stayQuery({ ...stay, room: null, rate: null })}">Choose a room</a></div>`;
      return;
    }

    $$('[data-back]').forEach((a) => { a.href = `booking.html?${stayQuery(stay)}`; });

    const pickup = $('[name="pickup"]', form);
    const flight = $('[data-flight]', form);
    const payHotel = $('[name="payment"][value="hotel"]', form);
    const payNow = $('[name="payment"][value="now"]', form);
    const submit = $('[type="submit"]', form);

    // The saver rate is paid when you book, so paying at the hotel is not offered
    if (stay.rate === 'saver') {
      payHotel.disabled = true;
      payHotel.closest('.choice').classList.add('is-disabled');
      $('[data-pay-hotel-note]').textContent = 'Not available on the Advance saver rate, which is paid when you book.';
      payNow.checked = true;
    }
    const p0 = price(stay);
    $('[data-pickup-price]').textContent = p0.transferFree ? 'Included with this stay' : `${money.format(CONFIG.transferFee)}, one way`;

    function refresh() {
      flight.hidden = !pickup.checked;
      $('input', flight).required = pickup.checked;
      renderSummary(summary, stay, { transfer: pickup.checked });
      const p = price(stay, { transfer: pickup.checked });
      submit.textContent = payNow.checked ? `Confirm and pay ${money.format(p.total)}` : 'Confirm reservation';
    }
    form.addEventListener('change', refresh);
    refresh();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = Object.fromEntries(new FormData(form).entries());
      const p = price(stay, { transfer: pickup.checked });
      const reference = 'AH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const reservation = {
        reference, createdAt: new Date().toISOString(),
        stay: { ...stay, roomName: room.name, rateName: RATES[stay.rate].name },
        guest: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone, country: data.country },
        arrival: { time: data.arrival, pickup: !!data.pickup, flight: data.flight || '' },
        requests: data.requests || '', payment: data.payment,
        price: { perNight: p.perNight, room: p.roomTotal, transfer: p.transferCost, taxes: p.taxes, total: p.total, currency: CONFIG.currency },
      };

      submit.disabled = true;
      submit.textContent = 'Sending…';
      try {
        if (CONFIG.endpoint) {
          const res = await fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reservation) });
          if (!res.ok) throw new Error(`Status ${res.status}`);
        }
        try { localStorage.setItem('aseda:lastReservation', JSON.stringify(reservation)); } catch {}
        showConfirmation(reservation);
      } catch (err) {
        submit.disabled = false;
        refresh();
        $('[data-form-error]').hidden = false;
        $('[data-form-error]').focus();
      }
    });

    function showConfirmation(r) {
      $$('.steps li').forEach((li, i) => { li.classList.toggle('is-current', i === 2); li.classList.toggle('is-done', i < 2); });
      $('[data-page-title]').textContent = 'Thank you, ' + r.guest.firstName;
      document.title = `Reservation ${r.reference} · Aseda House`;
      const payLine = r.payment === 'now'
        ? `We will email a secure payment link for ${money.format(r.price.total)} to ${esc(r.guest.email)}. Your room is held for 24 hours while you pay.`
        : `You pay ${money.format(r.price.total)} at the hotel. Nothing is charged today.`;
      $('[data-checkout-body]').innerHTML = `
        <section class="confirm" aria-labelledby="confirm-title" tabindex="-1">
          <i class="bi bi-check-circle confirm__icon" aria-hidden="true"></i>
          <h2 class="t-h3" id="confirm-title">Your reservation request is in</h2>
          <p class="confirm__ref">Reference <strong class="tabular">${r.reference}</strong></p>
          <p>Our reservations team confirms every booking by email to <strong>${esc(r.guest.email)}</strong> within the hour, between 07:00 and 22:00 GMT.</p>
          <p>${payLine}</p>
          ${r.arrival.pickup ? `<p>Our driver will meet flight <strong>${esc(r.arrival.flight)}</strong> at Kotoka arrivals with your name on a sign.</p>` : ''}
          <div class="button-row">
            <button class="btn btn--outline" type="button" onclick="window.print()">Print this page</button>
            <a class="link-arrow" href="index.html">Back to the house <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
          </div>
          <p class="confirm__help">Questions before you arrive? Call <a href="tel:+233302701840">+233 30 270 1840</a> or write to <a href="mailto:reservations@asedahouse.com?subject=${encodeURIComponent('Reservation ' + r.reference)}">reservations@asedahouse.com</a>.</p>
        </section>`;
      renderSummary(summary, stay, { transfer: r.arrival.pickup });
      const c = $('.confirm');
      c.focus();
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initBookingPage();
    initCheckoutPage();
  });
})();
