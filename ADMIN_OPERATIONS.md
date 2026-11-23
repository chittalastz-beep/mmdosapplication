# Administrator operations guide

This guide is for the trusted technical administrator who maintains the MMDOS frontend and Supabase backend. The President and Secretary administer society membership inside the application; they are not automatically Supabase project administrators. Keep project ownership with the society and grant technical access only to people who need it.

## 1. Know which application mode is running

- **Supabase configured:** The app uses Supabase Authentication and the society's shared database.
- **Demo mode:** If either `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing, the app uses illustrative data in that browser's local storage. Demo data is not shared or backed up. Do not enter real resident, financial, or visitor data in demo mode.

Confirm the mode using the application indicator: **LIVE SUPABASE** or **DEMO DATA**.

## 2. Maintain the frontend

### Local development and checks

Use Node.js 20 or newer. From the project folder:

```powershell
npm install
npm run dev
npm run lint
npm run test
npm run build
```

Use `npm run test:coverage` when reviewing test coverage. Tests mock Supabase; they do not prove that the deployed database policies work.

### Configuration and deployment

The local `.env.local` and the hosting provider's build settings must contain the Supabase Project URL and Publishable key:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Only the publishable client key belongs in frontend configuration. **Never** put a Supabase `service_role` key, database password, or other secret in a `VITE_` variable or browser code.

Before a release:

1. Review the source changes and the corresponding database changes together.
2. Run lint, tests, and a production build; resolve failures before deployment.
3. Configure the correct public environment variables in the host's build settings.
4. Deploy the generated `dist` directory to an HTTPS static host.
5. Confirm the deployed URL and sign-in, member access, and role-specific pages in a browser.
6. If a browser still shows an old version after deployment, reload the page or close and reopen the installed PWA. Confirm the deployed build before asking members to clear stored data.

For detailed first-time Supabase connection and deployment information, see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

## 3. Maintain Supabase

### Database migrations

For initial setup, apply these files in order in the society's Supabase SQL Editor:

1. `supabase/migrations/202611210001_mmdos_database.sql`
2. `supabase/migrations/202611210002_login_activity.sql`
3. `supabase/migrations/202611210003_phone_auth_and_role_scope.sql`
4. `supabase/migrations/202611220001_member_admin_edit.sql`
5. `supabase/migrations/202611230001_google_only_auth.sql`
6. `supabase/migrations/202611230002_security_visitors_select_grant.sql`
7. `supabase/migrations/202611230003_application_administrator.sql`
8. `supabase/migrations/202611230004_admin_provisioning_service_role_grants.sql`
9. `supabase/migrations/202611230005_member_readonly_full_app.sql`

Do not rerun an already-applied migration. For future schema or policy changes, create a new, ordered migration, test it against a separate test project, review its effects, then apply it to production using the society's change-approval process. Keep a record of what was applied and when.

Row-level security (RLS) and role-checked database functions are the security boundary. Do not rely on hidden buttons or navigation as access control. After any policy or role change, test with accounts for each role, including attempts to access restricted data through the backend.

### Google sign-in

The login screen uses Google OAuth. Configure the Google provider and redirect URLs in Supabase, disable new Auth signups, and ensure each member has a confirmed Auth email before linking their society profile. The app additionally requires a verified email, Google identity, and active society membership; database policies enforce Google identity and role checks. OAuth secrets belong only in Supabase provider settings, never in the frontend.

### Member and role administration

The first Administrator must be bootstrapped by an authorized project operator using SQL after migration 007 is applied; see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). Administrators can manage society accounts and roles only. They can create other Administrators but cannot access financial, report, maintenance, notice, or visitor data.

- An Administrator opens **Manage members → Add member** to create or locate a Supabase Auth user, link its society profile, choose a role, and activate access immediately.
- A President or Secretary creates/locates and confirms the member's Google Auth email first, then adds a pending profile and approves the role through **Manage members**.
- Use **Edit** on another member row to update their name, unit, contact email, or role. The linked Google Auth identity and membership status cannot be changed through this page. An Administrator cannot edit their own role.
- Active Member accounts can read all application modules, including visitor logs and the member account directory, but cannot create or change application records. Apply migration 009; database policies and the profile-update RPC enforce this restriction independently of the interface.
- The Administrator provisioning flow uses the `admin-provision-member` Edge Function. Apply migration 007, then deploy the function and set `APP_ALLOWED_ORIGINS` as documented in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). The function verifies an active Administrator's Google session and uses server-side `SUPABASE_SERVICE_ROLE_KEY`; never put that key in frontend code, `VITE_` variables, or logs. Keep function JWT verification enabled.
- Have the member sign in with the same verified Google account on their own device and confirm their expected access.

Changes to Auth accounts, society roles, or membership records made directly in Supabase bypass the normal application workflow and should be restricted to an authorized operator, reviewed, and recorded. Never edit production records just to test a feature.

## 4. Routine operations and safeguards

- Maintain society-controlled access to the hosting account and Supabase project. Use individual administrator accounts and enable available account-protection features.
- Review membership and role assignments with the association when office holders or security personnel change.
- Configure and periodically test database backups and a restore procedure in Supabase. Backup availability and retention depend on the selected Supabase plan.
- Review Supabase and hosting quotas and current plan terms. Free tiers may change, and exceeding limits or selecting a paid option can incur charges.
- Keep a separate test project and test accounts. Do not use real member, financial, or visitor records in test runs.
- Follow the society's retention and privacy policies for membership, financial, and visitor records. The application does not set those policies for the society.
- WhatsApp expense and notice sharing is manual: a member must review and send the prepared message. It is not automated broadcast delivery.

## 5. Troubleshooting checklist

| Symptom | Checks |
|---|---|
| App shows **DEMO DATA** | Check both public environment variables in the hosting build configuration, rebuild, and redeploy. Never solve this by adding a service-role key to the frontend. |
| Google sign-in fails | Check that the Google provider, OAuth client credentials, callback URI, and Supabase redirect URLs are correct; confirm the Auth email and Google email match and are verified. |
| Google sign-in succeeds but society data cannot load | Confirm the Auth user is linked to an active `society_members` profile and has an approved role; review the displayed error and RLS/migration state. |
| Administrator cannot provision an account | Confirm migrations 007 and 008 are applied, the deployed `admin-provision-member` function has JWT verification enabled, `APP_ALLOWED_ORIGINS` exactly matches the app origin, and the caller has an active Administrator profile. |
| `permission denied for table society_members` in the provisioning function | Apply migration 008 to grant `service_role` the required member-table privileges. Do not grant those privileges to `anon` or `authenticated`. |
| A user cannot open a section | Verify the active membership status and assigned role. Check the expected permissions in [SOCIETY_ROLES.md](./SOCIETY_ROLES.md); do not broaden RLS just to make a UI control work. |
| A deployed change is not visible | Confirm the latest build was deployed to the correct site and environment, then reload or reopen the PWA. Verify its displayed mode and deployed version. |

For live Supabase, RLS, WhatsApp, and device checks, follow the manual integration checklist in [TESTING.md](./TESTING.md). The automated suite does not exercise production services.
