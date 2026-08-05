(function () {
  "use strict";

  const venueProfiles = window.NN_VENUES || {};
  const venueAssets = window.NN_VENUE_ASSETS || { baseUrl: "", folders: {} };
  const byId = (id) => document.getElementById(id);
  const normalizeText = (value = "") => String(value).trim().toLowerCase();

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function venueProfileForKey(key, { includeClosed = true } = {}) {
    const profile = venueProfiles[key];
    if (!profile || (!includeClosed && profile.closed)) return null;
    return profile;
  }

  function venueImagesForKey(key) {
    const profile = venueProfileForKey(key);
    const folder = profile?.photoFolder ? venueAssets.folders?.[profile.photoFolder] : null;
    if (!folder || profile.closed) return [];
    const ordered = [
      folder.cover ? { ...folder.cover, kind: "cover" } : null,
      ...(folder.inter || []).map((image) => ({ ...image, kind: "inter" })),
      ...(folder.food || []).map((image) => ({ ...image, kind: "food" })),
      ...(folder.exter || []).map((image) => ({ ...image, kind: "exter" })),
      ...(folder.other || []).map((image) => ({ ...image, kind: "other" })),
    ].filter((image) => image?.url || image?.remoteUrl);
    const seen = new Set();
    return ordered.filter((image) => {
      const key = image.url || image.remoteUrl;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function imageKitUrl(url, transformation) {
    const endpoint = (venueAssets.baseUrl || "https://ik.imagekit.io/maltsevph/nizhny-novgorod-2026").replace(/\/+$/, "");
    const sourcePrefix = `${endpoint}/`;
    if (!url || !transformation || !url.startsWith(sourcePrefix)) return url || "";
    return `${sourcePrefix}tr:${transformation}/${url.slice(sourcePrefix.length)}`;
  }

  function remoteImageUrl(image, transformation) {
    return image?.remoteUrl ? imageKitUrl(image.remoteUrl, transformation) : "";
  }

  function fallbackAttributes(image, transformation, srcset = "") {
    const fallback = remoteImageUrl(image, transformation);
    if (!fallback) return "";
    return ` data-fallback-src="${escapeHtml(fallback)}"${srcset ? ` data-fallback-srcset="${escapeHtml(srcset)}"` : ""}`;
  }

  function useRemoteFallback(image) {
    if (!image?.dataset?.fallbackSrc || image.dataset.fallbackUsed === "true") return false;
    image.dataset.fallbackUsed = "true";
    if (image.dataset.fallbackSrcset) image.srcset = image.dataset.fallbackSrcset;
    else image.removeAttribute("srcset");
    image.src = image.dataset.fallbackSrc;
    return true;
  }

  function venueImageAlt(profile, image) {
    const labels = {
      cover: "обложка заведения",
      inter: "интерьер",
      food: "блюдо",
      exter: "вид снаружи",
      other: "фотография",
    };
    return `${profile.title}: ${labels[image.kind] || labels.other}`;
  }

  function venueResponsiveImageAttrs(image, profile, sizes = "132px") {
    const src = image.src640 || image.url || remoteImageUrl(image, "w-480,h-360,c-at_max,q-75");
    const srcset = image.src320 && image.src640
      ? `${image.src320} 320w, ${image.src640} 640w`
      : [
          `${imageKitUrl(src, "w-240,h-180,c-at_max,q-72")} 240w`,
          `${imageKitUrl(src, "w-480,h-360,c-at_max,q-75")} 480w`,
          `${imageKitUrl(src, "w-720,h-540,c-at_max,q-76")} 720w`,
        ].join(", ");
    const fallbackSrcset = image.remoteUrl
      ? `${remoteImageUrl(image, "w-320,h-240,c-at_max,q-72")} 320w, ${remoteImageUrl(image, "w-640,h-480,c-at_max,q-76")} 640w`
      : "";
    return `src="${escapeHtml(src)}" srcset="${escapeHtml(srcset)}" sizes="${escapeHtml(sizes)}" alt="${escapeHtml(venueImageAlt(profile, image))}" loading="lazy" decoding="async"${fallbackAttributes(image, "w-640,h-480,c-at_max,q-76", fallbackSrcset)}`;
  }

  function explicitVenueKeysForItem(item = {}) {
    const keys = Array.isArray(item.venueKeys)
      ? item.venueKeys
      : item.venueKey
        ? [item.venueKey]
        : [];
    return [...new Set(keys)]
      .filter((key) => venueProfileForKey(key, { includeClosed: false }))
      .filter((key) => venueImagesForKey(key).length)
      .slice(0, 2);
  }

  function venueThumbHtml(key, sizes = "132px") {
    const profile = venueProfileForKey(key, { includeClosed: false });
    const images = venueImagesForKey(key);
    if (!profile || !images.length) return "";
    return `<button class="venue-thumb" type="button" data-venue-key="${escapeHtml(key)}" aria-label="${escapeHtml(`Открыть карточку заведения ${profile.title}`)}">
      <img ${venueResponsiveImageAttrs(images[0], profile, sizes)} data-venue-key="${escapeHtml(key)}" data-image-index="0" />
      <span class="venue-thumb__shade" aria-hidden="true"></span>
      <span class="venue-thumb__label">${escapeHtml(profile.title)}</span>
    </button>`;
  }

  function venueThumbsHtml(item = {}, className = "") {
    const keys = explicitVenueKeysForItem(item);
    if (!keys.length) return "";
    return `<div class="venue-thumbs ${escapeHtml(className)}">${keys.map((key) => venueThumbHtml(key)).join("")}</div>`;
  }

  function extraPlaceCoverHtml(key) {
    const profile = venueProfileForKey(key, { includeClosed: false });
    const image = venueImagesForKey(key)[0];
    if (!profile || !image) return "";
    const src = image.src640 || image.url || remoteImageUrl(image, "w-640,h-480,c-at_max,q-76");
    const srcset = image.src320 && image.src640
      ? `${image.src320} 320w, ${image.src640} 640w`
      : `${imageKitUrl(src, "w-320,h-240,c-at_max,q-72")} 320w, ${imageKitUrl(src, "w-640,h-480,c-at_max,q-76")} 640w`;
    const fallbackSrcset = image.remoteUrl
      ? `${remoteImageUrl(image, "w-320,h-240,c-at_max,q-72")} 320w, ${remoteImageUrl(image, "w-640,h-480,c-at_max,q-76")} 640w`
      : "";
    return `<button class="extra-place-card__cover" type="button" data-venue-key="${escapeHtml(key)}" aria-label="${escapeHtml(`Открыть карточку заведения ${profile.title}`)}">
      <img src="${escapeHtml(src)}" srcset="${escapeHtml(srcset)}" sizes="(max-width: 430px) 44vw, (max-width: 980px) 46vw, 29vw" alt="${escapeHtml(venueImageAlt(profile, image))}" loading="lazy" decoding="async"${fallbackAttributes(image, "w-640,h-480,c-at_max,q-76", fallbackSrcset)} />
    </button>`;
  }

  function isMissingVenueValue(value) {
    const normalized = normalizeText(value);
    return !normalized || normalized === "уточняется" || normalized === "null";
  }

  const venueModalState = {
    key: "",
    profile: null,
    images: [],
    index: 0,
    opener: null,
    openerId: "",
    touchStartX: null,
    preloads: [],
  };
  let venueOpenerCounter = 0;

  function venueModalBodyHtml(profile) {
    const showAverage = !isMissingVenueValue(profile.averageCheck);
    const showSource = showAverage && profile.averageCheckSource && profile.averageCheckSourceUrl;
    const showCuisine = !isMissingVenueValue(profile.cuisine) && !(profile.closed && normalizeText(profile.cuisine).includes("не подтвержден"));
    return `
      <div class="venue-card__copy">
        <p class="venue-card__eyebrow">${escapeHtml(profile.routeStatus || profile.category || "Заведение")}</p>
        <div class="venue-card__title-row">
          <h2 class="venue-card__title" id="venueModalTitle">${escapeHtml(profile.title)}</h2>
          ${profile.closed ? `<span class="venue-closed-badge">${escapeHtml(profile.closedLabel || "Больше не работает")}</span>` : ""}
        </div>
        ${profile.description ? `<p class="venue-card__description">${escapeHtml(profile.description)}</p>` : ""}
        ${!profile.closed && profile.whyInRoute ? `<div class="venue-card__route"><strong>Почему в маршруте</strong><p class="venue-card__route-copy">${escapeHtml(profile.whyInRoute)}</p></div>` : ""}
      </div>
      <dl class="venue-card__facts">
        ${profile.category ? `<div class="venue-card__fact"><dt>Категория</dt><dd>${escapeHtml(profile.category)}</dd></div>` : ""}
        ${showCuisine ? `<div class="venue-card__fact"><dt>Кухня</dt><dd>${escapeHtml(profile.cuisine)}</dd></div>` : ""}
        ${showAverage ? `<div class="venue-card__fact"><dt>Средний чек</dt><dd>${escapeHtml(profile.averageCheck)}${showSource ? `<br><a href="${escapeHtml(profile.averageCheckSourceUrl)}" target="_blank" rel="noopener noreferrer">Источник: ${escapeHtml(profile.averageCheckSource)}</a>` : ""}</dd></div>` : ""}
        <div class="venue-card__actions">
          ${profile.mapUrl ? `<a class="button button--primary" href="${escapeHtml(profile.mapUrl)}" target="_blank" rel="noopener noreferrer">${profile.closed ? "Открыть архивную карту" : "Открыть карту"}</a>` : ""}
          ${!profile.closed && profile.officialSite ? `<a class="button" href="${escapeHtml(profile.officialSite)}" target="_blank" rel="noopener noreferrer">Официальный сайт</a>` : ""}
        </div>
      </dl>`;
  }

  function renderVenueGalleryThumbs() {
    const target = byId("venueGalleryThumbs");
    const profile = venueModalState.profile;
    if (!target || !profile) return;
    target.innerHTML = venueModalState.images
      .map((image, index) => `<button class="venue-gallery__thumb${index === venueModalState.index ? " is-active" : ""}" type="button" data-gallery-index="${index}" aria-label="Показать фотографию ${index + 1} из ${venueModalState.images.length}">
        <img src="${escapeHtml(image.thumbUrl || imageKitUrl(image.url || image.remoteUrl, "w-240,c-at_max,q-68"))}" alt="${escapeHtml(venueImageAlt(profile, image))}" loading="lazy" decoding="async"${fallbackAttributes(image, "w-240,c-at_max,q-68")} />
      </button>`)
      .join("");
  }

  function preloadVenueNeighbors() {
    venueModalState.preloads = [];
    if (venueModalState.images.length < 2) return;
    const indexes = new Set([
      (venueModalState.index - 1 + venueModalState.images.length) % venueModalState.images.length,
      (venueModalState.index + 1) % venueModalState.images.length,
    ]);
    indexes.delete(venueModalState.index);
    indexes.forEach((index) => {
      const preload = new Image();
      const image = venueModalState.images[index];
      preload.src = image.url || remoteImageUrl(image, "w-1600,c-at_max,q-82");
      venueModalState.preloads.push(preload);
    });
  }

  function updateVenueGallery() {
    const gallery = byId("venueGallery");
    const main = byId("venueGalleryMain");
    const counter = byId("venueGalleryCounter");
    const prev = byId("venueGalleryPrev");
    const next = byId("venueGalleryNext");
    const thumbs = byId("venueGalleryThumbs");
    const profile = venueModalState.profile;
    if (!gallery || !main || !counter || !prev || !next || !thumbs || !profile) return;
    if (!venueModalState.images.length) {
      gallery.hidden = true;
      main.removeAttribute("src");
      return;
    }
    gallery.hidden = false;
    const image = venueModalState.images[venueModalState.index];
    main.classList.add("is-loading");
    main.alt = venueImageAlt(profile, image);
    main.onload = () => main.classList.remove("is-loading");
    main.dataset.fallbackSrc = remoteImageUrl(image, "w-1600,c-at_max,q-82");
    main.dataset.fallbackUsed = "false";
    main.onerror = () => {
      if (useRemoteFallback(main)) return;
      venueModalState.images.splice(venueModalState.index, 1);
      venueModalState.index = Math.min(venueModalState.index, Math.max(venueModalState.images.length - 1, 0));
      renderVenueGalleryThumbs();
      updateVenueGallery();
    };
    main.src = image.url || remoteImageUrl(image, "w-1600,c-at_max,q-82");
    counter.textContent = `${venueModalState.index + 1} / ${venueModalState.images.length}`;
    const single = venueModalState.images.length < 2;
    prev.hidden = single;
    next.hidden = single;
    thumbs.querySelectorAll("[data-gallery-index]").forEach((button, index) => {
      button.classList.toggle("is-active", index === venueModalState.index);
      button.setAttribute("aria-current", index === venueModalState.index ? "true" : "false");
    });
    thumbs.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    preloadVenueNeighbors();
  }

  function setVenueGalleryIndex(index) {
    const length = venueModalState.images.length;
    if (!length) return;
    venueModalState.index = (index + length) % length;
    updateVenueGallery();
  }

  function openVenueModal(key, opener) {
    const profile = venueProfileForKey(key);
    const modal = byId("venueModal");
    if (!profile || !modal) return;
    venueModalState.key = key;
    venueModalState.profile = profile;
    venueModalState.images = venueImagesForKey(key);
    venueModalState.index = 0;
    venueModalState.opener = opener || document.activeElement;
    if (venueModalState.opener instanceof HTMLElement) {
      if (!venueModalState.opener.id) venueModalState.opener.id = `venue-opener-${++venueOpenerCounter}`;
      venueModalState.openerId = venueModalState.opener.id;
    }
    const body = byId("venueModalBody");
    if (body) body.innerHTML = venueModalBodyHtml(profile);
    renderVenueGalleryThumbs();
    updateVenueGallery();
    modal.hidden = false;
    document.body.classList.add("venue-dialog-open");
    window.requestAnimationFrame(() => byId("venueDialog")?.focus());
  }

  function closeVenueModal() {
    const modal = byId("venueModal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("venue-dialog-open");
    const main = byId("venueGalleryMain");
    if (main) {
      main.onload = null;
      main.onerror = null;
      main.removeAttribute("src");
    }
    venueModalState.preloads = [];
    const opener = document.getElementById(venueModalState.openerId) || venueModalState.opener;
    venueModalState.key = "";
    venueModalState.profile = null;
    venueModalState.images = [];
    venueModalState.opener = null;
    venueModalState.openerId = "";
    if (opener?.isConnected) window.setTimeout(() => opener.focus({ preventScroll: true }), 50);
  }

  function trapVenueModalFocus(event) {
    const dialog = byId("venueDialog");
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (document.activeElement === dialog || !dialog.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBrokenVenueImage(image) {
    if (useRemoteFallback(image)) return;
    const extraCover = image.closest(".extra-place-card__cover");
    if (extraCover) {
      extraCover.remove();
      return;
    }
    if (image.closest(".venue-gallery__thumb")) {
      image.closest(".venue-gallery__thumb").remove();
      return;
    }
    if (!image.closest(".venue-thumb")) return;
    const key = image.dataset.venueKey;
    const images = venueImagesForKey(key);
    const nextIndex = Number(image.dataset.imageIndex || 0) + 1;
    if (!images[nextIndex]) {
      image.closest(".venue-thumb").remove();
      return;
    }
    const profile = venueProfileForKey(key);
    image.dataset.imageIndex = String(nextIndex);
    const replacement = images[nextIndex];
    image.src = replacement.src640 || replacement.url || remoteImageUrl(replacement, "w-480,h-360,c-at_max,q-75");
    image.srcset = replacement.src320 && replacement.src640
      ? `${replacement.src320} 320w, ${replacement.src640} 640w`
      : "";
    image.dataset.fallbackSrc = remoteImageUrl(replacement, "w-640,h-480,c-at_max,q-76");
    image.dataset.fallbackUsed = "false";
    image.alt = venueImageAlt(profile, images[nextIndex]);
  }

  function setupVenueCards() {
    document.addEventListener("click", (event) => {
      const opener = event.target.closest("button[data-venue-key]");
      if (opener) {
        openVenueModal(opener.dataset.venueKey, opener);
        return;
      }
      const galleryButton = event.target.closest("[data-gallery-index]");
      if (galleryButton) setVenueGalleryIndex(Number(galleryButton.dataset.galleryIndex));
    });
    byId("venueModal")?.querySelectorAll("[data-venue-close]").forEach((control) => {
      control.addEventListener("click", closeVenueModal);
    });
    byId("venueGalleryPrev")?.addEventListener("click", () => setVenueGalleryIndex(venueModalState.index - 1));
    byId("venueGalleryNext")?.addEventListener("click", () => setVenueGalleryIndex(venueModalState.index + 1));
    document.addEventListener("keydown", (event) => {
      const modal = byId("venueModal");
      if (!modal || modal.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeVenueModal();
      } else if (event.key === "ArrowLeft") {
        setVenueGalleryIndex(venueModalState.index - 1);
      } else if (event.key === "ArrowRight") {
        setVenueGalleryIndex(venueModalState.index + 1);
      } else {
        trapVenueModalFocus(event);
      }
    });
    document.addEventListener("error", (event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      if (useRemoteFallback(event.target)) {
        event.stopImmediatePropagation();
        return;
      }
      handleBrokenVenueImage(event.target);
    }, true);
    const viewport = byId("venueGalleryViewport");
    viewport?.addEventListener("touchstart", (event) => {
      venueModalState.touchStartX = event.changedTouches[0]?.clientX ?? null;
    }, { passive: true });
    viewport?.addEventListener("touchend", (event) => {
      if (venueModalState.touchStartX === null) return;
      const delta = (event.changedTouches[0]?.clientX ?? venueModalState.touchStartX) - venueModalState.touchStartX;
      venueModalState.touchStartX = null;
      if (Math.abs(delta) < 45) return;
      setVenueGalleryIndex(venueModalState.index + (delta < 0 ? 1 : -1));
    }, { passive: true });
  }

  window.NNVenueCards = Object.freeze({
    escapeHtml,
    venueProfiles,
    venueAssets,
    venueProfileForKey,
    venueImagesForKey,
    imageKitUrl,
    venueThumbHtml,
    venueThumbsHtml,
    explicitVenueKeysForItem,
    extraPlaceCoverHtml,
    openVenueModal,
    setupVenueCards,
  });
})();
