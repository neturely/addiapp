<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http\Request;
use App\Http\Response;
use App\Support\Timestamps;

/**
 * Personal notes scratchpad (#405): one free-text page per user.
 *
 * Deliberately the smallest thing that works — there is no create/delete, only
 * read and upsert, because the page always exists conceptually even before a
 * row does (a user who has never written anything reads back empty content).
 * Session-scoped like everything else; the unique index on user_id is what
 * makes the upsert a single statement.
 */
final class NotesController
{
    /**
     * Generous ceiling on a scratchpad — long enough that no realistic note
     * hits it, short enough to bound a `text` column and one request body.
     * Measured in CHARACTERS, not bytes, so it doesn't silently shrink for a
     * user writing in a non-latin script.
     */
    public const MAX_LENGTH = 100000;

    /** GET /api/notes — the user's note; empty defaults before anything is saved. */
    public function show(Request $req, array $params): void
    {
        $stmt = Db::pdo()->prepare('SELECT content, updated_at FROM notes WHERE user_id = ? LIMIT 1');
        $stmt->execute([$req->userId]);
        $row = $stmt->fetch();

        Response::json([
            'content' => $row === false ? '' : (string) $row['content'],
            'updatedAt' => $row === false ? null : Timestamps::iso($row['updated_at']),
        ]);
    }

    /** PUT /api/notes — upsert the whole page (the client autosaves, #405). */
    public function save(Request $req, array $params): void
    {
        $content = $req->input('content');
        if (!is_string($content)) {
            Response::error('Invalid input', 400);
            return;
        }

        // Normalise line endings so a CRLF client and an LF one round-trip the
        // same text — the client renders it in a plain textarea either way.
        // BEFORE the length check, not after: a CRLF client's "\r\n" counts as
        // two characters but stores as one, so validating first would reject a
        // note that fits once stored.
        $content = str_replace("\r\n", "\n", $content);

        if (mb_strlen($content) > self::MAX_LENGTH) {
            Response::error('Invalid input', 400);
            return;
        }

        // ON DUPLICATE KEY on the unique user_id: one statement, no read-then-write
        // race between two tabs autosaving at once (last write wins, which is the
        // right semantic for a single-user scratchpad).
        Db::pdo()->prepare(
            'INSERT INTO notes (user_id, content) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE content = VALUES(content)',
        )->execute([$req->userId, $content]);

        $this->show($req, $params);
    }
}
