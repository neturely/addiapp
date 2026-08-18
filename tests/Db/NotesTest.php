<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\NotesController;
use App\Db;
use App\Http\Request;
use App\Http\Router;

/**
 * Request-level notes coverage (#405), through the real router + controller:
 * the empty default before anything is written, the upsert (one row per user,
 * however many saves), user scoping, length validation, and the cascade that
 * takes the note with a deleted account.
 */
final class NotesTest extends DbTestCase
{
    private function router(): Router
    {
        $notes = new NotesController();
        $router = new Router();
        $router->get('/api/notes', [$notes, 'show'], true);
        $router->put('/api/notes', [$notes, 'save'], true);
        return $router;
    }

    /**
     * @param array<string,mixed> $body
     * @return array{0:int,1:array<string,mixed>}
     */
    private function dispatch(string $method, string $path, string $sid, array $body = []): array
    {
        $req = new Request($method, $path, [], $body, ['sid' => $sid]);
        http_response_code(200);
        ob_start();
        try {
            $this->router()->dispatch($req);
        } finally {
            $out = ob_get_clean();
        }
        $decoded = json_decode((string) $out, true);
        return [http_response_code(), is_array($decoded) ? $decoded : []];
    }

    /** @return array{0:int,1:string} */
    private function makeSessionUser(string $email): array
    {
        $id = $this->makeUser($email);
        return [$id, Sessions::create($id)];
    }

    public function testEmptyDefaultThenUpsertKeepsOneRow(): void
    {
        [$userId, $sid] = $this->makeSessionUser('notes-upsert@test.local');

        // A user who has never written anything reads back empty — not a 404.
        [$status, $body] = $this->dispatch('GET', '/api/notes', $sid);
        self::assertSame(200, $status);
        self::assertSame('', $body['content']);
        self::assertNull($body['updatedAt']);

        [$status, $body] = $this->dispatch('PUT', '/api/notes', $sid, ['content' => "first\nsecond"]);
        self::assertSame(200, $status);
        self::assertSame("first\nsecond", $body['content']);
        self::assertNotNull($body['updatedAt']);

        // Saving again REPLACES; it never accumulates rows — the whole point of
        // the unique index carrying the upsert.
        [, $body] = $this->dispatch('PUT', '/api/notes', $sid, ['content' => 'replaced']);
        self::assertSame('replaced', $body['content']);
        [, $body] = $this->dispatch('GET', '/api/notes', $sid);
        self::assertSame('replaced', $body['content']);

        $count = Db::pdo()->prepare('SELECT COUNT(*) FROM notes WHERE user_id = ?');
        $count->execute([$userId]);
        self::assertSame(1, (int) $count->fetchColumn());

        // CRLF is normalised so the text round-trips identically either way.
        [, $body] = $this->dispatch('PUT', '/api/notes', $sid, ['content' => "a\r\nb"]);
        self::assertSame("a\nb", $body['content']);
    }

    public function testNotesAreScopedToTheirOwner(): void
    {
        [, $sidA] = $this->makeSessionUser('notes-a@test.local');
        [, $sidB] = $this->makeSessionUser('notes-b@test.local');

        $this->dispatch('PUT', '/api/notes', $sidA, ['content' => 'private to A']);

        // B sees their own empty page, never A's — and B's save can't touch A's.
        [, $body] = $this->dispatch('GET', '/api/notes', $sidB);
        self::assertSame('', $body['content']);
        $this->dispatch('PUT', '/api/notes', $sidB, ['content' => 'B wrote this']);
        [, $body] = $this->dispatch('GET', '/api/notes', $sidA);
        self::assertSame('private to A', $body['content']);
    }

    public function testRejectsNonStringAndOverlongContent(): void
    {
        [, $sid] = $this->makeSessionUser('notes-validate@test.local');

        [$status] = $this->dispatch('PUT', '/api/notes', $sid, ['content' => 123]);
        self::assertSame(400, $status);
        [$status] = $this->dispatch('PUT', '/api/notes', $sid, []);
        self::assertSame(400, $status);
        [$status] = $this->dispatch('PUT', '/api/notes', $sid, [
            'content' => str_repeat('x', NotesController::MAX_LENGTH + 1),
        ]);
        self::assertSame(400, $status);

        // The cap counts CHARACTERS, so a multi-byte note gets the full length.
        [$status] = $this->dispatch('PUT', '/api/notes', $sid, [
            'content' => str_repeat('ä', NotesController::MAX_LENGTH),
        ]);
        self::assertSame(200, $status);
    }

    public function testNoteIsDeletedWithTheAccount(): void
    {
        [$userId, $sid] = $this->makeSessionUser('notes-cascade@test.local');
        $this->dispatch('PUT', '/api/notes', $sid, ['content' => 'goes with me']);

        Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);

        $count = Db::pdo()->prepare('SELECT COUNT(*) FROM notes WHERE user_id = ?');
        $count->execute([$userId]);
        self::assertSame(0, (int) $count->fetchColumn());
    }
}
