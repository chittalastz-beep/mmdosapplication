# Testing MMDOS

## Run automated tests

From the project directory:

```powershell
npm run test
npm run test:watch
npm run test:coverage
```

`npm run test` runs the Vitest suite once. The watch command reruns it as files change. Coverage reports are generated with V8 in the terminal and under `coverage/`.

## Automated coverage

The tests run in jsdom and mock Supabase, so they do not need project credentials, a messaging provider, or real resident data. The current suite checks:

- Google OAuth initiation with the application-origin redirect.
- Blocking unverified or non-Google sessions and persisted-session restoration.
- Member access to reports, profile editing, Administrator-only navigation, and role-based navigation for security accounts.
- Administrator provisioning request mapping and backend error reporting.
- Treasurer-only document attachment UI and document upload validation, storage linking, cleanup, signed-link generation, and backend error propagation.
- Society-data mapping, RPC argument mapping, unlinked-account handling, and backend error propagation.

## Integration checks not covered by the automated suite

Run these against a dedicated Supabase test project before deploying. Do not use production member, financial, or visitor records for test data.

1. Apply every migration in `supabase/migrations/` to the test project and verify the schema and RLS policies.
2. Configure Google OAuth, disable new Supabase Auth signups, bootstrap the first Administrator using the setup guide, and deploy `admin-provision-member` with JWT verification enabled and an exact `APP_ALLOWED_ORIGINS` allowlist.
3. Verify that only an active Administrator's confirmed Google session can provision a user. Test a new Auth user, an existing confirmed Auth user, a pre-existing unlinked society profile, duplicate/linked email, invalid role, and missing/invalid caller session. Confirm the user can sign in with the matching verified Google identity and that failed profile writes do not leave a newly created Auth account behind.
4. Check authenticated member, committee, Administrator, and Security accounts against expected RLS permissions. Confirm active Members can read all module data, including visitors, and cannot insert/update records or call the profile-update RPC successfully; confirm Administrator can read/manage eligible member profiles but cannot read expenses, reports, notices, maintenance, or visitor data through direct API calls; confirm Security users cannot read reports, expenses, notices, maintenance, or member records.
5. As President and Secretary test the **Manage members** page: add a profile for a pre-provisioned confirmed Auth email, approve it with the intended role, and edit another member's name, unit, contact email, and role. Confirm the linked Auth identity and membership status cannot be changed there.
6. Attempt member edits as a regular Member and a Security user, including direct calls to the member-update RPC; confirm the database rejects them. Confirm President/Secretary cannot assign the Administrator role and an Administrator cannot change their own role.
7. Verify expense approval stages, maintenance updates, visitor checkout, and login-activity recording through the deployed RPCs. Confirm only a Treasurer can upload and link a PDF, JPEG, PNG, or WebP expense document (up to 10 MB), and active members can view only documents attached to visible expenses. Confirm unauthenticated users cannot read the private bucket.
8. Test sign-in persistence and sign-out on the supported Windows, Android, and iOS browsers/PWA installations.

Live Google OAuth, Supabase RLS enforcement, manual WhatsApp sharing, cross-device behavior, and operating-system installation are not exercised by `npm run test`; configure and verify them separately. Free-tier Supabase and hosting quotas may change.
