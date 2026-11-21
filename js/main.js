/* ==========================================================================
   Iglesia Mayor de San Jerónimo — home interactions

   Scroll engine ported from the reference home (vgm-home-page module,
   inspected with REA):
   - an eased scroll value (lerp 0.1 per frame, raw value on touch devices),
   - per-card "enter" (n) and "exit" (r) progress against one 100vh spacer
     per card,
   - the colored box is scaled from bottom-left while entering and from
     top-right while leaving; its contents get the inverse scale so the text
     never distorts.

   On top of that, images get a continuous, scroll-linked transition instead
   of the reference's opacity swap: the incoming image opens from the bottom
   edge, rising and settling from a 1.2 zoom, while the outgoing one drifts
   up and is shaded. Everything is reversible because it is a pure function
   of the eased scroll position.
   ========================================================================== */

(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;

  const mqDesktop = window.matchMedia("(min-width: 901px)");
  const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqCoarse = window.matchMedia("(pointer: coarse)");

  const cards = Array.from(document.querySelectorAll(".card"));
  const sections = Array.from(document.querySelectorAll(".scroll-section"));
  const rail = document.querySelector(".media-rail");
  const slides = Array.from(document.querySelectorAll(".media-slide"));
  const slideImgs = slides.map((s) => s.querySelector("img"));
  const slidePics = slides.map((s) => s.querySelector("picture"));
  const slideCache = slides.map(() => ({ o: "", p: "", s: "", e: "", v: null }));
  const captionNum = document.querySelector(".media-caption__num");
  const captionTitles = Array.from(document.querySelectorAll(".media-caption__title"));
  const figures = Array.from(document.querySelectorAll(".card__figure"));
  const scrollHint = document.querySelector(".scroll-hint");
  const backToTop = document.querySelector(".back-to-top");

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  const pad2 = (n) => String(n).padStart(2, "0");

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */

  const state = {
    layered: false,
    reduced: mqReduced.matches,
    touch: mqCoarse.matches || navigator.maxTouchPoints > 0,
    wh: window.innerHeight,
    eased: window.scrollY,
    running: false,
    current: -1,
    anchors: [], // static desktop: vertical centers of the cards (document coords)
  };

  /* ------------------------------------------------------------------------
     Layout: decide between layered and static modes (like the reference's
     checkRemoveLayeringEffect: only layer when every card's content fits).
     ------------------------------------------------------------------------ */

  function contentFits() {
    return cards.every((card) => {
      const box = card.querySelector(".card__box");
      const inner = card.querySelector(".card__inner");
      const bt = box.style.transform;
      const it = inner.style.transform;
      box.style.transform = "none";
      inner.style.transform = "none";
      const fits = box.scrollHeight <= box.clientHeight + 1;
      box.style.transform = bt;
      inner.style.transform = it;
      return fits;
    });
  }

  function clearLayerStyles() {
    cards.forEach((card) => {
      card.style.zIndex = "";
      card.style.visibility = "";
      card.classList.remove("is-active");
      const box = card.querySelector(".card__box");
      const inner = card.querySelector(".card__inner");
      box.style.transform = box.style.transformOrigin = "";
      inner.style.transform = inner.style.transformOrigin = inner.style.opacity = "";
    });
  }

  function measure() {
    state.wh = window.innerHeight;
    state.reduced = mqReduced.matches;

    const wantLayered = mqDesktop.matches && !state.reduced;
    if (wantLayered) {
      root.classList.add("is-layered");
      clearLayerStyles();
      if (!contentFits()) root.classList.remove("is-layered");
    } else {
      root.classList.remove("is-layered");
    }

    const layered = root.classList.contains("is-layered");
    if (layered !== state.layered) {
      state.layered = layered;
      if (!layered) clearLayerStyles();
      state.eased = window.scrollY;
    }

    if (!layered) {
      // centers of each card (and the closing section) in document coordinates
      state.anchors = cards.map((card) => {
        const r = card.getBoundingClientRect();
        return r.top + window.scrollY + r.height / 2;
      });
    }
    requestTick();
  }

  /* ------------------------------------------------------------------------
     Scroll position → continuous "slide position" (0 = first card, 1 = second…)
     ------------------------------------------------------------------------ */

  function positionFromScroll(y) {
    if (state.layered) {
      return y / state.wh;
    }
    // static desktop: interpolate between card centers, measured against a
    // line slightly above the middle of the viewport (where the eye reads)
    const line = y + state.wh * 0.45;
    const a = state.anchors;
    if (!a.length || line <= a[0]) return 0;
    for (let i = 0; i < a.length - 1; i++) {
      if (line < a[i + 1]) return i + (line - a[i]) / (a[i + 1] - a[i]);
    }
    return a.length - 1;
  }

  /* ------------------------------------------------------------------------
     Layered cards (reference math, kept verbatim where it matters)
     ------------------------------------------------------------------------ */

  function renderLayers(y) {
    const wh = state.wh;
    const last = cards.length - 1; // closing content ("Descubre más")
    const width = window.innerWidth;

    for (let s = 0; s < cards.length; s++) {
      const card = cards[s];
      const section = sections[s];
      const box = card.querySelector(".card__box");
      const inner = card.querySelector(".card__inner");
      const isEnd = s === last;

      const top = section ? section.offsetTop : s * wh;
      const h = section ? section.offsetHeight || wh : wh;
      const i = top - y;
      const n = Math.min(1, (wh - i) / h); // entering progress
      const r = Math.min(1, -i / h); // leaving progress

      const active = n >= 0.5 && r <= 0.5;
      card.classList.toggle("is-active", active);
      card.style.zIndex = isEnd ? "0" : n >= 1 ? "2" : "1";

      if (isEnd) continue; // the closing content only fades

      let a = 1;
      let l = 1;
      let fade = "";
      let tx = 0;
      let dx = 0;
      let dy = 0;

      if (n > 0 && n < 1 && s > 0) {
        box.style.transformOrigin = inner.style.transformOrigin = "left bottom";
        a = Math.min(1, 1.35 * n);
        l = 0.5 + 0.5 * n;
        dx = (1 - a) * 42;
        dy = 55 * (1 - l);
      } else if (r > 0 && r < 1) {
        box.style.transformOrigin = inner.style.transformOrigin = "right top";
        a = Math.max(0, 1 - r * 0.5);
        l = 1 - (50 * r) / wh;
        tx = 0.5 * r * width;
        dx = -tx * a;
        // text leaves continuously with its card instead of being sliced
        fade = Math.max(0, 1 - r * 2.4).toFixed(3);
      } else if (n <= 0 || r >= 1) {
        a = 0;
        l = 0;
      }

      if (a === 0 || l === 0) {
        card.style.visibility = "hidden";
        continue;
      }
      card.style.visibility = "";
      inner.style.opacity = fade;
      box.style.transform = `scale(${a}, ${l}) translate(${tx}px, 0px)`;
      inner.style.transform = `scale(${1 / a}, ${1 / l}) translate(${dx}px, ${dy}px)`;
    }
  }

  /* ------------------------------------------------------------------------
     Image rail transitions
     For slide i (window widths in "card" units):
       reveal: pos from i-0.85 → i-0.30  (centered on the card's activation)
       cover:  the reveal of slide i+1
       exit:   last slide, pos from last+0.25 → last+0.80
     ------------------------------------------------------------------------ */

  const REVEAL_FROM = 0.85;
  const REVEAL_SPAN = 0.55;

  function revealOf(i, pos) {
    if (i <= 0) return 1;
    return clamp01((pos - (i - REVEAL_FROM)) / REVEAL_SPAN);
  }

  function renderRail(pos) {
    if (!rail) return;
    const lastSlide = slides.length - 1;
    const hasEnd = cards.length > slides.length;

    for (let i = 0; i < slides.length; i++) {
      let reveal = revealOf(i, pos);
      let cover = i < lastSlide ? revealOf(i + 1, pos) : 0;
      let exit = i === lastSlide && hasEnd ? clamp01((pos - (lastSlide + 0.25)) / REVEAL_SPAN) : 0;

      if (state.reduced) {
        // no movement: a clean cut at the midpoint
        reveal = i === 0 || pos >= i - 0.5 ? 1 : 0;
        cover = i < lastSlide && pos >= i + 0.5 ? 1 : 0;
        exit = exit >= 0.5 ? 1 : 0;
      } else {
        reveal = easeInOutCubic(reveal);
        cover = easeOutQuart(cover);
        exit = easeInOutCubic(exit);
      }

      if (i === lastSlide) rail.style.setProperty("--rail-exit", exit.toFixed(3));

      const visible = reveal > 0 && cover < 1 && exit < 1;
      const slide = slides[i];
      const c = slideCache[i];
      if (c.v !== visible) {
        c.v = visible;
        slide.classList.toggle("is-visible", visible);
      }
      if (!visible) continue;

      // window (slide) and counter-moving photo (picture), in % of own height
      const hidden = 1 - reveal;
      const outer = hidden * 100 - exit * 100;
      const inner = -hidden * 100 + hidden * 22 - cover * 9 + exit * 100 - exit * 7;
      const scale = 1 + hidden * 0.2 + cover * 0.06;
      const shade = cover * 0.6 + hidden * 0.45;
      const edge = Math.min(1, reveal * hidden * 4);

      const o = `translate3d(0, ${outer.toFixed(3)}%, 0)`;
      const p = `translate3d(0, ${inner.toFixed(3)}%, 0) scale(${scale.toFixed(4)})`;
      const sh = shade.toFixed(3);
      const ed = edge.toFixed(3);
      // only touch the DOM when something actually changed
      if (c.o !== o) slide.style.transform = c.o = o;
      if (c.p !== p) slidePics[i].style.transform = c.p = p;
      if (c.s !== sh) slide.style.setProperty("--shade", (c.s = sh));
      if (c.e !== ed) slide.style.setProperty("--edge", (c.e = ed));
    }

    // caption follows the card that is currently "active"
    const current = Math.max(0, Math.min(cards.length - 1, Math.round(pos)));
    if (current !== state.current) {
      state.current = current;
      const ended = current > lastSlide;
      rail.classList.toggle("is-ended", ended);
      if (!ended) {
        captionNum.textContent = pad2(current + 1);
        captionTitles.forEach((t, k) => {
          t.classList.toggle("is-current", k === current);
          t.classList.toggle("is-past", k < current);
        });
        slides.forEach((s, k) => s.classList.toggle("is-current", k === current));
      }
    }
  }

  /* ------------------------------------------------------------------------
     Mobile figures: parallax drift inside each revealed image
     ------------------------------------------------------------------------ */

  function renderFigures() {
    if (state.reduced) return;
    const wh = state.wh;
    for (const fig of figures) {
      const r = fig.getBoundingClientRect();
      if (r.bottom < -50 || r.top > wh + 50) continue;
      // -1 (figure entering at bottom) … 1 (leaving at top)
      const p = ((r.top + r.height / 2) / wh) * -2 + 1;
      const drift = Math.max(-1, Math.min(1, p)) * r.height * 0.045;
      fig.firstElementChild.lastElementChild.style.setProperty("--drift", `${drift.toFixed(1)}px`);
    }
  }

  /* ------------------------------------------------------------------------
     Frame loop — runs only while the eased value is catching up
     ------------------------------------------------------------------------ */

  function frame() {
    const y = window.scrollY;
    if (state.touch || state.reduced) {
      state.eased = y;
    } else {
      state.eased += 0.1 * (y - state.eased);
      if (Math.abs(state.eased - y) < 0.5) state.eased = y;
    }

    const desktop = mqDesktop.matches;
    if (state.layered) renderLayers(state.eased);
    if (desktop) renderRail(positionFromScroll(state.eased));
    else renderFigures();

    if (state.eased !== y) {
      window.requestAnimationFrame(frame);
    } else {
      state.running = false;
    }
  }

  function requestTick() {
    if (state.running) return;
    state.running = true;
    window.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------------
     Scroll-linked UI
     ------------------------------------------------------------------------ */

  function onScroll() {
    const y = window.scrollY;
    if (scrollHint && y > 200) scrollHint.classList.add("is-hidden");
    if (backToTop) backToTop.classList.toggle("is-visible", y > state.wh * 0.8);
    requestTick();
  }

  function scrollToCard(index, smooth = true) {
    let top;
    if (state.layered && sections[index]) top = sections[index].offsetTop;
    else top = cards[index].getBoundingClientRect().top + window.scrollY - (mqDesktop.matches ? 115 : 0);
    window.scrollTo({ top, behavior: smooth && !state.reduced ? "smooth" : "auto" });
  }

  /* ------------------------------------------------------------------------
     Reveal of static cards (static desktop + mobile)
     ------------------------------------------------------------------------ */

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-inview");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    cards.forEach((c) => io.observe(c));
  } else {
    cards.forEach((c) => c.classList.add("is-inview"));
  }

  /* ------------------------------------------------------------------------
     Navigation: desktop dropdowns
     ------------------------------------------------------------------------ */

  const menuButtons = Array.from(document.querySelectorAll("[data-menu]"));

  function closeMenus(except) {
    menuButtons.forEach((btn) => {
      if (btn === except) return;
      btn.setAttribute("aria-expanded", "false");
      const menu = document.getElementById(btn.dataset.menu);
      if (menu) menu.hidden = true;
    });
  }

  menuButtons.forEach((btn) => {
    const menu = document.getElementById(btn.dataset.menu);
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const open = btn.getAttribute("aria-expanded") === "true";
      closeMenus(btn);
      btn.setAttribute("aria-expanded", String(!open));
      menu.hidden = open;
      if (!open) menu.querySelector("a")?.focus({ preventScroll: true });
    });
    menu?.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        closeMenus();
        btn.focus();
      }
    });
  });

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".nav__item")) closeMenus();
  });

  /* ------------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------------ */

  const mobileMenu = document.getElementById("mobile-menu");
  const menuToggle = document.querySelector(".menu-toggle");
  const menuClose = document.querySelector(".mobile-menu__close");

  function setMobileMenu(open) {
    if (!mobileMenu) return;
    mobileMenu.classList.toggle("is-open", open);
    mobileMenu.setAttribute("aria-hidden", String(!open));
    menuToggle?.setAttribute("aria-expanded", String(open));
    body.classList.toggle("no-scroll", open);
    if (open) menuClose?.focus();
    else menuToggle?.focus();
  }

  menuToggle?.addEventListener("click", () => setMobileMenu(true));
  menuClose?.addEventListener("click", () => setMobileMenu(false));
  mobileMenu?.addEventListener("click", (ev) => {
    if (ev.target.closest("a")) setMobileMenu(false);
  });

  /* ------------------------------------------------------------------------
     Search dialog
     ------------------------------------------------------------------------ */

  const dialog = document.querySelector(".search-dialog");
  const searchInput = document.getElementById("search-input");
  const searchHint = document.querySelector(".search-form__hint");
  const searchMap = [
    { words: ["cristo", "pasión", "pasion", "talla", "semana santa", "señor"], index: 1 },
    { words: ["retablo", "altar", "dorado", "oro", "santos", "calvario"], index: 2 },
    { words: ["pila", "bautismal", "bautismo", "bautizo", "piedra", "sacramento"], index: 3 },
    { words: ["oficio", "artesano", "relato", "pigmento", "madera", "historia"], index: 4 },
    { words: ["visita", "horario", "misa", "celebracion", "celebración", "apoya", "donar", "conservación", "conservacion", "dirección", "direccion", "plaza"], index: 5 },
  ];

  document.querySelectorAll("[data-search-open]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (!dialog) return;
      dialog.showModal();
      searchInput?.focus();
    })
  );
  dialog?.querySelector(".search-dialog__close")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog?.querySelector("form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = (searchInput?.value || "").trim().toLowerCase();
    const hit = searchMap.find((m) => m.words.some((w) => q.includes(w)));
    if (!hit) {
      searchHint.textContent = q
        ? `Sin resultados para «${searchInput.value.trim()}». Prueba con «retablo», «pila bautismal» o «horarios».`
        : "Escribe algo para buscar.";
      return;
    }
    dialog.close();
    scrollToCard(hit.index);
    flash(cards[hit.index]);
  });

  function flash(card) {
    card.classList.remove("is-flash");
    void card.offsetWidth;
    card.classList.add("is-flash");
  }

  /* ------------------------------------------------------------------------
     In-page links to cards, keyboard focus, floating buttons
     ------------------------------------------------------------------------ */

  document.addEventListener("click", (ev) => {
    const link = ev.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href").slice(1);
    const index = cards.findIndex((c) => c.id === id);
    if (index < 0) return;
    ev.preventDefault();
    const cardOfLink = link.closest(".card");
    if (cardOfLink === cards[index]) {
      flash(cards[index]);
      return;
    }
    scrollToCard(index);
  });

  // Tabbing into a layered card brings that card on stage (as the reference does)
  document.querySelector(".cards")?.addEventListener("focusin", (ev) => {
    if (!state.layered) return;
    const card = ev.target.closest(".card");
    const index = cards.indexOf(card);
    if (index < 0 || card.classList.contains("is-active")) return;
    scrollToCard(index);
  });

  scrollHint?.addEventListener("click", () => scrollToCard(1));
  backToTop?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: state.reduced ? "auto" : "smooth" });
    document.querySelector(".brand")?.focus({ preventScroll: true });
  });

  document.querySelector(".nav__lang")?.addEventListener("click", (ev) => {
    ev.currentTarget.classList.toggle("is-en");
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      closeMenus();
      if (mobileMenu?.classList.contains("is-open")) setMobileMenu(false);
    }
  });

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 120);
  });
  window.addEventListener("scroll", onScroll, { passive: true });
  mqReduced.addEventListener?.("change", measure);
  mqDesktop.addEventListener?.("change", measure);
  window.addEventListener("load", measure);
  document.fonts?.ready.then(measure);

  measure();
  onScroll();

  if (state.layered) {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    state.eased = 0;
  }

  const warmImages = () =>
    slideImgs.forEach((img) => {
      img.loading = "eager";
      if (img.decode) img.decode().catch(() => {});
    });
  if (document.readyState === "complete") warmImages();
  else window.addEventListener("load", warmImages, { once: true });

  // The intro animations only make sense from the top of the page.
  if (window.scrollY > 10) root.classList.remove("is-intro");
  window.setTimeout(() => root.classList.remove("is-intro"), 2600);
})();
