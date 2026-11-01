CREATE TABLE "activity_article" (
 id text PRIMARY KEY, title_en text NOT NULL, title_id text, description_en text NOT NULL, description_id text, cover_url text NOT NULL, location text NOT NULL, start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, body_en jsonb NOT NULL, body_id jsonb, state text NOT NULL DEFAULT 'draft', version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT activity_article_valid CHECK (end_at >= start_at AND state IN ('draft','published','cancelled','postponed') AND version > 0)
);
CREATE INDEX activity_article_public ON activity_article(state,start_at);
