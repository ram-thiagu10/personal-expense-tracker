# Homeflow — Household Expense Tracker

Homeflow has two ways to run:

- **Local** — `app.py` uses a SQLite database on one computer.
- **Hosted and shared** — the root `index.html` is a GitHub Pages-ready frontend using Supabase authentication and database storage. This is the recommended version for you and your wife to use on multiple devices.

## Deploy the shared version: step by step

### 1. Create the Supabase project

1. Create an account at [Supabase](https://supabase.com/dashboard) and select **New project**.
2. Choose a strong database password, a nearby region, and wait for the project to finish setting up.
3. Open **SQL Editor** → **New query**.
4. Paste all of [`supabase/schema.sql`](supabase/schema.sql), then choose **Run**. This creates the secured tables, household invitation functions, and row-level access rules.
5. Open **Authentication** → **Providers** → **Email**. Email/password sign-in can remain enabled. For the simplest first test, turn off **Confirm email**; otherwise each person must confirm their signup email before signing in.
6. Open **Project Settings** → **API**. Copy the **Project URL** and the **Publishable / anon key**. Do not use the secret `service_role` key.

### 2. Configure this app

1. Open [`config.js`](config.js).
2. Replace the two placeholder values with the Project URL and Publishable/anon key from the prior step.
3. Save the file. These two values are designed to be used in a browser; the database security rules in the SQL file protect the actual records.

### 3. Publish on GitHub Pages

1. Create a GitHub repository and upload this project. A private Pages repository requires a plan that supports it; a public repository is also acceptable because it contains only the frontend and the browser-safe publishable key. Do not upload a real `expense_tracker.db`; it is intentionally ignored.
2. In the repository, choose **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and the **/(root)** folder, then save.
4. Wait for the deployment link GitHub shows, then open it. GitHub Pages only publishes static files, which is why this version uses Supabase rather than the local Python/SQLite server. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
5. In Supabase, open **Authentication** → **URL Configuration**. Set **Site URL** to the GitHub Pages address. Add both that address and `http://localhost:8000` to **Redirect URLs** if email confirmation is enabled.

### 4. Set up your shared household

1. On the published app, create an account and sign in.
2. Choose **Create household**, enter a household name and your display name.
3. The app displays an eight-character invite code. Send that code privately to your wife.
4. She opens the same site, creates her own account, signs in, selects **Join with invite code**, and enters the code plus her display name.

From then on, records, categories, edits, and deletions sync to both devices. The app does not expose household data to anyone who has not signed in and joined that household.

### If you created the database before the membership-loading update

Run [`supabase/fix-membership-loading.sql`](supabase/fix-membership-loading.sql) once in Supabase SQL Editor, then redeploy the updated static files. It adds the secure lookup used to open the existing household after sign-in.

If a household was already created but the creator is repeatedly offered Create/Join after signing in, run [`supabase/repair-existing-household.sql`](supabase/repair-existing-household.sql) instead. It safely restores the creator membership and replaces the signed-in household lookup.

## Local version

For an offline, one-computer copy, run:

```sh
python3 app.py
```

Then visit http://localhost:8000. Data is stored in `expense_tracker.db` locally and does not sync to Supabase.
