# Security

## Measures

- argon2id password hashing; hashes are never returned by the API.
- Refresh token rotation with reuse detection; tokens stored hashed.
- Request bodies validated with schemas; unknown fields such as `role` are dropped.
- Rate limiting on signup, login and password reset routes.
- Helmet headers, CORS allow-list, 100 kB JSON limit.
- Login and forgot password do not reveal whether an email exists.
- Internal error details are not sent to clients.

## Known gaps

- An access token stays valid for up to 15 minutes after logout or password reset.
  Disabled accounts are blocked immediately.
- Signup reports that an email is already registered.
- Rate limit counters are held in memory, per server instance.
- No email verification or multi-factor authentication.
- The mock email provider writes reset links to the server log.
