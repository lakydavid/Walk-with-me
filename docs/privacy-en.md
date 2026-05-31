# Privacy Policy

[🇭🇺 Magyar](./privacy) · [🇬🇧 English](./privacy-en)

**Effective: 28 May 2026** &nbsp;·&nbsp; **Controller:** Dávid Laky (`lktsdvd@gmail.com`)

This document explains how the Walk With Me mobile app ("the Service") handles
personal data.

## 1. What we collect

| Data | Purpose | Legal basis |
| --- | --- | --- |
| Email address | Authentication, account identification | Contract |
| GPS coordinates + timestamps (~ every 4 s, only while a walk is active) | Compute walked streets, achievements | Contract + explicit consent (background tracking) |
| Reported GPS accuracy, "mocked GPS" flag | Anti-abuse (fake GPS, vehicle cheating) | Legitimate interest |
| Anonymous crash logs | Stability | Legitimate interest |

We do **not** collect advertising IDs, browsing history, contacts,
photo, audio, biometric, or financial data.

## 2. Background location

The Service uses background location **only** while the user has explicitly
started walk tracking from within the app. Tracking stops immediately when:

- the user taps "Stop walk",
- the user signs out or deletes their account,
- the user revokes the OS background-location permission.

## 3. Storage and transfers

- Data is stored on Supabase servers within the European Union.
- Data is transmitted over TLS 1.3.
- We do **not** share data with third parties for marketing.
- We do not sell user data.
- We may publish aggregate, non-identifying statistics (e.g. total km
  walked in Budapest).

## 4. Retention

| Data | Retention |
| --- | --- |
| Email + account profile | While account is active |
| Raw GPS walk history | 90 days, then aggregated and purged |
| Per-street progress | Until account deletion |
| Crash logs | 30 days |

## 5. Your rights (GDPR)

- **Access**: per-street progress is visible inside the app; on email
  request we send a full JSON export within 30 days.
- **Rectification**: by email.
- **Erasure**: Profile → *Delete account* triggers an immediate,
  irreversible deletion. All data (email, walks, achievements) is removed
  within 24 hours.
- **Data portability**: JSON export on email request.
- **Object**: at any time.
- **Complaint**: with the Hungarian NAIH ([naih.hu](https://naih.hu))
  or your local supervisory authority.

To exercise these rights write to `lktsdvd@gmail.com`. We respond within
30 days.

## 6. Cookies

The Service uses no cookies. The mobile app stores in encrypted local
storage only: a session token, a GPS buffer, and a tracking-consent flag.

## 7. Children

The Service is not intended for users under 13. We do not knowingly
collect data from anyone under 13.

## 8. Changes

We will notify users of any material change inside the app and re-request
consent before resuming tracking.

## 9. Contact

Dávid Laky &nbsp;·&nbsp; `lktsdvd@gmail.com`
