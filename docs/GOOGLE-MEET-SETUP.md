# Google Calendar and Meet Setup

Last updated: 2026-08-27

This guide configures the server to create Google Calendar events with Google Meet links when a tutor accepts an online booking. The integration uses the Google Calendar API v3; it does not call a separate Google Meet API.

## Which setup to use

Use the OAuth refresh-token setup when the calendar belongs to a normal Gmail account or to a Google account without Workspace admin access. This is the recommended setup for local development and the current Cogito demo environment.

Use the service-account setup only when a Google Workspace administrator can configure domain-wide delegation. A service account without `GOOGLE_IMPERSONATED_USER` is not a valid Cogito configuration.

The OAuth client used for Meet may be separate from the client used for Sign in with Google. A separate client is recommended so Calendar consent and login consent can be managed independently. The Sign in with Google provider forces `prompt=consent` so its identity permission screen is visible for verification evidence, but it intentionally does not request the broad Calendar scope from every user. If the dedicated Meet client variables are empty, the backend falls back to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for the OAuth client credentials, but it still requires a separate Calendar refresh token.

## OAuth refresh-token setup

### 1. Enable the Calendar API

In [Google Cloud Console](https://console.cloud.google.com/):

1. Select the project that owns the OAuth client, or create a project for Cogito.
2. Open **APIs & Services -> Library**.
3. Search for **Google Calendar API** and click **Enable**.
4. A separate Google Meet API is not required for this implementation.

### 2. Configure the consent screen

Open **APIs & Services -> OAuth consent screen**.

1. Configure the app name and support email.
2. For a personal Gmail account, use **External** unless the project is inside a Workspace organization where **Internal** is available.
3. Add the Google account that owns the Cogito calendar under **Test users**. This must be the account used in OAuth Playground, not necessarily the account used to sign in to Cogito.
4. Under the consent screen's **Data access** (or **Scopes**) section, add this scope:

   ```text
   https://www.googleapis.com/auth/calendar
   ```

   This broad Calendar scope covers the provider's startup calendar-list probe and event create, update, and delete operations. `https://www.googleapis.com/auth/calendar.events` covers event operations, but is not sufficient for every calendar-list authorization check used by the probe.

### 3. Create the OAuth client

Open **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**.

1. Choose **Web application**.
2. Give it a recognizable name, for example `Cogito Meet OAuth Playground`.
3. Under **Authorized redirect URIs**, add this exact URI:

   ```text
   https://developers.google.com/oauthplayground
   ```

4. Create the client and keep its client ID and client secret private.

The redirect URI must match exactly, including `https`, host, path, and trailing slash. Do not use `urn:ietf:wg:oauth:2.0:oob`; Google's out-of-band flow is deprecated. Localhost redirect URIs are not needed for the OAuth Playground flow.

### 4. Generate a refresh token in OAuth Playground

Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).

1. Click the gear icon in the top-right.
2. Check **Use your own OAuth credentials**.
3. Paste the same OAuth client ID and client secret created in the previous step.
4. Keep **OAuth flow: Server-side**, **OAuth endpoints: Google**, and **Access type: Offline**.
5. Set **Force prompt** to **Consent Screen** when generating a new token.
6. Close the settings panel.
7. In **Step 1**, select **Google Calendar API v3** and select the Calendar scope, or enter this scope manually:

   ```text
   https://www.googleapis.com/auth/calendar
   ```

8. Click **Authorize APIs** and sign in with the calendar-owner account added as a consent-screen test user.
9. Accept the consent screen. If Google shows the unverified-app warning, continue only because this is the project and test account you control.
10. In **Step 2**, click **Exchange authorization code for tokens**.
11. Copy the `refresh_token` from the response. Do not use the short-lived `access_token` as the server secret.

If the response does not include a new refresh token, revoke the existing OAuth grant for this client from the Google account's third-party access settings, then repeat Steps 7-10 with **Force prompt: Consent Screen**. A refresh token is bound to the OAuth client and authorization grant; do not mix a code or token generated with one client with another client's secret.

### Optional: create a dedicated calendar

Using `primary` is the quickest setup. For a cleaner demo or production calendar:

1. Open [Google Calendar](https://calendar.google.com/) as the OAuth account.
2. In **Other calendars**, click **+ -> Create new calendar**.
3. Name it `Cogito Sessions`, choose the intended timezone, and create it.
4. Open the calendar's **Settings and sharing -> Integrate calendar**.
5. Copy the **Calendar ID**. Use the ID, not the display name, in `GOOGLE_CALENDAR_ID`.
6. Make sure the OAuth account has permission to make changes to events on that calendar.

For a secondary calendar, the value normally looks like a long address ending in `@group.calendar.google.com`. Keep `GOOGLE_CALENDAR_ID=primary` if you want events on the account's primary calendar.

### 5. Set the server environment

Put these values in `apps/server/.env` for local development. This file is ignored by git and must never be committed or pasted into an issue, chat, screenshot, or frontend environment.

```dotenv
GOOGLE_MEET_ENABLED=true
GOOGLE_CALENDAR_ID=primary
GOOGLE_MEET_CLIENT_ID=your-meet-oauth-client-id.apps.googleusercontent.com
GOOGLE_MEET_CLIENT_SECRET=your-meet-oauth-client-secret
GOOGLE_MEET_REFRESH_TOKEN=your-calendar-refresh-token
```

`primary` means the primary calendar of the Google account that authorized the refresh token. To use a secondary or shared calendar, replace it with the calendar ID visible in Google Calendar settings or returned by the Calendar API. The OAuth account must have permission to create and edit events on that calendar.

Do not fill the service-account variables for this mode:

```dotenv
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_IMPERSONATED_USER=
```

If the same OAuth client is intentionally used for both Google login and Meet, leave the dedicated `GOOGLE_MEET_CLIENT_ID` and `GOOGLE_MEET_CLIENT_SECRET` blank and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` instead. The refresh token still belongs in `GOOGLE_MEET_REFRESH_TOKEN`.

### 6. Restart and verify the server

Restart the API after changing `apps/server/.env`; the environment is read at process startup.

```bash
bun run dev:server
```

With `GOOGLE_MEET_ENABLED=true`, look in the server log for:

```text
google_meet_probe_ok
```

The probe calls the Calendar API during startup. A failed probe is logged as `google_meet_probe_failed` or `google_meet_boot_probe_failed`; the server continues with the manual/fallback provider so local development can continue, but online bookings will not reliably receive an automatic Meet link until the credential is fixed.

Then run the booking smoke test:

1. Create or use a future online booking as a student.
2. Sign in as the assigned tutor.
3. Accept the booking.
4. Confirm the booking becomes `scheduled` and the booking detail shows a `https://meet.google.com/...` link.
5. Open Google Calendar as the OAuth account and confirm the event has the Cogito booking title, correct 90-minute window, attendees, and Meet conference.

If the provider fails during acceptance, the booking intentionally remains `confirmed` with meeting-setup attention. The `retry-failed-meetings` scheduler can retry failed attempts every five minutes when the scheduler is enabled; it does not repair a revoked credential until the environment is corrected and the server is restarted.

Automatic Meet setup is not a hard dependency for completing an online booking. If the link is still missing after the retry window, the assigned tutor can open the booking detail and use **Add meeting link** for their own `confirmed`/`scheduled` booking. An admin can add or replace the link from `/admin` for an eligible online booking. The link is validated as an `http`/`https` URL and is written to the active meeting-attempt row so the student detail becomes ready.

## Production notes

OAuth Playground is a provisioning tool, not part of the production request path. With the current Cogito implementation, an operator can use it once to authorize the calendar-owner account and obtain the refresh token; production then stores that token on the API server and refreshes short-lived access tokens directly with Google.

For production:

1. Use a separate Google Cloud project and OAuth client from local development.
2. Set the consent screen publishing status to **In production**. A project left in **Testing** issues Calendar refresh tokens that expire after 7 days.
3. Complete Google's branding, domain, and app-verification requirements if the production project requests sensitive Calendar scopes for external users.
4. Generate a new refresh token using the production OAuth client and the production calendar-owner account. Do not promote a local/test refresh token to production.
5. Store `GOOGLE_MEET_CLIENT_SECRET` and `GOOGLE_MEET_REFRESH_TOKEN` in Coolify's server secrets or another secret manager. Do not put them in Cloudflare Pages, `apps/web`, git, or CI logs.
6. Run the startup probe and one real future online booking before enabling customer traffic.

The current app has no admin-facing OAuth callback for connecting a calendar. Therefore, Playground is the practical one-time bootstrap for this env-based integration. A future multi-tenant production design should add an admin-only OAuth callback on a Cogito-owned HTTPS domain and store encrypted per-calendar credentials instead of keeping one operator token in process environment variables.

## Service-account setup

This path requires Google Workspace admin access and domain-wide delegation. It is not suitable for a normal Gmail account.

Set all of the following on the API server:

```dotenv
GOOGLE_MEET_ENABLED=true
GOOGLE_CALENDAR_ID=primary
GOOGLE_CLIENT_EMAIL=service-account-name@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_IMPERSONATED_USER=calendar-owner@cogitoacademy.id
```

The Workspace administrator must authorize the service account for the Calendar scope, and the impersonated user must have the target calendar. Leave the OAuth refresh-token variables empty. Without domain-wide delegation and `GOOGLE_IMPERSONATED_USER`, the provider cannot create a Meet conference on the intended user's calendar.

## Troubleshooting

| Symptom                                                              | Likely cause                                                                                               | Fix                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth Playground returns `unauthorized_client` during token exchange | The authorization code was issued for a different client, or the Playground is still using old credentials | In the gear panel, enable **Use your own OAuth credentials**, paste the exact client used to authorize, start Step 1 again, and exchange a fresh code                                              |
| `redirect_uri_mismatch`                                              | The Playground URI is missing or differs by scheme/path/trailing slash                                     | Add exactly `https://developers.google.com/oauthplayground` under **Authorized redirect URIs**                                                                                                     |
| Token refresh returns `invalid_grant`                                | Refresh token was revoked, expired, or paired with the wrong client secret                                 | Generate a new token with the same client ID and secret; replace `GOOGLE_MEET_REFRESH_TOKEN`; restart the API                                                                                      |
| Startup logs `insufficient authentication scopes`                    | The token was authorized only with an event scope and cannot read the calendar list                        | Revoke the grant and generate a new refresh token with `https://www.googleapis.com/auth/calendar`                                                                                                  |
| Startup logs `calendar not found` or `404`                           | `GOOGLE_CALENDAR_ID` is wrong or the OAuth account cannot access it                                        | Set `GOOGLE_CALENDAR_ID=primary` first, verify the account, then switch to a shared/secondary calendar only after sharing it with that account                                                     |
| Booking stays `confirmed` and has no link                            | Google credentials failed, the circuit breaker is open, or the API was not restarted after env changes     | Check the boot probe and `google_meet_create_failed` log, fix the credential, restart, and retry the booking; if the link is still unavailable, use the assigned-tutor or admin manual-link action |
| Link is created but not visible immediately                          | Calendar event creation is asynchronous                                                                    | Refresh the booking detail after a few seconds and inspect the Google Calendar event; do not generate a duplicate booking while the first attempt is being retried                                 |

## Security and rotation

- Keep client secrets and refresh tokens only on the API server or secret manager. Never expose them through `apps/web`, `VITE_*`, git, screenshots, or chat.
- Treat a refresh token as a long-lived credential. If it was shared accidentally, revoke it in the Google account's third-party access settings, generate a replacement, update the server secret, and restart the API.
- Use a separate OAuth client for Meet in production when possible. This limits Calendar credential rotation from affecting Sign in with Google.
- Keep `GOOGLE_MEET_ENABLED=false` until the complete credential set is present and the startup probe succeeds.

## Official references

- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
- [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Create Google Calendar events](https://developers.google.com/workspace/calendar/api/guides/create-events)
- [CalendarList authorization requirements](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/get)
