# Society roles and access

This guide explains what each role is responsible for in the Mantra Manor Duplex Owners Society application. A role is assigned by the society, not chosen by the user. For personal sign-in and profile help, contact the President or Secretary.

## Membership status

- **Pending:** The member profile exists but access has not been approved. The person cannot open society records.
- **Active:** The member can sign in and use the features allowed for their role.
- **Suspended:** Access is denied. The app uses this state when a pending application is declined; it does not currently provide a workflow to suspend or reactivate an already-active member. Contact the President or Secretary if this status is unexpected.

Each member signs in with the verified Google account registered with the society. A Google sign-in alone is not enough: the email must belong to a confirmed Supabase Auth user linked to an active society profile. The login screen does not offer account creation. Contact the President or Secretary if your account is missing or your membership is pending.

## Roles

| Role | Main responsibilities | Application access |
|---|---|---|
| **Administrator** | Manages all application records, society member accounts, and role assignments; can create other Administrators. | Full access to every application module, including expenses, approvals, reports, maintenance, notices, and visitor records. Can edit member contact mobile numbers, assign roles, and provision or link Google sign-in accounts. The first Administrator is bootstrapped by an authorized Supabase project operator. |
| **President** | Leads the association, oversees governance, and gives the final approval for expenses after Treasurer review. | Society overview, members, accounts, maintenance, gate records, notices, and reports. Can add and approve members with the Secretary; can approve the second expense step, record payment after approval, and return an expense for clarification. Can view gate records but should use a Security account for visitor entry and checkout. |
| **Treasurer** | Maintains expense records and follows the financial approval and payment process. | Society overview, members, accounts, maintenance, notices, and reports; no Gate & security section. Can submit expenses, attach a supporting document to each expense, approve the first expense step, record payment after final approval, and return an expense for clarification. Cannot add or approve members or give final President approval. |
| **Secretary** | Maintains society membership records and supports resident communications and operations. | Society overview, members, accounts, maintenance, gate records, notices, and reports. Can add and approve members with the President, publish notices, and update maintenance status. Can view gate records but should use a Security account for visitor entry and checkout. |
| **Member** | Reviews society information across all application modules. | Read-only access to the overview, member directory and account list, expenses, maintenance, gate visitor log, notices, and reports. Cannot create, edit, approve, or check out records. |
| **Security** | Records visitor arrivals and departures at the gate. | Only Gate & security is available. Can register a visitor and check out an active visitor. Cannot access member details, expenses, maintenance, notices, or reports. |

### Important approval rules

- Every member needs a verified Google sign-in account linked to an active society profile. President/Secretary additions remain pending until approved; Administrator provisioning or account recovery links the Auth user and activates the profile.
- Administrators can view suspended profiles and restore access with **Activate access**. Pending or suspended members cannot sign in to the society app until they are activated.
- Active Members can view the visitor log and member account directory, but all their application access is read-only. Apply migration 009 to enforce this in Supabase as well as in the interface.
- Presidents and Secretaries use **Manage members** to add and approve accounts or edit a member's name, unit, contact email, and role. A member's linked Google Auth identity and membership status cannot be changed from that page.
- Administrators have full application access and use **Manage members** to provision a confirmed Auth user, link an existing unlinked profile, activate the member, edit mobile/contact details, and assign roles. They may create other Administrators. The server-side provisioning function must be deployed by a Supabase project operator; the service-role key is never placed in the app.
- The Administrator role is separate from President/Secretary governance, but has operational access to every application module. An Administrator cannot change their own role through the member editor.
- A member's contact email is not automatically changed as a result of editing their profile; Google sign-in uses the Auth identity already linked to their profile. Use **Set up sign-in** for an unlinked profile and make sure the email matches the member's verified Google account.
- Expense approvals are sequential: Treasurer approval, then President approval by a different account, then recording payment. A person cannot approve both stages of the same expense.
- Expense documents are stored in a private Supabase Storage bucket. Treasurers and Administrators can attach one PDF or image (up to 10 MB) to an expense; active members can view attached documents through temporary signed links.
- Expense and maintenance requests are not approvals. Submitters should attach or provide the supporting details requested by the committee.
- The database enforces permissions. A button or section appearing in the interface does not grant permission to perform an operation.
- Society roles are not the same as Supabase project-owner or technical-administrator access. Do not share Supabase dashboard credentials with ordinary members or app Administrators.

### Privacy and communication

Use the application and society-approved channels for association business. Member phone numbers, financial records, and visitor information are private. WhatsApp sharing from the application opens a prepared message for an authorized person to review and send; it does not automatically message the whole society.
