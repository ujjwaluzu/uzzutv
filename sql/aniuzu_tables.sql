-- =============================================================
-- ANIUZU DEDICATED TABLES
-- Run this SQL in your Supabase SQL Editor.
-- =============================================================

-- 1. CONTINUE WATCHING (anime-specific)
-- =============================================================

CREATE TABLE IF NOT EXISTS aniuzu_continue_watching (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    media_id    integer NOT NULL,
    episode     integer NOT NULL DEFAULT 1,
    variant     text NOT NULL DEFAULT 'sub',
    poster      text NOT NULL DEFAULT '',
    title       text NOT NULL DEFAULT '',
    updated_at  timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, media_id)
);

ALTER TABLE aniuzu_continue_watching ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own anime continue watching"
    ON aniuzu_continue_watching FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own anime continue watching"
    ON aniuzu_continue_watching FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own anime continue watching"
    ON aniuzu_continue_watching FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own anime continue watching"
    ON aniuzu_continue_watching FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_aniuzu_cw_user ON aniuzu_continue_watching(user_id);
CREATE INDEX IF NOT EXISTS idx_aniuzu_cw_updated ON aniuzu_continue_watching(user_id, updated_at DESC);


-- 2. WATCHLIST (anime-specific)
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
