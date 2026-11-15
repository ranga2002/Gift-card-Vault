# Coupon & Gift Vault

Track gift card balances, promo coupons, expiry reminders, and shared team/family access—hosted online 24/7 with **Supabase Auth + Postgres RLS** and **GitHub Pages / Firebase Hosting**.

## 1. Set Up Supabase Backend (Once)
1. Create a free project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** in your Supabase project, paste the entire contents of `supabase/SETUP_ALL_IN_ONE.sql`, and click **Run**.
   - Enables Row-Level Security (RLS) on `profiles`, `invited_accounts`, `coupons`, `coupon_secrets`, and `activity_logs`.
   - Allows only the **very first** registered user to become `super_admin`; all subsequent signups are strictly invite-only.
3. In Supabase **Authentication → Providers → Email**, decide whether to keep **Confirm email** enabled or disabled (disabling it lets invited friends sign in immediately upon setting their password).
4. In Supabase **Authentication → URL Configuration**, add your hosted URL (e.g., `https://<username>.github.io/<repo>/` or `http://localhost:8787`) to **Site URL** and **Redirect URLs**.
5. Open `assets/supabase-config.js` and fill in your **Project URL** and **Publishable / anon key** (from Supabase **Project Settings → API**). *(Never put your `service_role` key in frontend code.)*

## 2. Host Online 24/7 via GitHub
1. Push this repository to GitHub (`main` branch).
2. Enable **GitHub Pages** in **Settings → Pages → Source: GitHub Actions** (`.github/workflows/deploy-pages.yml` automatically deploys `./assets`).
   - *Note:* On a free GitHub account, GitHub Pages requires a public repo (safe because all sensitive vault data & keys stay in Supabase, not GitHub). If you want the GitHub repo to remain **private** on a free account, deploy `./assets` to **Firebase Hosting** (`firebase.json` is already configured) or Cloudflare Pages/Netlify instead.

## 3. First Sign-In & Migrating Local Data
1. Open your hosted URL and click **First-time Super Admin setup** to create your owner account.
2. Open **Logger → ⬆️ Import JSON** and select `cloud_vault_state.json` (or any backup file) to import existing coupons into Supabase.
3. Use **👑 Accounts & Access** to invite friends by email and control who can view balances vs. secret coupon codes.

