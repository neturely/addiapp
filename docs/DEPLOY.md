# Deployment

Production is the KnownHost cPanel/LiteSpeed account (`addiapp@209.42.255.1`,
same Basic Plus Reseller box as wptips.com). The backend is PHP, so a deploy is
just files + migrations — **no process to restart**.

## Pipeline (`.github/workflows/deploy.yml`)

Runs on push to `main` (or manual dispatch):

1. `npm ci` + `npm run build -w client` → `client/dist`.
2. `rsync --delete` `client/dist/` → `~/public_html` (keeps `.well-known`,
   `cgi-bin`, and the `api` symlink; old files are pruned).
3. `rsync --delete` `api/` → `~/api` (keeps `config.php`).
4. `ssh … php ~/api/migrate.php`.

### Required GitHub Actions secrets

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_HOST` | `209.42.255.1` |
| `DEPLOY_SSH_USER` | `addiapp` |
| `DEPLOY_SSH_PORT` | `22` |
| `DEPLOY_SSH_KEY`  | private half of a dedicated deploy keypair (public half in the account's `~/.ssh/authorized_keys`) |

## One-time server setup

1. **MySQL** (cPanel → MySQL Databases, or `uapi Mysql …` over SSH): create DB
   `addiapp_prod` + user `addiapp_app` with ALL privileges.
2. **`~/api/config.php`** (outside the web root, never committed):
   ```php
   <?php return [
     'databaseUrl'  => 'mysql://addiapp_app:PASSWORD@localhost/addiapp_prod',
     'appUrl'       => 'https://addiapp.com',
     'appTimezone'  => 'Europe/Stockholm',
     'resendApiKey' => 'RESEND_KEY',   // real key + verified domain (#65) for live email
     'emailFrom'    => 'AddiApp <no-reply@addiapp.com>',
     'isProd'       => true,
   ];
   ```
   (`localhost` with no port → PHP uses the cPanel MySQL socket.)
3. **Routing**: symlink `~/public_html/api` → `~/api/public` so `addiapp.com/api/*`
   hits the PHP front controller. The SPA `.htaccess` (shipped from
   `client/public/.htaccess`) handles client-side routing and skips `/api`.
4. First deploy runs migrations, creating the schema in `addiapp_prod`.

## Email in production

`resendApiKey` must be a real Resend key **and** `addiapp.com` must be verified
in Resend (#65) before live sends work — until then registration succeeds but
verification emails aren't delivered (logged as best-effort failures). Set
`emailFrom` to a verified-domain sender once #65 is done.
