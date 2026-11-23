# MMDOS Application setup

This application uses React, TypeScript, Vite, `@supabase/supabase-js`, and a Supabase PostgreSQL database. The front end can run locally without credentials in demo mode. Configure Supabase to enable account sign-in and shared society records.

For a step-by-step Supabase project, database, Google OAuth, and member onboarding guide, see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). For manual WhatsApp sharing details, see [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md).

## 1. Create a Supabase project

Create a project in the society's Supabase account. The free tier may be sufficient for a small society, but quotas and availability are controlled by Supabase and can change. Keep the project under the society's ownership and use a strong, unique database password.

## 2. Create the database

In the Supabase project, open **SQL Editor** and run the complete contents of these migration files in order:

- `supabase/migrations/202611210001_mmdos_database.sql`
- `supabase/migrations/202611210002_login_activity.sql`
- `supabase/migrations/202611210003_phone_auth_and_role_scope.sql`
- `supabase/migrations/202611220001_member_admin_edit.sql`
- `supabase/migrations/202611230001_google_only_auth.sql`
- `supabase/migrations/202611230002_security_visitors_select_grant.sql`
- `supabase/migrations/202611230003_application_administrator.sql`
- `supabase/migrations/202611230004_admin_provisioning_service_role_grants.sql`
- `supabase/migrations/202611230005_member_readonly_full_app.sql`

Migration `003` adds phone-based member linking and role-specific access. Migration `004` enables President/Secretary member profile and role editing. Migration `005` restricts database access to Google-authenticated sessions and links new member profiles to confirmed Auth emails. Migration `006` grants authenticated sessions the table privilege needed to query visitor records; RLS still filters rows by role. Migration `007` adds the limited Administrator role and server-side Auth provisioning. Migration `008` grants the function's server-side `service_role` limited access to society member profiles. Migration `009` makes active Member accounts read-only across all application modules, including visitor logs. Apply migrations in order. If migrations `001`–`008` are already applied, run only `009`; if `001`–`007` are applied, run `008` then `009`. Do not rerun an already-applied migration. Migration `002` is safe to run whether `001` already contains its login activity additions or not. Do not expose a database password or service-role key in the browser app.

## 3. Bootstrap the first Administrator

The migration intentionally does not create the first society Administrator. Configure Google OAuth as described in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md), then create a trusted representative's Auth user with their verified Google email:

1. In Supabase, open **Authentication → Users** and create/confirm the representative's Auth user. Copy the user's UUID.
2. In **SQL Editor**, insert the matching active Administrator profile. Replace each example value, including the UUID:

```sql
insert into public.society_members
  (user_id, full_name, unit_name, email, phone, role, status)
values
  ('AUTH_USER_UUID', 'Administrator name', 'A-01', 'admin@example.com', '+919876543210', 'administrator', 'active');
```

This initial account must be bootstrapped outside the app because no Administrator exists to authorize it. Administrators can create other Administrators and assign society roles, but cannot access financial, report, maintenance, notice, or visitor data.

## 4. Add, edit, and approve members

An Administrator can open **Manage members → Add member**, enter the member's verified Google email, select a role, and create/link an active Auth and society profile. The server-side function must be deployed first; follow [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) to deploy it safely without exposing the service-role key.

Alternatively, a President or Secretary can add a member who already has a confirmed Auth user. That profile remains pending until the role is selected and approved. Pending users cannot access society records. Assign security personnel the `Security` role; they receive the separate Gate & security-only app experience.

## 5. Configure the web app

From the project directory, create a local environment file:

```powershell
Copy-Item .env.example .env.local
```

Set values in `.env.local` using the Supabase project's **Project URL** and **Publishable key** (the legacy `anon` key is also a client key if your project only displays that name):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Never put the `service_role` key, database password, or other secret in any `VITE_` variable. These variables are bundled into the browser application.

Install dependencies and run:

```powershell
npm install
npm run dev
```

Without both environment values, the application deliberately displays the local demo. With Supabase configured, the login button redirects to Google. New Supabase Auth signups must be disabled; user emails must be confirmed before access. Supabase Auth persists the session in that browser/PWA installation; sign in once on each device. The app records the last sign-in time/platform and a login event in the database; it stores only a platform label, not a device identifier or IP address.

## 6. Build and deploy

Run `npm run build` to create the production PWA in `dist`. Deploy the static `dist` output to an HTTPS static host. Configure the same two public environment variables in the host's build settings, and add the deployed origin to Supabase **Authentication → URL Configuration** and Google OAuth **Authorized JavaScript origins**.

Install the deployed PWA from the browser on Windows, Android, or iOS. For local testing on a phone, use a development server address reachable on the same network; browser install prompts generally require HTTPS except for localhost.

## Data access and limits

- Database access is protected by PostgreSQL row-level security and role-checked functions. UI visibility is not the security boundary.
- Active members can read reports and edit their own name/contact email. Their Google Auth identity, unit, role, and membership status are controlled by the society.
- Security accounts are limited by both the app and RLS to their own profile and Gate & security visitor workflows; they cannot access member reports, expenses, notices, or maintenance records.
- Expense approvals are sequential: Treasurer approval, President approval by a different account, then payment recording.
- The database records expense status changes in an audit table. Society members with active access can view expenses and that audit data.
- Visitor records are limited to authorized committee/security roles by the database policies.
- WhatsApp sharing of notices and expenses opens a message draft for manual review and sending. Login OTP and automated message delivery are not implemented; no WhatsApp API credentials are required.
- The app does not configure backups, legal retention, messaging delivery, accounting integrations, or society-specific reporting requirements. Set up and test backups in Supabase before relying on the data.
- Do not use local demo mode for real member, financial, or visitor data. The demo is stored only in that browser's local storage.

The migration is provided for the society to apply to its own project. It has not been applied to a live Supabase project by this repository.
