# Gmail setup for XEdu advisor notifications

XEdu sends level-up emails to advisors using **Gmail SMTP** and a **Google App Password**. No OAuth or separate mail server is required.

---

## Step 1 — Enable 2-Step Verification

1. Open [Google Account → Security](https://myaccount.google.com/security).
2. Under **How you sign in to Google**, turn on **2-Step Verification**.
3. Complete the setup (phone or authenticator app).

2-Step Verification is required before Google will let you create an App Password.

---

## Step 2 — Generate an App Password

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords).
2. Sign in if prompted.
3. Under **Select app**, choose **Mail** (or **Other** and name it `XEdu`).
4. Under **Select device**, choose **Other** and type `XEdu Local`.
5. Click **Generate**.
6. Copy the **16-character password** (shown as four groups of four characters). You can paste it with or without spaces.

---

## Step 3 — Copy the App Password into `.env.local`

In the project root, create or edit `.env.local`:

```bash
EMAIL_APP_PASSWORD=your16charapppassword
```

Paste the App Password from Step 2. Do **not** use your normal Gmail password.

---

## Step 4 — Put the Gmail address into `.env.local`

In the same file, set the Gmail account that will **send** the emails:

```bash
EMAIL_USER=your.name@gmail.com
```

This must be the same Google account where you created the App Password.

Example `.env.local`:

```bash
DEEPSEEK_API_KEY=sk-...
EMAIL_USER=advisor@gmail.com
EMAIL_APP_PASSWORD=abcd efgh ijkl mnop
PORT=3000
```

---

## Step 5 — Start the server

```bash
python3 server.py
```

You should see:

```text
Gmail SMTP ready — sending as advisor@gmail.com
✦ Xedu Self-Assessment running at http://localhost:3000
```

If Gmail is not configured, the server still runs but prints a warning pointing here.

---

## Step 6 — Test by leveling up

1. Open [http://localhost:3000](http://localhost:3000).
2. Complete the assessment and add at least one **advisor email** (use your own email for testing).
3. Go to **Rewards** and complete an activity that awards enough XP to reach a **new level**.
4. The level-up modal should show **✓ Advisor notified successfully**.
5. Check the advisor inbox for an email with subject **🎉 Student Level Up – XEdu**.

### Optional: send a test email from the terminal

```bash
python3 scripts/test_email.py your.test@gmail.com
```

### Verify duplicate protection

1. Refresh the page after a level-up.
2. Complete the **same** task again — no second email should be sent.
3. Level up again (new level) — exactly **one** new email should arrive.

---

## Troubleshooting

| Problem | What to do |
|--------|------------|
| `Missing EMAIL_USER or EMAIL_APP_PASSWORD` | Fill both variables in `.env.local` and restart the server. |
| `Username and Password not accepted` | Use an **App Password**, not your login password. Regenerate if needed. |
| `Unable to notify advisor` | Confirm advisor emails are saved in the assessment profile. |
| Email not in inbox | Check Spam. Confirm `EMAIL_USER` matches the App Password account. |

---

## Security notes

- Never commit `.env.local` — it is gitignored.
- Never share or commit App Passwords.
- Duplicate sends are blocked server-side in `.xedu-email-log.json` and per-student `notifiedLevels` in `.xedu-xp-store.json`.
