-- Row counts for every data table, plus ownership once `users` exists.
-- Safe to run before the migration (counts only) and after it.
SELECT 'answer_checks' AS table_name, count(*) AS row_count FROM answer_checks
UNION ALL SELECT 'card_alternate_answers', count(*) FROM card_alternate_answers
UNION ALL SELECT 'card_schedules', count(*) FROM card_schedules
UNION ALL SELECT 'cards', count(*) FROM cards
UNION ALL SELECT 'explanations', count(*) FROM explanations
UNION ALL SELECT 'practice_sessions', count(*) FROM practice_sessions
UNION ALL SELECT 'practice_targets', count(*) FROM practice_targets
UNION ALL SELECT 'review_categorizations', count(*) FROM review_categorizations
UNION ALL SELECT 'review_history', count(*) FROM review_history
UNION ALL SELECT 'reviews', count(*) FROM reviews
ORDER BY table_name;

SELECT to_regclass('public.users') IS NOT NULL AS has_users \gset
\if :has_users
SELECT id AS owner_id, email, password_hash IS NOT NULL AS has_password
FROM users WHERE email = 'scatchell@gmail.com';

-- Right after the migration both not_owned counts must be 0. Once other users
-- exist, compare owner_owned against the pre-migration row counts instead.
SELECT 'cards' AS table_name,
       count(*) FILTER (WHERE user_id = (SELECT id FROM users WHERE email = 'scatchell@gmail.com')) AS owner_owned,
       count(*) FILTER (WHERE user_id IS DISTINCT FROM (SELECT id FROM users WHERE email = 'scatchell@gmail.com')) AS not_owned
FROM cards
UNION ALL
SELECT 'review_history',
       count(*) FILTER (WHERE user_id = (SELECT id FROM users WHERE email = 'scatchell@gmail.com')),
       count(*) FILTER (WHERE user_id IS DISTINCT FROM (SELECT id FROM users WHERE email = 'scatchell@gmail.com'))
FROM review_history;

SELECT count(*) AS user_count FROM users;
\endif
