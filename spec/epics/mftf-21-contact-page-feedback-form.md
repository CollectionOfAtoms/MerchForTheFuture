## Epic MFTF-21: Contact Page & Feedback Form

_Adds a public `/contact` page with a form that emails the founders and thanks the submitter. Sequenced alongside MFTF-20 (same "public pages before launch" motivation); no dependency between the two epics beyond sharing the pre-launch navigation/footer links._

### US-MFTF-21.1 — Contact Form: Submission, Email, and Thank-You

**As a** visitor,
**I want** to fill out a contact form and have my message reach the founders, with a confirmation that it was received,
**so that** I can send feedback, questions, or partnership inquiries without needing to know an email address.

**Acceptance Criteria:**
- [ ] `/contact` renders a form with at minimum: name, email (validated format), message (required, min length); a honeypot field (hidden from real users via CSS, not `display:none` alone — matches common bot-evasion patterns) is present but not shown as a labeled field to the user
- [ ] On submit, `submitContactFormAction` validates all fields server-side (never trust client-only validation) and rejects if the honeypot field is non-empty, silently succeeding from the bot's perspective (returns a normal-looking success response) rather than revealing the honeypot was tripped
- [ ] On valid submission, an email is sent via the existing MailerSend transactional path to **ThePeople@MerchForTheFuture**, including the submitter's name, email (as reply-to, so founders can reply directly), and message
- [ ] After successful submission, the page displays a thank-you message (e.g. "Thanks for reaching out — we'll get back to you soon") in place of or alongside the form; the form is not simply cleared and left re-submittable without feedback
- [ ] If the MailerSend call fails, the submission is not silently lost: the failure is logged server-side, and the user sees an honest error state (not a false thank-you) rather than a swallowed failure — this is a public unauthenticated form, so failures must be visible to whoever monitors logs, not just discarded
- [ ] Email address, name, and message are escaped/sanitized before being interpolated into the outgoing email body (prevents header injection or malformed email content from form input)

**TDD Notes:**
- Test file: `__tests__/mftf-21-contact/US-MFTF-21.1-contact-form-submission.test.ts`
- MSW: intercept `https://api.mailersend.com/v1/email`, assert correct `to`, `reply-to`, and body content on a valid submission
- Unit tests: invalid email format rejected; empty message rejected; honeypot-filled submission returns a success-shaped response but **does not** trigger an actual MailerSend call (assert the mock was not called)
- Failure-path test: MailerSend mock returns 5xx, assert the user-facing response is an error state, not a thank-you, and that the failure is logged
- Component test: thank-you state renders after a successful submission and replaces/supplements the form

---

### US-MFTF-21.2 — Contact Form: Rate Limiting

**As a** platform,
**I want** the contact form to reject excessive submissions from the same source in a short window,
**so that** the public, unauthenticated form can't be used to spam the founders' inbox or exhaust the MailerSend free-tier quota.

**Acceptance Criteria:**
- [ ] Submissions are rate-limited per IP address (or per a comparable identifier available in the Vercel request context): a reasonable default such as **5 submissions per IP per hour** — exact threshold is a founder-tunable constant, not hardcoded magic numbers scattered across the codebase
- [ ] Rate-limit state is tracked without introducing a new paid service — either a lightweight DB-backed counter table (consistent with "cost discipline during pre-launch") or an in-memory store scoped appropriately for serverless (flag if in-memory is chosen: note the known limitation that it resets per cold-start/instance and is therefore a soft limit, not a hard guarantee, in a serverless environment)
- [ ] When the limit is exceeded, the form returns a clear, non-alarming message (e.g. "You've submitted a few messages already — please wait a bit before sending another") rather than a generic error or a silent failure
- [ ] Rate limiting applies to the actual submission action, not to merely loading the `/contact` page — visitors can always view and start filling out the form
- [ ] A submission blocked by rate limiting does not trigger a MailerSend call (verified by test, not just by inspection)

**TDD Notes:**
- Test file: `__tests__/mftf-21-contact/US-MFTF-21.2-contact-rate-limiting.test.ts`
- Unit tests: 6th submission within the window from the same identifier is rejected; a submission from a different identifier within the same window is not affected by another identifier's count
- Integration test: rate-limited submission does not call the MailerSend mock
- Note: if implemented as a DB-backed counter, follow the existing `resetDatabase()` cascade-order convention so tests don't leak rate-limit state between test files
