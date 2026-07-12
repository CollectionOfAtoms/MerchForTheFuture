## Epic 17: Password Reset

### US-17.1 — Request Password Reset

**As a** user (buyer, seller, or admin),
**I want to** request a password reset by entering my email address,
**so that** I can regain access to my account if I forget my password.

**Acceptance Criteria:**
- A "Forgot password?" link is visible on the sign-in page.
- Clicking it shows a form with a single email field.
- Submitting a valid email sends a password reset email containing a time-limited link (expires in 1 hour).
- If the email is not registered, the form still shows the same success message (no account enumeration).
- If the email is registered, a `PasswordResetToken` record is created in the database linked to the user.
- Only one active reset token exists per user at a time — issuing a new request invalidates any previous token.
- The reset email contains the user's name and a clearly labelled link to `/auth/reset-password?token=[token]`.

---

### US-17.2 — Set New Password via Reset Link

**As a** user who has requested a password reset,
**I want to** click the link in my email and enter a new password,
**so that** I can regain access to my account.

**Acceptance Criteria:**
- Visiting `/auth/reset-password?token=[token]` renders a "Set new password" form.
- If the token is missing, expired, or already used, the page shows a clear error and a link back to the forgot-password form.
- The form requires a new password and a confirmation field; they must match.
- Password must be at least 8 characters.
- On success, the user's `passwordHash` is updated, the token is marked as used, and the user is redirected to `/sign-in` with a success message.
- The reset token cannot be reused after a successful reset.
