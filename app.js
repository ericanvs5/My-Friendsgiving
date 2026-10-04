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

  // ------------------------------------------- hand-drawn pumpkins & gourds
  // Ink outlines with color laid slightly off-register, like a printed card.

  const INK = "#4a2a24";
  const C = {
    rust: "#bf5a2c", rustDeep: "#9e4421", mustard: "#e0b54a", cream: "#f3e6c9",
    olive: "#76813f", green: "#4c5a30", brown: "#7a5232", sage: "#a9c2bd",
  };

  const svg = (body, viewBox = "0 0 80 80") =>
    `<svg viewBox="${viewBox}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const offset = (body) => `<g stroke="none" transform="translate(2.4 1.8)">${body}</g>`;

  function pumpkin(fill, stem) {
    return svg(
      offset(`<path fill="${fill}" d="M40 28C24 22 10 32 11 46C12 61 26 67 40 65C54 67 69 61 69 46C70 32 56 22 40 28Z"/>
        <path fill="${stem}" d="M37 28C37 21 40 15 45 12L48 15C44 18 43 22 43 28Z"/>`) +
      `<path d="M38 27C22 22 9 33 10 46C11 60 24 66 36 64M42 27C58 22 71 33 70 46C69 60 56 66 44 64"/>
       <path d="M34 28C27 38 27 54 35 64M46 28C53 38 53 54 45 64M35 64Q40 67 45 64"/>
       <path d="M38 27C38 20 40 15 45 12M42 27C42 21 43 18 48 15M45 12L48 15"/>
       <path d="M44 22c4-3 9-2 9 2s-5 4-5 1" stroke-width="1.3"/>`
    );
  }

  const ART = {
    pumpkin: () => pumpkin(C.rust, C.brown),
    whitePumpkin: () => pumpkin(C.cream, C.olive),
    mustardPumpkin: () => pumpkin(C.mustard, C.brown),
    dumpling: () => svg(
      offset(`<path fill="${C.mustard}" d="M12 47C12 33 26 29 40 29C54 29 68 33 68 47C68 61 54 65 40 65C26 65 12 61 12 47Z"/>`) +
      `<path d="M33 30C29 40 29 55 33 64M47 30C51 40 51 55 47 64M21 34C17 41 17 53 21 60M59 34C63 41 63 53 59 60" stroke="${C.olive}" stroke-width="3.2"/>
       <path d="M12 47C12 33 26 29 40 29C54 29 68 33 68 47C68 61 54 65 40 65C26 65 12 61 12 47Z"/>
       <path d="M26 31C20 40 20 55 26 63M40 29V65M54 31C60 40 60 55 54 63"/>
       <path d="M39 30C39 25 40 22 43 19M41 30C41 26 42 24 45 21M43 19L45 21"/>
       <g fill="${C.rust}" stroke="none"><circle cx="17" cy="45" r="1.3"/><circle cx="29" cy="52" r="1.2"/><circle cx="44" cy="40" r="1.3"/><circle cx="57" cy="50" r="1.3"/><circle cx="36" cy="58" r="1.1"/></g>`
    ),
    warty: () => {
      const bumps = [[30,32],[40,30],[50,33],[25,41],[35,39],[46,40],[56,43],[28,51],[39,49],[50,52],[33,59],[44,60]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.1"/>`).join("");
      return svg(
        offset(`<path fill="${C.rust}" d="M40 26C52 26 60 35 60 46C60 58 51 66 40 66C28 66 20 57 20 46C20 35 28 26 40 26Z"/>
          <path fill="${C.olive}" d="M24 50C27 46 33 47 33 52C31 56 26 56 24 50Z"/>`) +
        `<path d="M40 26C52 26 60 35 60 46C60 58 51 66 40 66C28 66 20 57 20 46C20 35 28 26 40 26Z"/>
         <g fill="${C.mustard}" stroke-width="1.2">${bumps}</g>
         <path d="M39 26C39 22 40 19 43 17M41.5 26C41.5 23 42.5 21 45 19.5M43 17L45 19.5"/>`
      );
    },
    swan: () => svg(
      offset(`<path fill="${C.mustard}" d="M28 47C14 50 14 70 34 70C52 71 60 56 47 47C41 41 40 34 40 26C40 20 42 16 46 13L43 10C38 12 34 16 33 22C32 30 33 40 28 47Z"/>`) +
      `<path fill="${C.green}" stroke="none" d="M17 58Q29 54 38 60T59 55C59 66 49 71 34 70C24 70 17 66 17 58Z"/>
       <path d="M17 58Q29 54 38 60T59 55"/>
       <path d="M28 46C14 50 14 70 34 70C52 71 60 56 47 47"/>
       <path d="M28 46C33 40 32 30 33 22C34 16 38 12 43 10M47 47C41 41 40 34 40 26C40 20 42 16 46 13M43 10Q46 10 46 13"/>
       <path d="M44 11C45 7 47 5 50 4" stroke-width="2.2"/>`
    ),
    acorn: () => svg(
      offset(`<path fill="${C.green}" d="M40 24C26 24 15 35 17 49C19 62 30 70 40 71C50 70 61 62 63 49C65 35 54 24 40 24Z"/>
        <path fill="${C.rust}" d="M44 52C50 50 56 54 54 60C50 64 44 62 44 52Z"/>`) +
      `<path d="M40 24C26 24 15 35 17 49C19 62 30 70 40 71C50 70 61 62 63 49C65 35 54 24 40 24Z"/>
       <path d="M30 26C24 38 26 58 36 70M50 26C56 38 54 58 44 70M40 24V71"/>
       <path d="M37 24C37 19 38 16 40 13L44 14C43 17 43 20 43 24" fill="${C.brown}"/>`
    ),
    leaf: (color = C.rust) => svg(
      `<path fill="${color}" stroke="none" d="M42 14C56 28 57 47 42 68C27 47 28 28 42 14Z"/>
       <path d="M40 22V74M40 40l-6-6M40 50l7-7M40 60l-6-5" stroke-width="1.4"/>`
    ),
  };

  // A scalloped string of lights for the top of the invitation.
  function garland() {
    const W = 720, swags = 8, span = W / swags, top = 5, low = 34;
    const pt = (t, a, b, c, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
    let line = `M0 ${top}`, bulbs = "";
    for (let i = 0; i < swags; i++) {
      const x0 = i * span, x1 = x0 + span, c0 = x0 + span * 0.12, c1 = x1 - span * 0.12;
      line += ` C${c0} ${low} ${c1} ${low} ${x1} ${top}`;
      for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const x = pt(t, x0, c0, c1, x1), y = pt(t, top, low, low, top);
        bulbs += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}v4"/><circle cx="${x.toFixed(1)}" cy="${(y + 8.5).toFixed(1)}" r="4.6" fill="${C.mustard}" stroke-width="1.3"/>`;
      }
    }
    return svg(`<path d="${line}"/>${bulbs}`, `0 0 ${W} 44`);
  }

  // A little branch with rust leaves, used as a divider under the title.
  function sprig() {
    let leaves = "";
    for (const [x, up] of [[22, 1], [40, 0], [58, 1], [92, 0], [110, 1], [128, 0]]) {
      const dy = up ? -1 : 1;
      leaves += `<path fill="${C.rust}" stroke="none" d="M${x} 16q${4} ${dy * -9} ${12} ${dy * -11}q${-2} ${dy * 9} ${-12} ${dy * 11}z"/>`;
    }
    return svg(
      `<path d="M6 16C40 14 110 18 144 16" stroke-width="1.4"/>${leaves}
       <circle cx="75" cy="16" r="5" fill="${C.mustard}" stroke-width="1.3"/>`,
      "0 0 150 32"
    );
  }

  function decorate() {
    $("garland").innerHTML = garland();
    $("sprig").innerHTML = sprig();

    const cluster = [["whitePumpkin", 64], ["pumpkin", 96], ["swan", 70], ["dumpling", 72], ["warty", 58], ["acorn", 54]];
    $("hero-gourds").replaceChildren(...cluster.map(([kind, size]) => {
      const d = el("div");
      d.style.width = `${size}px`;
      d.innerHTML = ART[kind]();
      return d;
    }));

    const layer = document.querySelector(".falling");
    const kinds = ["pumpkin", "warty", "swan", "whitePumpkin", "dumpling", "leaf", "acorn", "mustardPumpkin", "leaf"];
    const count = window.innerWidth < 600 ? 10 : 18;
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length];
      const f = el("div", { class: "faller" });
      f.innerHTML = kind === "leaf" ? ART.leaf(i % 2 ? C.rust : C.mustard) : ART[kind]();
      const size = kind === "leaf" ? 26 + Math.random() * 14 : 40 + Math.random() * 34;
      f.style.width = `${size}px`;
      f.style.left = `${(i / count) * 100 + Math.random() * (100 / count) - 4}%`;
      f.style.animationDuration = `${26 + Math.random() * 26}s`;
      f.style.animationDelay = `${-Math.random() * 50}s`;
      f.style.setProperty("--r0", `${Math.round(Math.random() * 50 - 25)}deg`);
      f.style.setProperty("--spin", `${Math.round(Math.random() * 120 - 60) + (kind === "leaf" ? 200 : 0)}deg`);
      f.style.setProperty("--sway", `${Math.round(Math.random() * 50 + 20)}px`);
      f.style.setProperty("--static-top", `${Math.round(Math.random() * 90)}vh`);
      layer.append(f);
    }
  }

  // ------------------------------------------------------------------- start

  async function init() {
    if (config.EVENT_TITLE) {
      $("event-title").textContent = config.EVENT_TITLE;
      document.title = config.EVENT_TITLE;
    }
    $("event-when").textContent = [config.EVENT_DATE, config.EVENT_TIME].filter(Boolean).join(" at ");
    $("quote-text").textContent = config.QUOTE ? `“${config.QUOTE}”` : "";
    $("quote-source").textContent = config.QUOTE_SOURCE ? `— ${config.QUOTE_SOURCE}` : "";
    $("event-quote").hidden = !config.QUOTE;
    $("demo-banner").hidden = !demoMode;

    buildCategoryChips();
    decorate();
    renderAll();
    await loadGuests();
    renderAll();
    subscribeToChanges();
  }

  init();
})();
