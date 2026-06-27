# Fix xedu.bio — DNS on Netlify

**Why the site won't open:** `xedu.bio` still has old A records pointing to dead servers:

- `63.176.8.218`
- `35.157.26.135`

Your domain uses **Netlify DNS** (nameservers: `dns*.nsone.net`). Fix the records **in Netlify**, not at a separate registrar.

---

## Fix in Netlify (5 minutes)

1. Log in: [app.netlify.com](https://app.netlify.com)
2. Open **Domains** (team menu) → select **`xedu.bio`**
3. Open **DNS records**
4. **Delete** any A records for `@` that point to `63.176.8.218` or `35.157.26.135`
5. **Ensure** you have Netlify’s load balancer record for apex:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `75.2.60.5` |

   Or (preferred if available):

| Type | Name | Value |
|------|------|-------|
| ALIAS / ANAME | `@` | `apex-loadbalancer.netlify.com` |

6. **Ensure** `www` points to your site:

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `YOUR-SITE.netlify.app` |

7. **Remove** any AAAA (IPv6) records on `@`
8. Go to your **site** → **Domain management** → confirm `xedu.bio` and `www.xedu.bio` are added and SSL is active

---

## Verify

```bash
dig +short xedu.bio A
# should show: 75.2.60.5

dig +short www.xedu.bio CNAME
# should show: your-site.netlify.app
```

Or use [dnschecker.org](https://dnschecker.org) for `xedu.bio` (A record).

Propagation: usually 5–60 minutes.

---

## Deploy latest site code

Netlify builds from GitHub. After pushing `main`, Netlify auto-redeploys:

```bash
cd "/Users/malekzahran1/Documents/Xedu Student Self Assesment."
git push origin main
```

---

## API features on xedu.bio

The Netlify deploy is **static** (HTML/CSS/JS). AI chat, assessment API, XP, and Gmail run on **`python3 server.py`** locally until a production backend is added.

---

## Test URLs

| URL | When it works |
|-----|----------------|
| `https://YOUR-SITE.netlify.app` | Netlify deploy OK (test before DNS fix) |
| `https://xedu.bio` | After DNS records fixed |
| `http://localhost:3000` | Local server with full API |
