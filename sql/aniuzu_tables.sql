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
-- One row is one user's in-progress anime episode. Playback URLs are never
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
    CONSTRAINT aniuzu_continue_watching_user_episode_key UNIQUE (user_id, anilist_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_aniuzu_continue_user_updated
    ON aniuzu_continue_watching(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aniuzu_continue_anilist
    ON aniuzu_continue_watching(anilist_id);

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
