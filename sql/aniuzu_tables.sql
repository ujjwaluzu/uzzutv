-- =============================================================
-- ANIUZU DEDICATED TABLES
-- Run this SQL in your Supabase SQL Editor.
-- =============================================================

-- 1. WATCHLIST (anime-specific)
-- =============================================================

CREATE TABLE IF NOT EXISTS aniuzu_watchlist (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    media_id    integer NOT NULL,
    title       text NOT NULL DEFAULT '',
    poster      text NOT NULL DEFAULT '',
    created_at  timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, media_id)
);

ALTER TABLE aniuzu_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own anime watchlist"
    ON aniuzu_watchlist FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own anime watchlist"
    ON aniuzu_watchlist FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own anime watchlist"
    ON aniuzu_watchlist FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_aniuzu_wl_user ON aniuzu_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_aniuzu_wl_created ON aniuzu_watchlist(user_id, created_at DESC);

-- 2. ANIUZU CONTINUE WATCHING
-- One row is one user's latest in-progress episode per anime. Playback URLs are never
-- stored: the client rebuilds them from AniList ID, episode, server and audio.
-- =============================================================

CREATE TABLE IF NOT EXISTS aniuzu_continue_watching (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    anilist_id       bigint NOT NULL CHECK (anilist_id > 0),
    episode_number   integer NOT NULL CHECK (episode_number > 0),
    variant          text NOT NULL CHECK (variant IN ('sub', 'dub')),
    server           text NOT NULL CHECK (server IN ('anilink', 'tryembed')),
    position         numeric(12,3) NOT NULL DEFAULT 0 CHECK (position >= 0),
    duration         numeric(12,3) CHECK (duration IS NULL OR duration > 0),
    progress_percent numeric(5,2) CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100)),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT aniuzu_continue_watching_user_anime_key UNIQUE (user_id, anilist_id)
);

CREATE INDEX IF NOT EXISTS idx_aniuzu_continue_user_updated
    ON aniuzu_continue_watching(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aniuzu_continue_anilist
    ON aniuzu_continue_watching(anilist_id);

-- Migration for installations created with the original per-episode key:
-- retain the most recently updated row for each user/anime, then enforce one
-- Continue Watching record per anime.
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY user_id, anilist_id
        ORDER BY updated_at DESC, id DESC
    ) AS row_num
    FROM aniuzu_continue_watching
)
DELETE FROM aniuzu_continue_watching
WHERE id IN (SELECT id FROM ranked WHERE row_num > 1);

ALTER TABLE aniuzu_continue_watching
    DROP CONSTRAINT IF EXISTS aniuzu_continue_watching_user_episode_key;
ALTER TABLE aniuzu_continue_watching
    DROP CONSTRAINT IF EXISTS aniuzu_continue_watching_user_anime_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_aniuzu_continue_user_anime_unique
    ON aniuzu_continue_watching(user_id, anilist_id);

ALTER TABLE aniuzu_continue_watching ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Aniuzu continue watching"
    ON aniuzu_continue_watching FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Aniuzu continue watching"
    ON aniuzu_continue_watching FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Aniuzu continue watching"
    ON aniuzu_continue_watching FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Aniuzu continue watching"
    ON aniuzu_continue_watching FOR DELETE
    USING (auth.uid() = user_id);

-- 3. RATINGS / REVIEWS (anime-specific)
-- One row = one user's star rating for one anime.
-- =============================================================

CREATE TABLE IF NOT EXISTS aniuzu_ratings (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    anilist_id  bigint NOT NULL CHECK (anilist_id > 0),
    rating      integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    updated_at  timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, anilist_id)
);

CREATE INDEX IF NOT EXISTS idx_aniuzu_ratings_anilist ON aniuzu_ratings(anilist_id);
CREATE INDEX IF NOT EXISTS idx_aniuzu_ratings_user ON aniuzu_ratings(user_id);

ALTER TABLE aniuzu_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read Aniuzu ratings"
    ON aniuzu_ratings FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own Aniuzu rating"
    ON aniuzu_ratings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Aniuzu rating"
    ON aniuzu_ratings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Aniuzu rating"
    ON aniuzu_ratings FOR DELETE
    USING (auth.uid() = user_id);

-- 4. COMMENTS (anime-specific)
-- One row = one user comment on an anime.
-- =============================================================

CREATE TABLE IF NOT EXISTS aniuzu_comments (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    user_email  text,
    anilist_id  bigint NOT NULL CHECK (anilist_id > 0),
    content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aniuzu_comments_anilist
    ON aniuzu_comments(anilist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aniuzu_comments_user
    ON aniuzu_comments(user_id);

ALTER TABLE aniuzu_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read Aniuzu comments"
    ON aniuzu_comments FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own Aniuzu comment"
    ON aniuzu_comments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Aniuzu comment"
    ON aniuzu_comments FOR DELETE
    USING (auth.uid() = user_id);
