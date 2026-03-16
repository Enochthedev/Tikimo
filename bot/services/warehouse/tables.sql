-- Run this once against your ClickHouse Cloud instance
-- tiximo database

CREATE DATABASE IF NOT EXISTS tiximo;

CREATE TABLE IF NOT EXISTS tiximo.interactions (
    user_id       String,
    event_id      String,
    provider      String,
    geo_cell      String,
    action        Enum8('viewed' = 1, 'clicked' = 2, 'booked' = 3, 'disliked' = 4),
    platform      String,
    ts            DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (geo_cell, ts, user_id);

CREATE TABLE IF NOT EXISTS tiximo.search_events (
    user_id       String,
    platform      String,
    city          String,
    geo_cell      String,
    radius_km     UInt16,
    result_count  UInt16,
    from_cache    Bool,
    ts            DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (geo_cell, ts);

CREATE TABLE IF NOT EXISTS tiximo.zero_results (
    geo_cell      String,
    category      String,
    ts            DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (geo_cell, ts);

-- Intent training data — every classified message is a labeled sample.
-- Once we have ~10k rows, we can fine-tune a small classifier to replace
-- the Gemini Flash call entirely (saving ~$0.00007 per message but at scale).
CREATE TABLE IF NOT EXISTS tiximo.intent_log (
    intent_id     String,     -- UUID — join key with intent_confirmations
    user_id       String,
    platform      String,
    message       String,
    intent        String,
    city          String,
    category      String,
    model         String,     -- which model classified it ('gemini-flash', 'fallback-regex')
    confidence    Float32,    -- 1.0 for AI, 0.5 for regex fallback
    ts            DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (intent, ts);

-- Confirmation signals — when downstream behaviour proves the intent was correct.
-- JOIN with intent_log on intent_id to get verified training samples.
-- signal: 'see_more' | 'booked' | 'follow_up_category' | 'follow_up_city'
CREATE TABLE IF NOT EXISTS tiximo.intent_confirmations (
    intent_id     String,
    signal        String,
    ts            DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (intent_id, ts);

-- Human corrections — ops team can flag misclassified intents and set the true label.
-- These are gold-standard samples: highest weight in training data.
-- corrected_by: who made the correction (admin user ID or 'auto-review')
CREATE TABLE IF NOT EXISTS tiximo.intent_corrections (
    intent_id         String,
    original_intent   String,
    corrected_intent  String,
    corrected_by      String,
    note              String,   -- optional free-text reason
    ts                DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (intent_id, ts);
