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

## Billing

- Webhooks are authenticated with a constant-time HMAC comparison on the raw body
  and the payload is schema-validated.
- Checkout can only be completed by the account that started it.
- Gap: while the mock provider is active, any signed-in user can upgrade without
  paying. This is intended for testing only.
- Gap: a `past_due` subscription keeps access until a cancellation event arrives.

## Server-side request forgery

- Only http and https on ports 80 and 443; no credentials in URLs.
- Private, loopback, link-local, metadata, carrier NAT and reserved ranges are
  refused. For IPv6 only global unicast is allowed.
- DNS answers are checked at connection time, which prevents rebinding, and a name
  with any private answer is refused.
- Every redirect is validated again. At most 5 redirects, 10 seconds and 2 MB
  after decompression.
- Another user's website returns 404.
- Text taken from audited sites is untrusted and length limited before storage.

## AI

- Website text is untrusted. It is sent as data, separate from the instructions,
  which tell the model to ignore any instructions inside it.
- The model has no tools and cannot take actions. Its answer is schema validated,
  length limited and shown as plain text.
- The API key is read from the environment and sent in a request header.
- Gap: prompt injection can still skew the wording of advice for that site.
- Gap: on the free tier Google may use submitted data to improve its products.
  Only reports about public pages are sent, with no account details.

## Web app

- The access token is held in memory, not in browser storage. The refresh token is
  not readable by scripts.
- Text from audited sites and from the AI is rendered as text, never as HTML.
- Gap: the web app sets no Content Security Policy of its own.
