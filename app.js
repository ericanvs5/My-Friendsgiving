(() => {
  "use strict";

  const CATEGORIES = ["Appetizer", "Main", "Side", "Dessert", "Drinks"];
  const BUCKET = "guest-photos";
  const TABLE = "guests";
  const COLUMNS = "id, created_at, name, dish, category, photo_url";
  const DEMO_KEY = "friendsgiving-demo-guests";
  const MINE_KEY = "friendsgiving-my-entries"; // { guestId: removeCode } for entries made in this browser
  const ICON_SIZE = 256; // photos are cropped to a 256×256 square before upload

  const config = window.FRIENDSGIVING_CONFIG || {};
  const supabaseUrl = (config.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const supabaseKey = (config.SUPABASE_ANON_KEY || "").trim();
  const demoMode = !supabaseUrl || !supabaseKey || !window.supabase;
  const db = demoMode ? null : window.supabase.createClient(supabaseUrl, supabaseKey);
  const photoPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;

  const $ = (id) => document.getElementById(id);
  const form = $("signup-form");
  const photoInput = $("photo");
  const photoPreview = $("photo-preview");
  const photoPlaceholder = $("photo-placeholder");
  const submitBtn = $("submit-btn");
  const formError = $("form-error");
  const chartEl = $("chart");
  const listEl = $("guest-list");

  let guests = [];
  let iconBlob = null;

  // ---------------------------------------------------------------- helpers

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }

  const myEntries = () => readJSON(MINE_KEY, {});

  async function sha256Hex(text) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Only show photos that live in our own storage bucket (or demo-mode data URLs).
  function safePhotoUrl(url) {
    if (typeof url !== "string") return null;
    if (demoMode) return url.startsWith("data:image/") ? url : null;
    return url.startsWith(photoPrefix) ? url : null;
  }

  function avatar(guest) {
    const url = safePhotoUrl(guest.photo_url);
    if (url) {
      const img = el("img", { class: "avatar", src: url, alt: "", loading: "lazy" });
      img.addEventListener("error", () => img.replaceWith(initialsAvatar(guest.name)), { once: true });
      return img;
    }
    return initialsAvatar(guest.name);
  }

  function initialsAvatar(name) {
    const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return el("span", { class: "avatar fallback", "aria-hidden": "true", text: initials || "?" });
  }

  function toast(message) {
    const t = $("toast");
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 3800);
  }

  function byCategory() {
    const groups = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
    for (const g of guests) if (groups[g.category]) groups[g.category].push(g);
    return groups;
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "es"}`;

  // ------------------------------------------------------------------ chart

  function niceMax(max) {
    return max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  }

  function renderChart() {
    const groups = byCategory();
    const counts = CATEGORIES.map((c) => groups[c].length);
    const yMax = niceMax(Math.max(...counts));
    const tickStep = yMax / 4;

    const yAxis = el("div", { class: "y-axis", "aria-hidden": "true" });
    const plot = el("div", { class: "plot" });
    for (let v = 0; v <= yMax; v += tickStep) {
      const pct = (v / yMax) * 100;
      yAxis.append(el("span", { class: "y-tick", style: `bottom:${pct}%`, text: String(v) }));
      if (v > 0) plot.append(el("div", { class: "gridline", style: `bottom:${pct}%` }));
    }

    const bars = el("div", { class: "bars" });
    const xAxis = el("div", { class: "x-axis", "aria-hidden": "true" });

    CATEGORIES.forEach((cat) => {
      const list = groups[cat];
      const count = list.length;

      const tooltip = el("div", { class: "tooltip", role: "tooltip" }, [
        el("div", { class: "tooltip-title" }, [
          el("span", { text: cat }),
          el("span", { text: plural(count, "dish") }),
        ]),
        count
          ? el("ul", {}, list.map((g) =>
              el("li", {}, [
                avatar(g),
                el("div", {}, [el("span", { class: "t-name", text: g.name }), el("span", { class: "t-dish", text: g.dish })]),
              ])
            ))
          : el("p", { class: "tooltip-empty", text: "Nothing here yet — be the first." }),
      ]);

      const bar = el("div", { class: "bar", style: `height:${(count / yMax) * 100}%` }, [
        el("span", { class: "bar-value", text: String(count) }),
        tooltip,
      ]);

      const label = `${cat}: ${plural(count, "dish")}` +
        (count ? ` — ${list.map((g) => `${g.name} (${g.dish})`).join(", ")}` : "");
      const col = el("div", {
        class: count / yMax > 0.5 ? "bar-col tall" : "bar-col",
        role: "button",
        tabindex: "0",
        "aria-label": label,
      }, [bar]);
      const toggle = () => {
        const wasOpen = col.classList.contains("is-open");
        closeAllTooltips();
        if (!wasOpen) col.classList.add("is-open");
      };
      col.addEventListener("click", (e) => {
        if (e.target.closest(".tooltip")) return;
        e.stopPropagation();
        toggle();
      });
      col.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
      bars.append(col);

      xAxis.append(el("div", { class: "x-label", text: cat }));
    });

    plot.append(bars);
    chartEl.replaceChildren(yAxis, plot, xAxis);
    fitTooltips();
  }

  // Nudge each tooltip sideways so it never pokes past the screen edge.
  function fitTooltips() {
    const gutter = 16;
    const viewport = document.documentElement.clientWidth;
    chartEl.querySelectorAll(".tooltip").forEach((tip) => {
      tip.style.left = "50%";
      const { left, right } = tip.getBoundingClientRect();
      const shift = Math.max(gutter - left, 0) + Math.min(viewport - gutter - right, 0);
      if (shift) tip.style.left = `calc(50% + ${Math.round(shift)}px)`;
    });
  }
  window.addEventListener("resize", fitTooltips);

  function closeAllTooltips() {
    chartEl.querySelectorAll(".bar-col.is-open").forEach((c) => c.classList.remove("is-open"));
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".tooltip")) closeAllTooltips(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllTooltips(); });

  // ------------------------------------------------------------- guest list

  function removeButton(guest) {
    const btn = el("button", { type: "button", class: "remove-btn", text: "Remove my entry" });
    let armed = null;
    btn.addEventListener("click", async () => {
      if (!armed) {
        btn.textContent = "Tap again to remove";
        btn.classList.add("confirming");
        armed = setTimeout(() => {
          armed = null;
          btn.textContent = "Remove my entry";
          btn.classList.remove("confirming");
        }, 4000);
        return;
      }
      clearTimeout(armed);
      btn.disabled = true;
      btn.textContent = "Removing…";
      try {
        await deleteGuest(guest);
        toast(`${guest.name}'s ${guest.dish} has been removed.`);
      } catch (err) {
        console.error(err);
        toast(err.message || "Couldn't remove that entry. Please try again.");
        renderList();
      }
    });
    return btn;
  }

  function renderList() {
    if (!guests.length) {
      listEl.replaceChildren(el("p", { class: "empty-state", text: "The table is set — no one has signed up yet." }));
      return;
    }
    const mine = myEntries();
    const groups = byCategory();
    const sections = CATEGORIES.filter((c) => groups[c].length).map((cat) =>
      el("div", { class: "guest-group" }, [
        el("h3", {}, [cat, el("span", { class: "count", text: String(groups[cat].length) })]),
        el("div", { class: "guest-grid" }, groups[cat].map((g) =>
          el("div", { class: "guest" }, [
            avatar(g),
            el("div", { class: "guest-info" }, [
              el("span", { class: "g-name", text: g.name }),
              el("span", { class: "g-dish", text: g.dish }),
              mine[g.id] ? removeButton(g) : null,
            ]),
          ])
        )),
      ])
    );
    listEl.replaceChildren(...sections);
  }

  function renderAll() {
    renderChart();
    renderList();
    const n = guests.length;
    $("hero-count").textContent = n ? `${n} ${n === 1 ? "guest" : "guests"} at the table` : "";
  }

  // ------------------------------------------------------------------- data

  async function loadGuests() {
    if (demoMode) {
      guests = readJSON(DEMO_KEY, []);
      return;
    }
    const { data, error } = await db.from(TABLE).select(COLUMNS).order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      toast("Couldn't load the guest list. Check your Supabase setup.");
      return;
    }
    guests = data;
  }

  function addGuestLocally(guest) {
    if (guests.some((g) => g.id === guest.id)) return;
    guests.push(guest);
    renderAll();
  }

  function removeGuestLocally(id) {
    guests = guests.filter((g) => g.id !== id);
    const mine = myEntries();
    if (mine[id]) {
      delete mine[id];
      writeJSON(MINE_KEY, mine);
    }
    renderAll();
  }

  function subscribeToChanges() {
    if (demoMode) return;
    db.channel("guests-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, ({ new: row }) => {
        const { id, created_at, name, dish, category, photo_url } = row;
        addGuestLocally({ id, created_at, name, dish, category, photo_url });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: TABLE }, async ({ old }) => {
        if (old && old.id) return removeGuestLocally(old.id);
        await loadGuests();
        renderAll();
      })
      .subscribe();
  }

  async function saveGuest({ name, dish, category, blob }) {
    const id = crypto.randomUUID();
    const removeCode = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const guest = { id, created_at: new Date().toISOString(), name, dish, category };

    if (demoMode) {
      guest.photo_url = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      writeJSON(DEMO_KEY, [...guests, guest]);
    } else {
      const path = `${id}.jpg`;
      const upload = await db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (upload.error) throw new Error(`Photo upload failed: ${upload.error.message}`);
      guest.photo_url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

      const { error } = await db.from(TABLE).insert({ ...guest, delete_token_hash: await sha256Hex(removeCode) });
      if (error) throw new Error(`Couldn't save your sign-up: ${error.message}`);
    }

    writeJSON(MINE_KEY, { ...myEntries(), [id]: removeCode });
    return guest;
  }

  async function deleteGuest(guest) {
    if (demoMode) {
      writeJSON(DEMO_KEY, guests.filter((g) => g.id !== guest.id));
      removeGuestLocally(guest.id);
      return;
    }
    const removeCode = myEntries()[guest.id];
    const { data: removed, error } = await db.rpc("delete_my_guest", { guest_id: guest.id, token: removeCode });
    if (error) throw new Error(`Couldn't remove your entry: ${error.message}`);
    if (!removed) throw new Error("That entry couldn't be removed — it may already be gone.");

    // Tidy up the photo too (best effort — the host can always clean up in Supabase).
    const url = guest.photo_url || "";
    if (url.startsWith(photoPrefix)) {
      db.storage.from(BUCKET).remove([url.slice(photoPrefix.length)]).catch(() => {});
    }
    removeGuestLocally(guest.id);
  }

  // ------------------------------------------------------------------ photo

  // Center-crop to a square and shrink, so uploads are small and icons look tidy.
  function makeIcon(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = ICON_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo."))), "image/jpeg", 0.85);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("That photo format isn't supported here. Try a JPG or PNG."));
      };
      img.src = url;
    });
  }

  photoInput.addEventListener("change", async () => {
    formError.textContent = "";
    iconBlob = null;
    const file = photoInput.files[0];
    if (!file) return;
    try {
      iconBlob = await makeIcon(file);
      if (photoPreview.src.startsWith("blob:")) URL.revokeObjectURL(photoPreview.src);
      photoPreview.src = URL.createObjectURL(iconBlob);
      photoPreview.hidden = false;
      photoPlaceholder.hidden = true;
    } catch (err) {
      formError.textContent = err.message;
      photoInput.value = "";
      photoPreview.hidden = true;
      photoPlaceholder.hidden = false;
    }
  });

  // ------------------------------------------------------------------- form

  function buildCategoryChips() {
    const wrap = $("category-chips");
    for (const cat of CATEGORIES) {
      wrap.append(el("label", { class: "chip" }, [
        el("input", { type: "radio", name: "category", value: cat, required: "" }),
        el("span", { text: cat }),
      ]));
    }
  }

  const SUBMIT_LABEL = "Add me to the table";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    const name = $("name").value.trim();
    const dish = $("dish").value.trim();
    const category = form.querySelector('input[name="category"]:checked')?.value;

    if (!iconBlob) return void (formError.textContent = "Please add a photo for your portrait.");
    if (!name) return void (formError.textContent = "What's your name?");
    if (!dish) return void (formError.textContent = "What dish are you bringing?");
    if (!category) return void (formError.textContent = "Please choose a course.");

    submitBtn.disabled = true;
    submitBtn.querySelector(".submit-label").textContent = "Setting your place…";
    try {
      const guest = await saveGuest({ name, dish, category, blob: iconBlob });
      addGuestLocally(guest);
      form.reset();
      iconBlob = null;
      photoPreview.hidden = true;
      photoPlaceholder.hidden = false;
      toast(`Thank you, ${name} — your ${dish} is on the menu.`);
    } catch (err) {
      console.error(err);
      formError.textContent = err.message || "Something went wrong. Please try again.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector(".submit-label").textContent = SUBMIT_LABEL;
    }
  });

  // ----------------------------------------------------- pumpkins & gourds

  const GOURDS = [
    // ribbed orange pumpkin
    () => pumpkin(["#9c4a1c", "#b95c24", "#cf7232", "#4f4128"]),
    // white pumpkin
    () => pumpkin(["#cfc2a4", "#ddd2b9", "#ebe3d0", "#6b7448"]),
    // pale "cinderella" pumpkin
    () => pumpkin(["#b8743a", "#cc8a4b", "#dca064", "#5a4a2c"]),
    // striped sweet-dumpling squash
    (u) => `<svg viewBox="0 0 64 64"><defs><clipPath id="${u}"><ellipse cx="32" cy="41" rx="25" ry="16"/></clipPath></defs>
      <ellipse cx="32" cy="41" rx="25" ry="16" fill="#e2d4b0"/>
      <g clip-path="url(#${u})" fill="none" stroke="#5c6b38" stroke-width="3.4">
        <path d="M13 24Q5 41 13 58"/><path d="M22 24Q16 41 22 58"/><path d="M32 24V58"/><path d="M42 24Q48 41 42 58"/><path d="M51 24Q59 41 51 58"/>
      </g>
      <g fill="#c8692c" opacity=".7"><circle cx="18" cy="38" r="1.4"/><circle cx="27" cy="47" r="1.2"/><circle cx="37" cy="36" r="1.3"/><circle cx="46" cy="46" r="1.4"/></g>
      <path d="M32 27c0-5 1-8 4.5-10" stroke="#4f4128" stroke-width="3.4" fill="none" stroke-linecap="round"/></svg>`,
    // warty orange gourd
    () => {
      const bumps = [[20,30],[28,24],[37,25],[45,31],[16,40],[25,36],[34,33],[43,40],[50,42],[21,49],[30,45],[39,48],[47,51],[27,55],[36,56]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join("");
      return `<svg viewBox="0 0 64 64"><ellipse cx="33" cy="41" rx="21" ry="19" fill="#bf5f28"/>
        <g fill="#d88a46">${bumps}</g>
        <g fill="#6d7240" opacity=".85"><ellipse cx="24" cy="44" rx="4" ry="3"/><ellipse cx="42" cy="34" rx="3.5" ry="2.6"/></g>
        <path d="M33 23c0-5 2-8 5-10" stroke="#4f4128" stroke-width="3.4" fill="none" stroke-linecap="round"/></svg>`;
    },
    // two-tone swan-neck gourd
    (u) => `<svg viewBox="0 0 64 64"><defs><clipPath id="${u}"><ellipse cx="36" cy="47" rx="17" ry="14"/></clipPath></defs>
      <path d="M31 40C27 29 23 19 28 10" stroke="#d3a443" stroke-width="10" fill="none" stroke-linecap="round"/>
      <ellipse cx="36" cy="47" rx="17" ry="14" fill="#d3a443"/>
      <path d="M17 48Q27 44 36 49T56 47V64H17Z" fill="#3c4729" clip-path="url(#${u})"/>
      <path d="M28 10c-1-3 0-5 2.5-6.5" stroke="#4f4128" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  ];

  function pumpkin([dark, mid, light, stem]) {
    return `<svg viewBox="0 0 64 64">
      <ellipse cx="18" cy="41" rx="14" ry="16" fill="${dark}"/><ellipse cx="46" cy="41" rx="14" ry="16" fill="${dark}"/>
      <ellipse cx="25" cy="41" rx="11" ry="17.5" fill="${mid}"/><ellipse cx="39" cy="41" rx="11" ry="17.5" fill="${mid}"/>
      <ellipse cx="32" cy="41" rx="9" ry="18.5" fill="${light}"/>
      <path d="M31 26c0-6 1.5-10 6-13" stroke="${stem}" stroke-width="3.6" fill="none" stroke-linecap="round"/></svg>`;
  }

  function scatterGourds() {
    const layer = document.querySelector(".gourds");
    const count = window.innerWidth < 600 ? 9 : 16;
    for (let i = 0; i < count; i++) {
      const make = GOURDS[i % GOURDS.length];
      const g = el("div", { class: "gourd" });
      g.innerHTML = make(`gourd-clip-${i}`);
      const size = 30 + Math.random() * 34;
      g.style.width = `${size}px`;
      g.style.left = `${(i / count) * 100 + Math.random() * (100 / count) - 3}%`;
      g.style.animationDuration = `${38 + Math.random() * 34}s`;
      g.style.animationDelay = `${-Math.random() * 70}s`;
      g.style.setProperty("--r0", `${Math.round(Math.random() * 60 - 30)}deg`);
      g.style.setProperty("--sway", `${Math.round(Math.random() * 80 - 40)}px`);
      g.style.setProperty("--static-top", `${Math.round(Math.random() * 90)}vh`);
      layer.append(g);
    }
  }

  // ------------------------------------------------------------------- start

  async function init() {
    if (config.EVENT_TITLE) {
      $("event-title").textContent = config.EVENT_TITLE;
      document.title = config.EVENT_TITLE;
    }
    $("event-details").textContent = config.EVENT_DETAILS || "";
    $("demo-banner").hidden = !demoMode;

    buildCategoryChips();
    scatterGourds();
    renderAll();
    await loadGuests();
    renderAll();
    subscribeToChanges();
  }

  init();
})();
