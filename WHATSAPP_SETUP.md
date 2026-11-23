# WhatsApp sharing (manual, no messaging API)

MMDOS does not send login codes, notices, or notifications through WhatsApp. Google sign-in requires no SMS or WhatsApp provider. WhatsApp features in the app only open a pre-filled message for an authorized member to review and send manually using WhatsApp.

## Send a notice or expense message

1. Open the relevant notice or expense in MMDOS.
2. Choose the WhatsApp share action. The app opens WhatsApp or WhatsApp Web with a prepared message.
3. Review the content and choose the intended recipient or group in WhatsApp.
4. Send it manually. MMDOS does not select group recipients or send messages in the background.

This flow does not require a Meta Business account, Twilio, WhatsApp Business API, a webhook, or messaging credentials in Supabase. It avoids provider/API messaging fees, but WhatsApp availability and any internet or mobile-data charges depend on the user's own service plan. The society should verify its current WhatsApp terms and policies.

## Login and account access

Login uses the member's verified Google account, which must be linked to a confirmed Supabase Auth user and active society profile. Members who cannot sign in should contact the President or Secretary to confirm their registered email and membership status.

## Cost and limitations

Manual sharing is not automated broadcast delivery. A user must choose the recipient/group, review the prepared text, and send it. Do not automate WhatsApp Web or use unofficial senders to bypass these safeguards.

The app and this guide do not guarantee that the overall service is free. Supabase and static hosting free tiers have quotas, feature restrictions, and availability limits that may change; exceeding a quota or choosing a paid option can incur charges. Check each provider's current terms and usage before deployment. MMDOS does not configure paid services.
