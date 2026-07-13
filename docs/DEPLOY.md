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

## Backups

`addiapp_prod` is backed up at the **application level**, independent of
KnownHost's JetBackup. JetBackup does **not** expose database restore points on
this account (cPanel → JetBackup → Databases tab is empty), so the DB must be
backed up ourselves. A nightly `mysqldump` (`scripts/backup-db.sh`) writes a
consistent, gzipped, timestamped dump to `~/backups/db/`; an external NAS pull
(separate repo) handles offsite retention.

> **JetBackup at the host level** — the empty cPanel Databases tab only proves DB
> restore points aren't exposed to *this* cPanel account. Whether JetBackup runs
> DB backups at the WHM/root level (just not surfaced to this reseller tier) can't
> be determined from a normal cPanel-user SSH session — it's an **open question
> for a KnownHost support ticket**. This app-level backup stands on its own
> regardless of the answer.

### What the script does

`scripts/backup-db.sh` (run from cron):

- `mysqldump --single-transaction --quick` — consistent InnoDB snapshot with **no
  table locking**, so the nightly dump never blocks the live app.
- `--no-tablespaces` — cPanel DB users lack the `PROCESS` privilege MySQL 8's
  tablespace introspection needs; without this the dump errors out.
- `--set-gtid-purged=OFF` — keeps the dump restorable into a fresh DB without `SUPER`.
- Writes to `…​.sql.gz.tmp`, then `mv` to the final name (**atomic** on the same
  filesystem) so the offsite pull never grabs a half-written gzip.
- Emits a `.sha256` sidecar per dump for integrity verification.
- Rotates: keeps ~14 daily dumps (`-mtime +14`), prunes older files + sidecars.
- `set -euo pipefail` + `gzip -t` self-check; failures exit non-zero and hit
  stderr (→ cron `MAILTO`).

### One-time setup

The deploy rsync only ships `client/dist` + `api/`, so the script is installed by
hand (like `config.php`). All steps run on the box (`ssh addiapp@209.42.255.1`).

1. **Dedicated read-only DB user.** In cPanel → *MySQL® Databases* create user
   `addiapp_bak` (cPanel prefixes it to the account, matching `addiapp_prod`),
   then *Add User To Database* → grant only **SELECT, LOCK TABLES, SHOW VIEW** on
   `addiapp_prod`. (Least-privilege: a leaked credential can't mutate or drop
   data.) Equivalent SQL if you have direct access:
   ```sql
   CREATE USER 'addiapp_bak'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';
   GRANT SELECT, LOCK TABLES, SHOW VIEW ON `addiapp_prod`.* TO 'addiapp_bak'@'localhost';
   ```
2. **Credentials file** `~/backups/.my.cnf` (never on the command line — that's
   visible in `ps`):
   ```ini
   [client]
   user=addiapp_bak
   password=STRONG_PASSWORD
   host=localhost
   ```
   ```bash
   mkdir -p ~/backups/db ~/bin
   chmod 600 ~/backups/.my.cnf
   ```
3. **Install the script** (copy `scripts/backup-db.sh` from the repo to the box):
   ```bash
   # from a checkout, or scp the file up:
   install -m 755 scripts/backup-db.sh ~/bin/backup-db.sh
   ```
4. **Crontab** (`crontab -e`) — nightly at 03:30 server time. `MAILTO` sends
   failures to you (stdout → log, stderr → mail), so a broken backup is noticed:
   ```cron
   MAILTO="you@example.com"
   30 3 * * * /home/addiapp/bin/backup-db.sh >> /home/addiapp/backups/db/backup.log
   ```

### Offsite handoff (external — not built here)

Offsite retention is a **separate NAS-based pull** tracked in a different repo.
The contract this repo guarantees at the handoff point:

- **Directory:** `~/backups/db/` (i.e. `/home/addiapp/backups/db/`).
- **Filename pattern:** `addiapp_prod-YYYY-MM-DD.sql.gz` + `addiapp_prod-YYYY-MM-DD.sql.gz.sha256`.
- Final filenames only appear once fully written (atomic `mv`), so a pull can
  safely grab any file matching the pattern and verify it against its `.sha256`.
- On-server retention is ~14 days — the pull must run at least that often or a
  day's dump is pruned before it's copied.

Do **not** build the NAS/offsite side in this repo.

### Verify (run once after setup)

```bash
~/bin/backup-db.sh                                  # run manually
ls -la ~/backups/db/                                # expect the .sql.gz + .sha256
gzip -t ~/backups/db/addiapp_prod-*.sql.gz && echo "gzip OK"
cd ~/backups/db && sha256sum -c addiapp_prod-*.sql.gz.sha256
zcat ~/backups/db/addiapp_prod-*.sql.gz | grep -c 'CREATE TABLE'   # expect 8
```

The `CREATE TABLE` count is **8** — the 7 schema tables (`users`, `sessions`,
`tasks`, `points_log`, `daily_stats`, `email_tokens`, `rate_limits`) plus the
`_migrations` tracker. Strongest check (optional — needs a scratch DB you can
create via cPanel, as `addiapp_bak` can't `CREATE DATABASE`):

```bash
zcat ~/backups/db/addiapp_prod-*.sql.gz | mysql addiapp_restore_test
mysql addiapp_restore_test -e "SHOW TABLES; SELECT COUNT(*) FROM users;"
```
