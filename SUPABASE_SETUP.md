# Connect MMDOS to Supabase

This guide walks a society technical administrator through connecting MMDOS to Supabase and Google OAuth. Only verified Google accounts linked to confirmed Supabase Auth users and active society profiles can access society data. Without Supabase configuration, the app runs in local-only demo mode.

## Before you begin

You will need:

- The MMDOS project files and Node.js 20 or newer.
- A Supabase project owned by the society.
- A Google Cloud project and an administrator authorized to configure Google OAuth, Supabase Authentication, and the database.

Keep Supabase and Google administrator access private. Never place a database password, Supabase `service_role` key, or Google OAuth client secret in the browser app.

## 1. Create a Supabase project

1. Sign in to Supabase and create a project for Mantra Manor Duplex Owners Society.
2. Keep the project under society-controlled ownership and store its database password in an approved password manager.
3. In the project settings, note the **Project URL** and **Publishable key**. A legacy `anon` key may be used if the project does not show a Publishable key. Both values are public client configuration; do not use a secret or `service_role` key.

Use free tiers for Supabase and static hosting, and do not enable paid add-ons or upgrade plans. Their quotas, features, and availability can change; a free-tier plan cannot guarantee that the complete service will always remain free. Monitor usage and honor current limits.

## 2. Create the database schema

In the Supabase project, open **SQL Editor**. For a new project, run each migration's complete contents in this order, one file at a time:

1. `supabase/migrations/202611210001_mmdos_database.sql`
2. `supabase/migrations/202611210002_login_activity.sql`
3. `supabase/migrations/202611210003_phone_auth_and_role_scope.sql`
4. `supabase/migrations/202611220001_member_admin_edit.sql`
5. `supabase/migrations/202611230001_google_only_auth.sql`
6. `supabase/migrations/202611230002_security_visitors_select_grant.sql`
7. `supabase/migrations/202611230003_application_administrator.sql`
8. `supabase/migrations/202611230004_admin_provisioning_service_role_grants.sql`
9. `supabase/migrations/202611230005_member_readonly_full_app.sql`
10. `supabase/migrations/202611230006_expense_documents.sql`

Wait for each migration to finish successfully before running the next. The migrations create the society tables, row-level security (RLS) policies, and role-checked functions used by the app. Migration 004 enables President/Secretary member profile and role editing. Migration 005 restricts database access to Google-authenticated users and links new member profiles to confirmed Auth emails. Migration 006 grants authenticated sessions the table privilege needed to query visitor records; RLS continues to restrict which rows are returned.

Migration 007 adds the Administrator role, authorizes Administrators to manage society member roles, and restricts Auth-user lookup to the server-side provisioning function. Migration 008 grants the server-side `service_role` only the `SELECT`, `INSERT`, and `UPDATE` privileges it needs on `society_members`. Migration 009 gives active Members read-only access to all application modules, including visitor logs, and removes their ability to create or update records. Migration 010 creates a private expense-document bucket, limits uploads to Treasurers, and allows active members to view attached files through short-lived signed links. Apply only migrations that have not already run, in ascending order; do not rerun completed migrations. Migration 002 can be run whether or not login-activity additions were already included in migration 001. Record which migration files have been applied.

The app does not apply migrations automatically. The SQL files in the repository have not been applied to your Supabase project by this setup guide.

## 3. Configure Google sign-in

1. In Google Cloud Console, configure the OAuth consent screen and create a **Web application** OAuth client.
2. Add the app origins to **Authorized JavaScript origins** (for example, `http://localhost:5173` or the actual local Vite origin such as `http://127.0.0.1:5174`, plus the production HTTPS site).
3. Add this URI to **Authorized redirect URIs**: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
4. In Supabase, open **Authentication → Providers → Google**, enable Google, and enter the Google client ID and client secret. Keep the secret in Supabase only.
5. In **Authentication → URL Configuration**, set the production **Site URL** and add the local and production app origins to the allowed redirect URLs. MMDOS returns to the origin from which the user started sign-in.
6. In Supabase Auth settings, turn off **Allow new users to sign up**. Provision each person as an Auth user with a confirmed email before they use the app. Supabase can link a verified Google identity to the existing Auth user with the same verified email.

The app also checks that the signed-in Supabase session has a verified email and Google identity, and society data is available only to an active member profile linked to that Auth user. A Google account without a pre-provisioned Auth user/profile cannot access society records.

## 4. Bootstrap the first Administrator

The database migrations do not create the first society Administrator. After applying all migrations, create an Auth user for a trusted society representative with the verified Google email they will use. Copy the Auth user's UUID. If the dashboard requires a password to create the account, use a unique temporary password; Google is the app's sign-in method.

In **SQL Editor**, insert the active Administrator profile, replacing every example value:

```sql
insert into public.society_members
  (user_id, full_name, unit_name, email, phone, role, status)
values
  ('AUTH_USER_UUID', 'Administrator name', 'A-01', 'admin@example.com', '+919876543210', 'administrator', 'active');
```

This one-time SQL bootstrap is required because no in-app Administrator exists yet. The Administrator can then create other Administrators and assign society roles through **Manage members**. This role is deliberately limited to managing accounts and roles; it does not grant access to reports, expenses, maintenance, notices, or visitor records. Use the same SQL pattern with role `president` only if you are separately bootstrapping a first President.

## 5. Configure the frontend

From the MMDOS project directory, create the local environment file:

```powershell
Copy-Item .env.example .env.local
```

Set the Project URL and Publishable key obtained in step 1:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Do not commit `.env.local` or add any secret key to a `VITE_` variable. Vite embeds `VITE_` values into the frontend bundle, where visitors can inspect them.

Install dependencies and start the development server:

```powershell
npm install
npm run dev
```

When both variables are present, the app connects to Supabase. Confirm the application header shows **LIVE SUPABASE**. If it shows **DEMO DATA**, check the variable names/values, restart Vite, and reload the app. Demo mode stores changes only in that browser's local storage; it is not shared and must not be used for real society data.

## 6. Deploy the Administrator provisioning function

The app must not contain a service-role key. This Edge Function verifies the caller's Supabase session and active Administrator role on the server, then uses Supabase's server-side Auth Admin API to create or locate the Auth user and link an active society profile.

The function source is [supabase/functions/admin-provision-member/index.ts](./supabase/functions/admin-provision-member/index.ts). Its JWT verification is explicitly enabled in [supabase/config.toml](./supabase/config.toml). From the project directory, install the CLI as a development tool (one time), authenticate/link it to the society's project, configure the exact app origins, and deploy:

```powershell
npm install --save-dev supabase
npx supabase --version
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set APP_ALLOWED_ORIGINS="http://127.0.0.1:5174,https://YOUR_PRODUCTION_ORIGIN"
npx supabase functions deploy admin-provision-member
```

Replace `YOUR_PROJECT_REF` with the project ref in your `VITE_SUPABASE_URL` (the value between `https://` and `.supabase.co`). Replace `YOUR_PRODUCTION_ORIGIN` with the deployed app's origin. Origins must match exactly and have no trailing slash; include local origins only if local development needs the deployed function. Supabase supplies `SUPABASE_URL` and the legacy `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; never copy the service-role key into the frontend or expose it in logs. Keep the function's JWT verification enabled; do not deploy it with `--no-verify-jwt`.

Confirm that `admin-provision-member` appears in the Supabase Dashboard under **Edge Functions**. An **HTTP 404 / Requested function was not found** means the function was not deployed to this project or the app is using a different project ref. See the troubleshooting section below for an `OPTIONS` preflight check.

## 7. Add members and grant access

- **Administrator:** Open **Manage members → Add member**, enter the member's name, duplex unit, Google sign-in email, and optional contact phone, then choose a role. The server creates or links the Supabase Auth user and activates the profile immediately. Carefully verify the email spelling. The person must sign in with the matching verified Google account.
- **President or Secretary:** Create and confirm the member's Auth user in Supabase **Authentication → Users** first. Then add the member through **Manage members**. The profile remains **Pending** until an authorized committee member selects a role and chooses **Approve**.

An existing profile already linked to a different Auth user cannot be reassigned in this flow. Use **Edit** to update another member's name, unit, contact email, or role; the contact email does not change the Google Auth email. A member's linked Auth identity and membership status cannot be edited there, and an Administrator cannot edit their own role.

Pending members cannot access society records. Active `Member` accounts can view every application module, including visitor logs and the member account directory, but cannot create, edit, approve, or check out records. Apply migration 009 to enforce these read-only permissions in the database. Assign Security personnel the `Security` role; the app then limits their navigation to Gate & security.

## 8. Configure the deployed app

Build the production PWA:

```powershell
npm run lint
npm run test
npm run build
```

Deploy the generated `dist` directory to an HTTPS static host that offers a free tier. Keep it on the free plan and do not enable paid add-ons. Add the same two public environment variables to the host's build configuration, rebuild, and deploy. In Supabase **Authentication → URL Configuration**, set the production site URL and allowed redirect URL(s) to match the deployed origin.

After deployment, verify sign-in, member access, role-specific navigation, and the management page with test accounts. Sessions are persisted per browser/PWA installation and do not transfer between devices.

## 9. Security and operational checks

- RLS and role-checked database functions enforce authorization; the frontend's hidden navigation is not a security boundary.
- Test unauthorized data access with separate accounts for Member, Treasurer, Secretary, President, and Security. Confirm Security accounts cannot read society reports or financial/member data.
- Configure and test Supabase backups and a restore process. Availability and retention depend on the selected plan.
- Review Supabase, Google, and hosting quotas and current plan terms. The app does not use a messaging provider for login or automated messages.
- Keep separate test and production projects. Never use real member, financial, or visitor data in tests.
- WhatsApp sharing of notices and expenses opens a prepared message for a person to review and send. No messaging API, automated delivery, or OTP is configured; see [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md).

## Troubleshoot: Edge Function request failed

If member provisioning reports **Failed to send a request to the Edge Function**, the browser could not complete its request. Check that the app's `VITE_SUPABASE_URL` points to the same project where the function was deployed, and confirm the function name is exactly `admin-provision-member`.

A preflight check can distinguish a missing deployment from an application-level error. Replace the project ref and origin with your values:

```powershell
curl.exe -i -X OPTIONS "https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-provision-member" `
  -H "Origin: http://127.0.0.1:5174" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: authorization, apikey, content-type, x-client-info"
```

- **404 `Requested function was not found`:** Deploy the function to this project from the application directory: `supabase functions deploy admin-provision-member`.
- **403 or a browser CORS error:** Set `APP_ALLOWED_ORIGINS` to a comma-separated list containing the app's exact origins, without trailing slashes. For this local Vite origin, include `http://127.0.0.1:5174`; production must use its own exact HTTPS origin. Then repeat the preflight check.
- **Preflight succeeds but provisioning fails:** Check the Edge Function logs in Supabase. Confirm migration 007 is applied and the caller is an active Administrator. Keep function JWT verification enabled; do not test by disabling authentication or exposing the service-role key.
- **`Could not verify administrator access: permission denied for table society_members`:** Apply migration 008 in the Supabase SQL Editor. It grants the function's server-side `service_role` the required table privileges; do not grant them to `anon` or `authenticated`. Then retry provisioning.
- **`This unit already has a society profile`:** Each unit can have only one society profile. Open **Manage members** and update the existing profile rather than adding a second one.

A successful preflight should return HTTP 200 and `Access-Control-Allow-Origin` matching the requested origin. Do not share access tokens or service-role credentials when requesting help.

## Troubleshoot: account not linked

If Google sign-in succeeds but MMDOS says the account is not linked, the Google Auth user ID does not have a matching `society_members.user_id` row. In the Supabase SQL Editor, check the Auth account and society profile using the exact Google email:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('GOOGLE_EMAIL');

select id, user_id, full_name, email, role, status
from public.society_members
where lower(email) = lower('GOOGLE_EMAIL');
```

The Auth email must be confirmed. If there is no profile row, an Administrator can provision it; a President or Secretary can add it as pending after the Auth user is created. For the first Administrator, follow section 4 above. If the correct profile row exists but `user_id` is null, an authorized Supabase project operator can link it after verifying the email and Auth UUID:

```sql
update public.society_members
set user_id = 'AUTH_USER_UUID'
where id = 'MEMBER_ROW_UUID'
  and user_id is null
  and lower(email) = lower('GOOGLE_EMAIL');
```

If the profile already has a different `user_id`, do not overwrite it blindly: existing expenses and audit records may refer to that Auth ID. Check that the Google email was added and confirmed on the existing Supabase Auth account so Google identity linking uses that same account. Membership must also be active before society data is available.

See [TESTING.md](./TESTING.md) for the automated test scope and manual integration checklist, and [ADMIN_OPERATIONS.md](./ADMIN_OPERATIONS.md) for ongoing frontend/backend maintenance.
