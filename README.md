# MMDOS Application

Mantra Manor Duplex Owners Society's responsive, installable PWA for Windows, Android, and iOS. Supabase can provide shared data and authenticated access when configured; without Supabase environment variables, the app opens in a local-only demo mode.

## Quick start

Use Node.js 20 or newer:

```powershell
npm install
npm run dev
```

Create and verify the optimized production/PWA build:

```powershell
npm run build
npm run preview
```

Run the automated test suite and coverage report:

```powershell
npm run test
npm run test:watch
npm run test:coverage
```

The unit and UI tests mock Supabase and do not send messages or validate live RLS policies. See [TESTING.md](./TESTING.md) for covered flows and the required integration checks.

See [SOCIETY_ROLES.md](./SOCIETY_ROLES.md) for member and committee permissions, and [ADMIN_OPERATIONS.md](./ADMIN_OPERATIONS.md) for frontend deployment and Supabase maintenance.

## Install on devices

Deploy the static build to an HTTPS host, then:

- **Windows:** Open the site in Edge and choose **Install this site as an app**.
- **Android:** Open the site in Chrome and choose **Install app** or **Add to Home screen**.
- **iPhone/iPad:** Open the site in Safari, tap **Share**, then **Add to Home Screen**.

The app shell is precached for offline opening. In demo mode, changes are saved only in the current browser's local storage; in configured mode, authenticated data is stored in the society's Supabase project.

To configure shared Supabase storage and Google sign-in, follow [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). Only verified Google identities linked to confirmed Supabase Auth users with active society profiles can access society data. Administrators can provision accounts from the app after the migration and secure Edge Function are deployed; the first Administrator must be bootstrapped by an authorized project operator. WhatsApp notice and expense sharing is manual, not automated; see [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md). The database migrations are included but must be applied to your own Supabase project; no Supabase credentials are included in this repository.

## Included workflows

- Society dashboard and member directory, with role-specific member administration: Administrators can provision Auth-linked accounts and assign all society roles, while Presidents/Secretaries can add pre-provisioned accounts for approval.
- Google sign-in for verified, pre-provisioned member accounts, persistent per-device sessions, and self-service profile updates when Supabase is configured.
- Role-restricted Gate & security portal for security accounts; ordinary members can view reports but cannot access visitor records.
- Expense register with a visible Treasurer → President approval flow, Treasurer-only supporting document uploads to private Supabase Storage, return-for-clarification action, and paid state.
- Expense CSV export and per-expense WhatsApp-ready sharing.
- Maintenance requests with priority and Open → In progress → Resolved tracking.
- Visitor gate register with entry and checkout tracking.
- Community notices and member-reviewed WhatsApp sharing.
- Operational summaries, category reporting, and print support.

Demo rows are illustrative and should not be used as real accounting, member, or security records. Clearing browser data removes demo changes. Do not enter real resident contact, financial, or visitor data into the local-only demo.

## WhatsApp and cost

WhatsApp sharing opens a pre-filled message for a member to review and send manually. The app does not send login codes or automated messages, and requires no messaging API/provider. Google OAuth, hosting, and database provider terms and quotas can change, so a zero-cost guarantee is not possible.

## Operational limits

Free service tiers have usage limits and no paid-plan availability guarantees. WhatsApp sharing is manual. Automated WhatsApp notices and login OTP are not implemented. Disable new Supabase Auth signups and provision confirmed user emails before access; see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). Validate role assignments, backups, retention, records, and statutory reporting with the society before relying on the app for official operations. The local demo uses this browser's storage and is not shared.
