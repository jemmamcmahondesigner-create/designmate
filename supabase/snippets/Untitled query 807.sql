SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
SELECT id, review_id, reviewer_id, feedback_status
FROM reviewer_feedback
LIMIT 10;
SELECT id, name, role FROM contributors LIMIT 10;

