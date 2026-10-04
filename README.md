# 🦃 My Friendsgiving

A small Friendsgiving sign-up site. Guests add their **name**, the **dish** they're bringing, a **category**
(Appetizer, Main, Side, Dessert, Drinks) and a **photo** for their icon. A bar chart shows how many
dishes are in each category. Hover over a bar (or tap it on a phone) to see each guest's photo, name and dish.

Guests can remove their own entry if they made a mistake. A **Remove my entry** link appears under their
name on the device they signed up from.

Everything is saved in **Supabase** (a free online database), so all guests see the same list. New sign-ups
show up on everyone's screen without a refresh. The site itself is hosted for free on **GitHub Pages**.

There is nothing to install and no build step. It's plain HTML, CSS and JavaScript.

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | The look: kraft paper, cream card stock, rust and mustard |
| `app.js` | The form, the chart, and the Supabase connection |
| `config.js` | **The only file you edit.** Your two Supabase values go here |
| `supabase/setup.sql` | A script that creates the database table and the photo storage for you |

> **Before you set anything up**, the site runs in *demo mode*: it works, but sign-ups are only saved in
> your own browser. A banner at the top tells you when you're in demo mode.

---

## Part 1: Set up Supabase (about 10 minutes)

### Step 1: Create a free account
1. Go to **https://supabase.com** and click **Start your project**.
2. Sign up. "Continue with GitHub" is the easiest option.

### Step 2: Create a project
1. Click **New project**. If it asks you to choose an organization, pick the one with your name.
2. Fill in:
   - **Project name:** `friendsgiving` (any name works)
   - **Database password:** click **Generate a password**, then save it somewhere like a password manager.
     The website doesn't need it, but you might later.
   - **Region:** choose the one closest to you and your guests.
3. Click **Create new project**, then wait 1 to 2 minutes while Supabase sets it up.

### Step 3: Create the database table and photo storage
This step uses a script that's included in this repository.

1. In this repo on GitHub, open **`supabase/setup.sql`**. Click the **Copy raw file** button (two overlapping
   squares, at the top right of the file view) to copy the whole thing.
2. In Supabase, click **SQL Editor** in the left sidebar. It has a `>_` icon.
3. Click **+ New query** (or **New SQL snippet**), paste the script into the big text box, and click **Run**
   (or press Ctrl/Cmd + Enter).
4. You should see **"Success. No rows returned."**
   - If Supabase warns that the query has *destructive operations*, that's expected. The script deletes
     and recreates its own security rules so you can run it more than once. Click **Run this query**.

**Check that it worked:**
- Click **Table Editor** in the sidebar. You should see a table named **`guests`**.
- Click **Storage** in the sidebar. You should see a bucket named **`guest-photos`** marked *Public*.

<details>
<summary>What did that script do? (optional reading)</summary>

- Created a `guests` table with columns for name, dish, category and photo link. It has length limits, and
  only the five categories are allowed.
- Turned on **Row Level Security**. Visitors to your site can *read* the guest list and *add* themselves,
  but they can't edit or delete anyone else's entry.
- Turned on **Realtime** for the table, so new sign-ups appear live for everyone.
- Set up **Remove my entry**. When someone signs up, their browser keeps a private remove code, and the
  database stores only a scrambled (hashed) copy of it. Only that browser can remove that entry, and nobody
  can read the codes.
- Created a public **`guest-photos`** storage bucket that only accepts images up to 2 MB. Visitors can upload
  to it but can't delete or replace files. (The site also shrinks every photo to 256×256 before uploading.)
</details>

### Step 4: Copy your two connection values
1. Click the **Connect** button at the top of your project dashboard. You can also go to **Project Settings**
   (gear icon at the bottom of the sidebar) → **API Keys** for the key and **Data API** for the URL.
2. Copy these two values:
   - **Project URL**, which looks like `https://abcdefghijkl.supabase.co`
   - **Publishable key**, which starts with `sb_publishable_...`. Older projects call it the **`anon` `public`**
     key; it's a long string starting with `eyJ...`. Either one works.

> ⚠️ **Never** use the key labeled **secret** or **`service_role`**. That key can bypass all security
> rules. The publishable/anon key is *meant* to be public, and the security rules from Step 3 control
> what it's allowed to do.

### Step 5: Paste them into `config.js`
1. In this repo on GitHub, open **`config.js`** and click the **pencil icon** (Edit this file).
2. Put your values between the quotes:
   ```js
   SUPABASE_URL: "https://abcdefghijkl.supabase.co",
   SUPABASE_ANON_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxx",
   ```
   In the same file you can also change the invitation text: `EVENT_TITLE`, `EVENT_DATE`, `EVENT_TIME`,
   `QUOTE` and `QUOTE_SOURCE`. To hide the quote, set `QUOTE` to `""`.
3. Click **Commit changes…**, then **Commit changes** again.

Supabase is done ✅

---

## Part 2: Put the site online with GitHub Pages (about 5 minutes)

### Step 1: Get the code onto your `main` branch
The site code was written on a separate branch, `claude/charming-gates-luecuf`. GitHub Pages will publish
whatever is on the branch you pick, so first merge the code into `main`:

1. On your repo's GitHub page, click the **Pull requests** tab → **New pull request**.
2. Set **base: `main`** and **compare: `claude/charming-gates-luecuf`**, click **Create pull request** twice,
   then **Merge pull request** → **Confirm merge**.

(You can skip merging and choose the `claude/charming-gates-luecuf` branch in Step 2 instead. Merging into
`main` keeps things simpler.)

### Step 2: Turn on GitHub Pages
1. In your repo, click **Settings** (the tab with a gear icon, at the top right of the repo page).
2. In the left sidebar, under **Code and automation**, click **Pages**.
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **`main`**, then **`/ (root)`** as the folder, and click **Save**.
5. Wait 1 to 2 minutes, then refresh the page. A box will say **"Your site is live at…"** with a link like
   **`https://ericanvs5.github.io/My-Friendsgiving/`**. You can also watch progress under the repo's
   **Actions** tab.

> On a free GitHub account, Pages only works for **public** repositories. If the Pages screen says you need
> to upgrade, go to **Settings → General → Danger Zone → Change visibility → Make public**.

### Step 3: Test it, then share it 🎉
1. Open your site link. The yellow *"Demo mode"* banner should be **gone**. If it's still there, see
   Troubleshooting below.
2. Sign yourself up with a photo. Your bar should grow, and your entry should appear in Supabase under
   **Table Editor → guests**.
3. Send the link to your friends!

Any time you change a file on `main` (for example `config.js`), GitHub Pages republishes the site
automatically within a minute or two.

---

## Running the party

- **Guests can remove their own entry** with the **Remove my entry** link under their name. It only appears
  on the phone or computer they signed up from. Entries made before this feature existed can only be removed
  by you.
- **Remove any entry yourself** (a duplicate, or a guest on a different device): in Supabase, go to **Table Editor → guests**, tick the row, and
  click **Delete**. The site updates for everyone. The photo stays in **Storage → guest-photos**, where you
  can delete it too if you like.
- **Fix someone's dish:** double-click the cell in the Table Editor and edit it. Others will see the change
  next time they load the page.
- **Free projects pause** after about a week with no activity. If the site stops loading the guest list,
  open your Supabase dashboard and click **Restore project**.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Demo mode" banner is still showing on the live site | `config.js` still has empty quotes, or the change hasn't published yet. Check the file on `main`, wait 2 minutes, then hard-refresh (Ctrl/Cmd + Shift + R). |
| "Couldn't load the guest list" | The URL or key in `config.js` has a typo, or Step 3's script didn't run. Re-copy both values and re-run `setup.sql`. |
| "Photo upload failed: …row-level security…" | The storage part of `setup.sql` didn't run. Run the whole script again. |
| "Photo upload failed: …mime type…" or the photo is rejected | Use a JPG or PNG. Some iPhone HEIC photos don't work in non-Safari browsers. |
| New sign-ups only show after a refresh | Realtime isn't on. Re-run `setup.sql`, or go to **Database → Publications → supabase_realtime** and switch on `guests`. |
| The Pages link shows a 404 | Wait a few minutes after turning Pages on. Make sure `index.html` is on the branch you selected. |

To see a more detailed error, open your browser's developer console (F12 → **Console**).

## Trying it on your computer (optional)
Open a terminal in this folder, run `python3 -m http.server`, and visit http://localhost:8000.
