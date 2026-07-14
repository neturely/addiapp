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

## CI release gate (`.github/workflows/ci.yml`)

Separate from deploy. By design it runs on **PRs into `main` only** — i.e. the
`develop → main` **promotion PR** — plus manual `workflow_dispatch`.

- **backend** — MariaDB 10.11 service (prod flavour) → PHP 8.2 → `composer install`
  → `php -l` sweep across `api/` → migrate `addiapp_test` → PHPUnit.
- **frontend** — Node 20 → `npm ci` → `lint` + `typecheck` + `build`.

**Why not on develop?** For this project's size, the many small issue PRs into
`develop` shouldn't each wait on CI. The promotion PR is the real release gate:
the full suite runs there together and anything red gets fixed via review comments
before the release merges. There is deliberately **no** CI on develop PRs, on
pushes to develop, or on push-to-main (main only advances through the promotion PR,
which already ran the suite; and `deploy.yml` rebuilds the SPA on push to main
regardless, so a broken build still can't ship).

The test tooling (Composer, `phpunit.xml`, `tests/`, `vendor/`) lives at the repo
**root** and is git-ignored / never rsynced — the deployed `api/` tree stays
dependency-free.

### ⚠ Manual branch protection (one-time, required to actually block merges)

The workflow only *reports* status. To make a red CI **block the merge**, the two
checks must be marked **required**. Protection here is managed by an **org-level
ruleset** (`neturely` → **"Branch Rules"**) that already targets both
`refs/heads/develop` and `refs/heads/main` and enforces: no deletion, no
force-push, PR required, review-thread resolution. It does **not** yet require
status checks — that's the piece to add.

> ⚠ **Apply required status checks to `main` ONLY — never `develop`.** CI does not
> run on develop PRs, so a check required there would never report and would block
> every develop merge outright. Because the org "Branch Rules" ruleset covers both
> branches with one shared condition, add the status-check requirement as a
> **separate ruleset scoped to `refs/heads/main`** (or split the rule) rather than
> putting it on the shared one.

1. GitHub → **org `neturely` → Settings → Rules → Rulesets** → add/edit a ruleset
   whose target ref is **`refs/heads/main` only**.
2. Add a **Require status checks to pass** rule and select the two checks:
   **`Backend (PHPUnit + php -l)`** and **`Frontend (lint + typecheck + build)`**.
   (They appear in the picker after `ci.yml` has run at least once.)
3. Recommended: also tick **Require branches to be up to date before merging**.

Requires org-admin (`admin:org`) to edit — it's an org ruleset, not a repo
setting.

### Running the backend tests locally

```bash
composer install                                   # one-time (repo root)
docker exec addiapp-mysql-1 mysql -uroot -prootpassword \
  -e "CREATE DATABASE IF NOT EXISTS addiapp_test; \
      GRANT ALL ON addiapp_test.* TO 'addiapp'@'%'; FLUSH PRIVILEGES;"
DATABASE_URL="mysql://addiapp:addiapp@127.0.0.1:3306/addiapp_test" php api/migrate.php
DATABASE_URL="mysql://addiapp:addiapp@127.0.0.1:3306/addiapp_test" vendor/bin/phpunit
```

Without `DATABASE_URL` the pure-math/selection unit tests still run; the DB-backed
tests skip (they never touch dev/prod data).

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
  table locking**, so the nightly dump never blocks the live app. The box runs
  **MariaDB 10.11**, so the MySQL-only `--set-gtid-purged` (MariaDB errors
  `unknown variable`) and `--no-tablespaces` (only needed for a MySQL 8
  PROCESS-privilege quirk) are deliberately **not** passed.
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
