<div align="center">

![Slugy Banner](https://res.cloudinary.com/dcsouj6ix/image/upload/v1771156577/slugy-meta-img_pjaerq.png)

# Slugy

**Slugy** is a fast, secure, and open-source link management tool.  
Easily shorten URLs, generate QR codes, track performance, and share everything from one place.

</div>

---

## 🌟 Features

- 🔗 **Link Shortening** — Create branded, concise links for effective sharing
- 🌍 **Custom Domains** — Connect your own domain to create fully branded short links
- 📱 **QR Code Generation** — Instantly generate QR codes for easy access and scanning
- 📊 **Analytics Dashboard** — Track link performance with detailed click insights
- 🌐 **Bio Links** — Share all your links from one personalized page

---

## 🛠 Tech Stack

| Tool                                         | Role                 |
| -------------------------------------------- | -------------------- |
| [Next.js](https://nextjs.org)                | Frontend Framework   |
| [TypeScript](https://www.typescriptlang.org) | Programming Language |
| [Tailwind CSS](https://tailwindcss.com)      | Styling              |
| [Better-Auth](https://www.better-auth.com/)  | Authentication       |
| [Prisma](https://www.prisma.io)              | ORM                  |
| [Neon](https://neon.tech)                    | Database             |
| [Upstash](https://upstash.com/)              | Caching              |
| [Tinybird](https://tinybird.co)              | Analytics            |
| [Resend](https://resend.com)                 | Email Notifications  |
| [Vercel](https://vercel.com)                 | Hosting & Deployment |

---

## 💖 Sponsor

[![GitHub Sponsor](https://img.shields.io/github/sponsors/slugylink?label=Sponsor&logo=GitHub&color=ff69b4)](https://github.com/sponsors/slugylink)

Supported by:

<a href="https://neon.tech" target="_blank">
  <img src="https://i.postimg.cc/9z3nb7Q8/neon-logo.webp" alt="Neon" width="120" />
</a>

---

## 🔌 API

### Create a Short Link

**Endpoint:** `POST /api/workspace/{workspaceslug}/link`

**Authentication:** Set `SLUGY_API_KEY` in your environment variables, then pass it as a Bearer token.

```bash
curl -X POST https://app.slugy.co/api/workspace/my-workspace/link \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SLUGY_API_KEY" \
  -d '{
    "url": "https://example.com/very/long/path",
    "slug": "my-link",
    "title": "My Link Title",
    "description": "A short description",
    "tags": ["marketing", "launch"],
    "expiresAt": "2026-12-31T23:59:59Z",
    "utm_source": "newsletter",
    "utm_medium": "email",
    "utm_campaign": "summer2026"
  }'
```

**Request body fields:**

| Field           | Type     | Required | Description                                         |
| --------------- | -------- | -------- | --------------------------------------------------- |
| `url`           | string   | ✅       | Destination URL to shorten                          |
| `slug`          | string   | —        | Custom slug (3–50 chars). Auto-generated if omitted |
| `title`         | string   | —        | Link title (max 100 chars)                          |
| `description`   | string   | —        | Short description (max 500 chars)                   |
| `tags`          | string[] | —        | Tag names to attach (workspace limit: 5 tags)       |
| `password`      | string   | —        | Password-protect the link (3–50 chars)              |
| `expiresAt`     | ISO 8601 | —        | Expiry datetime after which the link stops working  |
| `expirationUrl` | string   | —        | Redirect target after the link expires              |
| `utm_source`    | string   | —        | UTM source parameter                                |
| `utm_medium`    | string   | —        | UTM medium parameter                                |
| `utm_campaign`  | string   | —        | UTM campaign parameter                              |
| `utm_content`   | string   | —        | UTM content parameter                               |
| `utm_term`      | string   | —        | UTM term parameter                                  |

**Success response `201`:**

```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "slug": "my-link",
    "url": "https://example.com/very/long/path",
    "title": "My Link Title",
    "description": "A short description",
    "tags": [{ "tag": { "id": "...", "name": "marketing", "color": null } }],
    "expiresAt": "2026-12-31T23:59:59.000Z",
    "createdAt": "2026-06-04T10:00:00.000Z"
  }
}
```

> **Note:** The API key is a static secret configured via `SLUGY_API_KEY` env var. Generate one with `openssl rand -hex 32`.

---

## 🔗 Connect

- [Twitter](https://x.com/slugydotco)
- [Sandip (Owner)](https://x.com/sandip_dev_07)

---

<div align="center">

Built with 🐌 by the Slugy team

</div>
