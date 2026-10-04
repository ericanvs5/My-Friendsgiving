(() => {
  "use strict";

  const CATEGORIES = [
    { name: "Appetizer", emoji: "🧀" },
    { name: "Main", emoji: "🦃" },
    { name: "Side", emoji: "🥔" },
    { name: "Dessert", emoji: "🥧" },
    { name: "Drinks", emoji: "🍷" },
  ];
  const BUCKET = "guest-photos";
  const TABLE = "guests";
  const DEMO_KEY = "friendsgiving-demo-guests";
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
    toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  function byCategory() {
    const groups = Object.fromEntries(CATEGORIES.map((c) => [c.name, []]));
    for (const g of guests) if (groups[g.category]) groups[g.category].push(g);
    return groups;
  }

  // ------------------------------------------------------------------ chart

  function niceMax(max) {
    if (max <= 4) return 4;
    const step = Math.ceil(max / 4);
    return step * 4;
  }

  function renderChart() {
    const groups = byCategory();
    const counts = CATEGORIES.map((c) => groups[c.name].length);
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
      const list = groups[cat.name];
      const count = list.length;

      const tooltip = el("div", { class: "tooltip", role: "tooltip" }, [
        el("div", { class: "tooltip-title" }, [
          el("span", { text: `${cat.emoji} ${cat.name}` }),
          el("span", { text: `${count} ${count === 1 ? "dish" : "dishes"}` }),
        ]),
        count
          ? el("ul", {}, list.map((g) =>
              el("li", {}, [
                avatar(g),
                el("div", {}, [el("span", { class: "t-name", text: g.name }), el("span", { class: "t-dish", text: g.dish })]),
              ])
            ))
          : el("p", { class: "tooltip-empty", text: "Nothing here yet — be the first!" }),
      ]);

      const bar = el("div", { class: "bar", style: `height:${(count / yMax) * 100}%` }, [
        el("span", { class: "bar-value", text: String(count) }),
        tooltip,
      ]);

      const label = `${cat.name}: ${count} ${count === 1 ? "dish" : "dishes"}` +
        (count ? ` — ${list.map((g) => `${g.name} (${g.dish})`).join(", ")}` : "");
      const col = el("div", { class: count / yMax > 0.5 ? "bar-col tall" : "bar-col", role: "button", tabindex: "0", "aria-label": label }, [bar]);
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

      xAxis.append(el("div", { class: "x-label" }, [el("span", { class: "emoji", text: cat.emoji }), cat.name]));
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

  function renderList() {
    if (!guests.length) {
      listEl.replaceChildren(el("p", { class: "empty-state", text: "No one has signed up yet. Be the first to claim a dish! 🥇" }));
      return;
    }
    const groups = byCategory();
    const sections = CATEGORIES.filter((c) => groups[c.name].length).map((cat) =>
      el("div", { class: "guest-group" }, [
        el("h3", {}, [`${cat.emoji} ${cat.name}`, el("span", { class: "count", text: String(groups[cat.name].length) })]),
        el("div", { class: "guest-grid" }, groups[cat.name].map((g) =>
          el("div", { class: "guest" }, [
            avatar(g),
            el("div", {}, [el("span", { class: "g-name", text: g.name }), el("span", { class: "g-dish", text: g.dish })]),
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
    $("hero-count").textContent = n ? `${n} ${n === 1 ? "guest has" : "guests have"} signed up so far` : "";
  }

  // ------------------------------------------------------------------- data

  async function loadGuests() {
    if (demoMode) {
      try { guests = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { guests = []; }
      return;
    }
    const { data, error } = await db.from(TABLE).select("*").order("created_at", { ascending: true });
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

  function subscribeToChanges() {
    if (demoMode) return;
    db.channel("guests-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, (payload) => {
        addGuestLocally(payload.new);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: TABLE }, async () => {
        await loadGuests();
        renderAll();
      })
      .subscribe();
  }

  async function saveGuest({ name, dish, category, blob }) {
    if (demoMode) {
      const photo_url = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      const guest = { id: crypto.randomUUID(), created_at: new Date().toISOString(), name, dish, category, photo_url };
      const stored = [...guests, guest];
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(stored)); } catch { /* storage full or blocked */ }
      return guest;
    }

    const path = `${crypto.randomUUID()}.jpg`;
    const upload = await db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (upload.error) throw new Error(`Photo upload failed: ${upload.error.message}`);
    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await db.from(TABLE)
      .insert({ name, dish, category, photo_url: urlData.publicUrl })
      .select()
      .single();
    if (error) throw new Error(`Couldn't save your sign-up: ${error.message}`);
    return data;
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
        el("input", { type: "radio", name: "category", value: cat.name, required: "" }),
        el("span", { text: `${cat.emoji} ${cat.name}` }),
      ]));
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    const name = $("name").value.trim();
    const dish = $("dish").value.trim();
    const category = form.querySelector('input[name="category"]:checked')?.value;

    if (!iconBlob) return void (formError.textContent = "Add a photo for your icon 📸");
    if (!name) return void (formError.textContent = "What's your name?");
    if (!dish) return void (formError.textContent = "What dish are you bringing?");
    if (!category) return void (formError.textContent = "Pick a dish category.");

    submitBtn.disabled = true;
    submitBtn.querySelector(".submit-label").textContent = "Saving… 🥄";
    try {
      const guest = await saveGuest({ name, dish, category, blob: iconBlob });
      addGuestLocally(guest);
      form.reset();
      iconBlob = null;
      photoPreview.hidden = true;
      photoPlaceholder.hidden = false;
      toast(`Thanks, ${name}! Your ${dish} is on the menu 🎉`);
    } catch (err) {
      console.error(err);
      formError.textContent = err.message || "Something went wrong. Please try again.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector(".submit-label").textContent = "Add me to the table 🍽️";
    }
  });

  // -------------------------------------------------------------- decoration

  function dropLeaves() {
    const leaves = document.querySelector(".leaves");
    const shapes = ["🍂", "🍁", "🍃"];
    for (let i = 0; i < 14; i++) {
      const leaf = el("span", { class: "leaf", text: shapes[i % shapes.length] });
      leaf.style.left = `${Math.random() * 100}%`;
      leaf.style.animationDuration = `${12 + Math.random() * 14}s`;
      leaf.style.animationDelay = `${-Math.random() * 20}s`;
      leaf.style.fontSize = `${16 + Math.random() * 16}px`;
      leaves.append(leaf);
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
    dropLeaves();
    renderAll();
    await loadGuests();
    renderAll();
    subscribeToChanges();
  }

  init();
})();
