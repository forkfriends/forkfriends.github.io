-- Backfill analytics data for dashboard demonstration
-- This provides coherent metrics that align with insight calculations

-- First, update any existing queues with gibberish names to proper test names
UPDATE sessions SET event_name = 'queueup-test-1' WHERE event_name IS NOT NULL AND event_name NOT LIKE 'queueup-%' AND id IN (SELECT id FROM sessions ORDER BY created_at LIMIT 1);
UPDATE sessions SET event_name = 'queueup-test-2' WHERE event_name IS NOT NULL AND event_name NOT LIKE 'queueup-%' AND id IN (SELECT id FROM sessions ORDER BY created_at LIMIT 1 OFFSET 1);
UPDATE sessions SET event_name = 'queueup-test-3' WHERE event_name IS NOT NULL AND event_name NOT LIKE 'queueup-%' AND id IN (SELECT id FROM sessions ORDER BY created_at LIMIT 1 OFFSET 2);
UPDATE sessions SET event_name = 'queueup-test-4' WHERE event_name IS NOT NULL AND event_name NOT LIKE 'queueup-%' AND id IN (SELECT id FROM sessions ORDER BY created_at LIMIT 1 OFFSET 3);
UPDATE sessions SET event_name = 'queueup-test-5' WHERE event_name IS NOT NULL AND event_name NOT LIKE 'queueup-%' AND id IN (SELECT id FROM sessions ORDER BY created_at LIMIT 1 OFFSET 4);

-- Create 10 test queues with proper names for the Queue Performance table
-- Queue 1: High performer (90% completion) - 12 joined, 11 served, 1 left
INSERT INTO sessions (id, short_code, event_name, status, created_at) 
VALUES ('demo-q1', 'DEMO01', 'Downtown Cafe', 'active', strftime('%s', 'now') - 86400 * 15);

-- Queue 2: Good performer - 10 joined, 8 served, 2 left  
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q2', 'DEMO02', 'Main Street Deli', 'active', strftime('%s', 'now') - 86400 * 12);

-- Queue 3: Average performer - 15 joined, 10 served, 3 left, 2 no-show
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q3', 'DEMO03', 'Harbor Restaurant', 'closed', strftime('%s', 'now') - 86400 * 10);

-- Queue 4: Below average - 8 joined, 4 served, 2 left, 2 no-show
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q4', 'DEMO04', 'Uptown Bistro', 'active', strftime('%s', 'now') - 86400 * 8);

-- Queue 5: Good performer - 11 joined, 9 served, 2 left
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q5', 'DEMO05', 'Riverside Grill', 'closed', strftime('%s', 'now') - 86400 * 7);

-- Queue 6: Average - 9 joined, 6 served, 2 left, 1 no-show
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q6', 'DEMO06', 'Park Avenue Cafe', 'active', strftime('%s', 'now') - 86400 * 5);

-- Queue 7: Poor performer (0% completion for insight contrast) - 5 joined, 0 served, 4 left, 1 no-show
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q7', 'DEMO07', 'Test Location', 'closed', strftime('%s', 'now') - 86400 * 4);

-- Queue 8: High performer - 10 joined, 9 served, 1 left
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q8', 'DEMO08', 'Central Kitchen', 'active', strftime('%s', 'now') - 86400 * 3);

-- Queue 9: Average - 7 joined, 5 served, 1 left, 1 no-show
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q9', 'DEMO09', 'Lakeside Tavern', 'active', strftime('%s', 'now') - 86400 * 2);

-- Queue 10: Good - 8 joined, 6 served, 1 left, 1 waiting
INSERT INTO sessions (id, short_code, event_name, status, created_at)
VALUES ('demo-q10', 'DEMO10', 'City Center Bar', 'active', strftime('%s', 'now') - 86400 * 1);

-- Now insert parties to match the target stats:
-- Total: 100 parties -> 55 served, 15 left, 18 no-show, 2 called, 10 waiting

-- Queue 1: 12 parties (11 served, 1 left)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p1-01', 'demo-q1', 'Smith', 2, 'served', strftime('%s', 'now') - 86400 * 15 + 100, strftime('%s', 'now') - 86400 * 15 + 520, 420000),
('p1-02', 'demo-q1', 'Johnson', 4, 'served', strftime('%s', 'now') - 86400 * 15 + 200, strftime('%s', 'now') - 86400 * 15 + 680, 480000),
('p1-03', 'demo-q1', 'Williams', 2, 'served', strftime('%s', 'now') - 86400 * 15 + 300, strftime('%s', 'now') - 86400 * 15 + 750, 450000),
('p1-04', 'demo-q1', 'Brown', 3, 'served', strftime('%s', 'now') - 86400 * 15 + 400, strftime('%s', 'now') - 86400 * 15 + 820, 420000),
('p1-05', 'demo-q1', 'Jones', 2, 'served', strftime('%s', 'now') - 86400 * 15 + 500, strftime('%s', 'now') - 86400 * 15 + 900, 400000),
('p1-06', 'demo-q1', 'Garcia', 4, 'served', strftime('%s', 'now') - 86400 * 15 + 600, strftime('%s', 'now') - 86400 * 15 + 1020, 420000),
('p1-07', 'demo-q1', 'Miller', 2, 'served', strftime('%s', 'now') - 86400 * 15 + 700, strftime('%s', 'now') - 86400 * 15 + 1100, 400000),
('p1-08', 'demo-q1', 'Davis', 3, 'served', strftime('%s', 'now') - 86400 * 15 + 800, strftime('%s', 'now') - 86400 * 15 + 1200, 400000),
('p1-09', 'demo-q1', 'Rodriguez', 2, 'served', strftime('%s', 'now') - 86400 * 15 + 900, strftime('%s', 'now') - 86400 * 15 + 1320, 420000),
('p1-10', 'demo-q1', 'Martinez', 4, 'served', strftime('%s', 'now') - 86400 * 15 + 1000, strftime('%s', 'now') - 86400 * 15 + 1450, 450000),
('p1-11', 'demo-q1', 'Hernandez', 2, 'served', strftime('%s', 'now') - 86400 * 15 + 1100, strftime('%s', 'now') - 86400 * 15 + 1550, 450000),
('p1-12', 'demo-q1', 'Lopez', 3, 'left', strftime('%s', 'now') - 86400 * 15 + 1200, strftime('%s', 'now') - 86400 * 15 + 1400, NULL);

-- Update the left party with wait tracking
UPDATE parties SET position_at_leave = 3, wait_ms_at_leave = 200000 WHERE id = 'p1-12';

-- Queue 2: 10 parties (8 served, 2 left)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p2-01', 'demo-q2', 'Wilson', 2, 'served', strftime('%s', 'now') - 86400 * 12 + 100, strftime('%s', 'now') - 86400 * 12 + 500, 400000),
('p2-02', 'demo-q2', 'Anderson', 3, 'served', strftime('%s', 'now') - 86400 * 12 + 200, strftime('%s', 'now') - 86400 * 12 + 620, 420000),
('p2-03', 'demo-q2', 'Thomas', 2, 'served', strftime('%s', 'now') - 86400 * 12 + 300, strftime('%s', 'now') - 86400 * 12 + 720, 420000),
('p2-04', 'demo-q2', 'Taylor', 4, 'served', strftime('%s', 'now') - 86400 * 12 + 400, strftime('%s', 'now') - 86400 * 12 + 850, 450000),
('p2-05', 'demo-q2', 'Moore', 2, 'served', strftime('%s', 'now') - 86400 * 12 + 500, strftime('%s', 'now') - 86400 * 12 + 920, 420000),
('p2-06', 'demo-q2', 'Jackson', 3, 'served', strftime('%s', 'now') - 86400 * 12 + 600, strftime('%s', 'now') - 86400 * 12 + 1020, 420000),
('p2-07', 'demo-q2', 'Martin', 2, 'served', strftime('%s', 'now') - 86400 * 12 + 700, strftime('%s', 'now') - 86400 * 12 + 1100, 400000),
('p2-08', 'demo-q2', 'Lee', 2, 'served', strftime('%s', 'now') - 86400 * 12 + 800, strftime('%s', 'now') - 86400 * 12 + 1200, 400000),
('p2-09', 'demo-q2', 'Perez', 3, 'left', strftime('%s', 'now') - 86400 * 12 + 900, strftime('%s', 'now') - 86400 * 12 + 1100, NULL),
('p2-10', 'demo-q2', 'Thompson', 2, 'left', strftime('%s', 'now') - 86400 * 12 + 1000, strftime('%s', 'now') - 86400 * 12 + 1250, NULL);

UPDATE parties SET position_at_leave = 4, wait_ms_at_leave = 200000 WHERE id = 'p2-09';
UPDATE parties SET position_at_leave = 5, wait_ms_at_leave = 250000 WHERE id = 'p2-10';

-- Queue 3: 15 parties (10 served, 3 left, 2 no-show)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p3-01', 'demo-q3', 'White', 2, 'served', strftime('%s', 'now') - 86400 * 10 + 100, strftime('%s', 'now') - 86400 * 10 + 520, 420000),
('p3-02', 'demo-q3', 'Harris', 3, 'served', strftime('%s', 'now') - 86400 * 10 + 200, strftime('%s', 'now') - 86400 * 10 + 650, 450000),
('p3-03', 'demo-q3', 'Sanchez', 2, 'served', strftime('%s', 'now') - 86400 * 10 + 300, strftime('%s', 'now') - 86400 * 10 + 750, 450000),
('p3-04', 'demo-q3', 'Clark', 4, 'served', strftime('%s', 'now') - 86400 * 10 + 400, strftime('%s', 'now') - 86400 * 10 + 880, 480000),
('p3-05', 'demo-q3', 'Ramirez', 2, 'served', strftime('%s', 'now') - 86400 * 10 + 500, strftime('%s', 'now') - 86400 * 10 + 950, 450000),
('p3-06', 'demo-q3', 'Lewis', 3, 'served', strftime('%s', 'now') - 86400 * 10 + 600, strftime('%s', 'now') - 86400 * 10 + 1050, 450000),
('p3-07', 'demo-q3', 'Robinson', 2, 'served', strftime('%s', 'now') - 86400 * 10 + 700, strftime('%s', 'now') - 86400 * 10 + 1120, 420000),
('p3-08', 'demo-q3', 'Walker', 2, 'served', strftime('%s', 'now') - 86400 * 10 + 800, strftime('%s', 'now') - 86400 * 10 + 1220, 420000),
('p3-09', 'demo-q3', 'Young', 3, 'served', strftime('%s', 'now') - 86400 * 10 + 900, strftime('%s', 'now') - 86400 * 10 + 1350, 450000),
('p3-10', 'demo-q3', 'Allen', 2, 'served', strftime('%s', 'now') - 86400 * 10 + 1000, strftime('%s', 'now') - 86400 * 10 + 1450, 450000),
('p3-11', 'demo-q3', 'King', 4, 'left', strftime('%s', 'now') - 86400 * 10 + 1100, strftime('%s', 'now') - 86400 * 10 + 1350, NULL),
('p3-12', 'demo-q3', 'Wright', 2, 'left', strftime('%s', 'now') - 86400 * 10 + 1200, strftime('%s', 'now') - 86400 * 10 + 1500, NULL),
('p3-13', 'demo-q3', 'Scott', 3, 'left', strftime('%s', 'now') - 86400 * 10 + 1300, strftime('%s', 'now') - 86400 * 10 + 1650, NULL),
('p3-14', 'demo-q3', 'Torres', 2, 'no_show', strftime('%s', 'now') - 86400 * 10 + 1400, strftime('%s', 'now') - 86400 * 10 + 1800, NULL),
('p3-15', 'demo-q3', 'Nguyen', 2, 'no_show', strftime('%s', 'now') - 86400 * 10 + 1500, strftime('%s', 'now') - 86400 * 10 + 1900, NULL);

UPDATE parties SET position_at_leave = 6, wait_ms_at_leave = 250000 WHERE id = 'p3-11';
UPDATE parties SET position_at_leave = 7, wait_ms_at_leave = 300000 WHERE id = 'p3-12';
UPDATE parties SET position_at_leave = 8, wait_ms_at_leave = 350000 WHERE id = 'p3-13';

-- Queue 4: 8 parties (4 served, 2 left, 2 no-show)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p4-01', 'demo-q4', 'Hill', 2, 'served', strftime('%s', 'now') - 86400 * 8 + 100, strftime('%s', 'now') - 86400 * 8 + 550, 450000),
('p4-02', 'demo-q4', 'Flores', 3, 'served', strftime('%s', 'now') - 86400 * 8 + 200, strftime('%s', 'now') - 86400 * 8 + 680, 480000),
('p4-03', 'demo-q4', 'Green', 2, 'served', strftime('%s', 'now') - 86400 * 8 + 300, strftime('%s', 'now') - 86400 * 8 + 780, 480000),
('p4-04', 'demo-q4', 'Adams', 4, 'served', strftime('%s', 'now') - 86400 * 8 + 400, strftime('%s', 'now') - 86400 * 8 + 920, 520000),
('p4-05', 'demo-q4', 'Nelson', 2, 'left', strftime('%s', 'now') - 86400 * 8 + 500, strftime('%s', 'now') - 86400 * 8 + 800, NULL),
('p4-06', 'demo-q4', 'Baker', 3, 'left', strftime('%s', 'now') - 86400 * 8 + 600, strftime('%s', 'now') - 86400 * 8 + 950, NULL),
('p4-07', 'demo-q4', 'Hall', 2, 'no_show', strftime('%s', 'now') - 86400 * 8 + 700, strftime('%s', 'now') - 86400 * 8 + 1100, NULL),
('p4-08', 'demo-q4', 'Rivera', 2, 'no_show', strftime('%s', 'now') - 86400 * 8 + 800, strftime('%s', 'now') - 86400 * 8 + 1200, NULL);

UPDATE parties SET position_at_leave = 3, wait_ms_at_leave = 300000 WHERE id = 'p4-05';
UPDATE parties SET position_at_leave = 4, wait_ms_at_leave = 350000 WHERE id = 'p4-06';

-- Queue 5: 11 parties (9 served, 2 left)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p5-01', 'demo-q5', 'Campbell', 2, 'served', strftime('%s', 'now') - 86400 * 7 + 100, strftime('%s', 'now') - 86400 * 7 + 480, 380000),
('p5-02', 'demo-q5', 'Mitchell', 3, 'served', strftime('%s', 'now') - 86400 * 7 + 200, strftime('%s', 'now') - 86400 * 7 + 600, 400000),
('p5-03', 'demo-q5', 'Roberts', 2, 'served', strftime('%s', 'now') - 86400 * 7 + 300, strftime('%s', 'now') - 86400 * 7 + 700, 400000),
('p5-04', 'demo-q5', 'Carter', 4, 'served', strftime('%s', 'now') - 86400 * 7 + 400, strftime('%s', 'now') - 86400 * 7 + 820, 420000),
('p5-05', 'demo-q5', 'Phillips', 2, 'served', strftime('%s', 'now') - 86400 * 7 + 500, strftime('%s', 'now') - 86400 * 7 + 900, 400000),
('p5-06', 'demo-q5', 'Evans', 3, 'served', strftime('%s', 'now') - 86400 * 7 + 600, strftime('%s', 'now') - 86400 * 7 + 1000, 400000),
('p5-07', 'demo-q5', 'Turner', 2, 'served', strftime('%s', 'now') - 86400 * 7 + 700, strftime('%s', 'now') - 86400 * 7 + 1080, 380000),
('p5-08', 'demo-q5', 'Torres', 2, 'served', strftime('%s', 'now') - 86400 * 7 + 800, strftime('%s', 'now') - 86400 * 7 + 1180, 380000),
('p5-09', 'demo-q5', 'Parker', 3, 'served', strftime('%s', 'now') - 86400 * 7 + 900, strftime('%s', 'now') - 86400 * 7 + 1300, 400000),
('p5-10', 'demo-q5', 'Collins', 2, 'left', strftime('%s', 'now') - 86400 * 7 + 1000, strftime('%s', 'now') - 86400 * 7 + 1200, NULL),
('p5-11', 'demo-q5', 'Edwards', 4, 'left', strftime('%s', 'now') - 86400 * 7 + 1100, strftime('%s', 'now') - 86400 * 7 + 1350, NULL);

UPDATE parties SET position_at_leave = 5, wait_ms_at_leave = 200000 WHERE id = 'p5-10';
UPDATE parties SET position_at_leave = 6, wait_ms_at_leave = 250000 WHERE id = 'p5-11';

-- Queue 6: 9 parties (6 served, 2 left, 1 no-show)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p6-01', 'demo-q6', 'Stewart', 2, 'served', strftime('%s', 'now') - 86400 * 5 + 100, strftime('%s', 'now') - 86400 * 5 + 520, 420000),
('p6-02', 'demo-q6', 'Gonzalez', 3, 'served', strftime('%s', 'now') - 86400 * 5 + 200, strftime('%s', 'now') - 86400 * 5 + 650, 450000),
('p6-03', 'demo-q6', 'Morris', 2, 'served', strftime('%s', 'now') - 86400 * 5 + 300, strftime('%s', 'now') - 86400 * 5 + 750, 450000),
('p6-04', 'demo-q6', 'Rogers', 4, 'served', strftime('%s', 'now') - 86400 * 5 + 400, strftime('%s', 'now') - 86400 * 5 + 880, 480000),
('p6-05', 'demo-q6', 'Reed', 2, 'served', strftime('%s', 'now') - 86400 * 5 + 500, strftime('%s', 'now') - 86400 * 5 + 950, 450000),
('p6-06', 'demo-q6', 'Cook', 3, 'served', strftime('%s', 'now') - 86400 * 5 + 600, strftime('%s', 'now') - 86400 * 5 + 1050, 450000),
('p6-07', 'demo-q6', 'Morgan', 2, 'left', strftime('%s', 'now') - 86400 * 5 + 700, strftime('%s', 'now') - 86400 * 5 + 900, NULL),
('p6-08', 'demo-q6', 'Bell', 2, 'left', strftime('%s', 'now') - 86400 * 5 + 800, strftime('%s', 'now') - 86400 * 5 + 1050, NULL),
('p6-09', 'demo-q6', 'Murphy', 3, 'no_show', strftime('%s', 'now') - 86400 * 5 + 900, strftime('%s', 'now') - 86400 * 5 + 1300, NULL);

UPDATE parties SET position_at_leave = 4, wait_ms_at_leave = 200000 WHERE id = 'p6-07';
UPDATE parties SET position_at_leave = 5, wait_ms_at_leave = 250000 WHERE id = 'p6-08';

-- Queue 7: 5 parties (0 served, 4 left, 1 no-show) - Poor performer for insight contrast
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p7-01', 'demo-q7', 'Bailey', 2, 'left', strftime('%s', 'now') - 86400 * 4 + 100, strftime('%s', 'now') - 86400 * 4 + 250, NULL),
('p7-02', 'demo-q7', 'Cooper', 3, 'left', strftime('%s', 'now') - 86400 * 4 + 200, strftime('%s', 'now') - 86400 * 4 + 380, NULL),
('p7-03', 'demo-q7', 'Richardson', 2, 'left', strftime('%s', 'now') - 86400 * 4 + 300, strftime('%s', 'now') - 86400 * 4 + 480, NULL),
('p7-04', 'demo-q7', 'Cox', 4, 'left', strftime('%s', 'now') - 86400 * 4 + 400, strftime('%s', 'now') - 86400 * 4 + 600, NULL),
('p7-05', 'demo-q7', 'Howard', 2, 'no_show', strftime('%s', 'now') - 86400 * 4 + 500, strftime('%s', 'now') - 86400 * 4 + 800, NULL);

UPDATE parties SET position_at_leave = 1, wait_ms_at_leave = 150000 WHERE id = 'p7-01';
UPDATE parties SET position_at_leave = 2, wait_ms_at_leave = 180000 WHERE id = 'p7-02';
UPDATE parties SET position_at_leave = 3, wait_ms_at_leave = 180000 WHERE id = 'p7-03';
UPDATE parties SET position_at_leave = 4, wait_ms_at_leave = 200000 WHERE id = 'p7-04';

-- Queue 8: 10 parties (9 served, 1 left)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p8-01', 'demo-q8', 'Ward', 2, 'served', strftime('%s', 'now') - 86400 * 3 + 100, strftime('%s', 'now') - 86400 * 3 + 480, 380000),
('p8-02', 'demo-q8', 'Brooks', 3, 'served', strftime('%s', 'now') - 86400 * 3 + 200, strftime('%s', 'now') - 86400 * 3 + 600, 400000),
('p8-03', 'demo-q8', 'Sanders', 2, 'served', strftime('%s', 'now') - 86400 * 3 + 300, strftime('%s', 'now') - 86400 * 3 + 700, 400000),
('p8-04', 'demo-q8', 'Price', 4, 'served', strftime('%s', 'now') - 86400 * 3 + 400, strftime('%s', 'now') - 86400 * 3 + 820, 420000),
('p8-05', 'demo-q8', 'Bennett', 2, 'served', strftime('%s', 'now') - 86400 * 3 + 500, strftime('%s', 'now') - 86400 * 3 + 900, 400000),
('p8-06', 'demo-q8', 'Wood', 3, 'served', strftime('%s', 'now') - 86400 * 3 + 600, strftime('%s', 'now') - 86400 * 3 + 1000, 400000),
('p8-07', 'demo-q8', 'Barnes', 2, 'served', strftime('%s', 'now') - 86400 * 3 + 700, strftime('%s', 'now') - 86400 * 3 + 1080, 380000),
('p8-08', 'demo-q8', 'Ross', 2, 'served', strftime('%s', 'now') - 86400 * 3 + 800, strftime('%s', 'now') - 86400 * 3 + 1180, 380000),
('p8-09', 'demo-q8', 'Henderson', 3, 'served', strftime('%s', 'now') - 86400 * 3 + 900, strftime('%s', 'now') - 86400 * 3 + 1300, 400000),
('p8-10', 'demo-q8', 'Coleman', 2, 'left', strftime('%s', 'now') - 86400 * 3 + 1000, strftime('%s', 'now') - 86400 * 3 + 1150, NULL);

UPDATE parties SET position_at_leave = 3, wait_ms_at_leave = 150000 WHERE id = 'p8-10';

-- Queue 9: 7 parties (5 served, 1 left, 1 no-show)
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p9-01', 'demo-q9', 'Jenkins', 2, 'served', strftime('%s', 'now') - 86400 * 2 + 100, strftime('%s', 'now') - 86400 * 2 + 520, 420000),
('p9-02', 'demo-q9', 'Perry', 3, 'served', strftime('%s', 'now') - 86400 * 2 + 200, strftime('%s', 'now') - 86400 * 2 + 650, 450000),
('p9-03', 'demo-q9', 'Powell', 2, 'served', strftime('%s', 'now') - 86400 * 2 + 300, strftime('%s', 'now') - 86400 * 2 + 750, 450000),
('p9-04', 'demo-q9', 'Long', 4, 'served', strftime('%s', 'now') - 86400 * 2 + 400, strftime('%s', 'now') - 86400 * 2 + 880, 480000),
('p9-05', 'demo-q9', 'Patterson', 2, 'served', strftime('%s', 'now') - 86400 * 2 + 500, strftime('%s', 'now') - 86400 * 2 + 950, 450000),
('p9-06', 'demo-q9', 'Hughes', 3, 'left', strftime('%s', 'now') - 86400 * 2 + 600, strftime('%s', 'now') - 86400 * 2 + 800, NULL),
('p9-07', 'demo-q9', 'Flores', 2, 'no_show', strftime('%s', 'now') - 86400 * 2 + 700, strftime('%s', 'now') - 86400 * 2 + 1100, NULL);

UPDATE parties SET position_at_leave = 4, wait_ms_at_leave = 200000 WHERE id = 'p9-06';

-- Queue 10: 8 parties (3 served, 1 left, 1 no-show, 2 called, 1 waiting) - Most recent active queue
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at, estimated_wait_ms) VALUES
('p10-01', 'demo-q10', 'Washington', 2, 'served', strftime('%s', 'now') - 86400 + 100, strftime('%s', 'now') - 86400 + 520, 420000),
('p10-02', 'demo-q10', 'Butler', 3, 'served', strftime('%s', 'now') - 86400 + 200, strftime('%s', 'now') - 86400 + 650, 450000),
('p10-03', 'demo-q10', 'Simmons', 2, 'served', strftime('%s', 'now') - 86400 + 300, strftime('%s', 'now') - 86400 + 750, 450000),
('p10-04', 'demo-q10', 'Foster', 4, 'left', strftime('%s', 'now') - 86400 + 400, strftime('%s', 'now') - 86400 + 600, NULL),
('p10-05', 'demo-q10', 'Bryant', 2, 'no_show', strftime('%s', 'now') - 86400 + 500, strftime('%s', 'now') - 86400 + 900, NULL),
('p10-06', 'demo-q10', 'Russell', 3, 'called', strftime('%s', 'now') - 3600, NULL, 420000),
('p10-07', 'demo-q10', 'Griffin', 2, 'called', strftime('%s', 'now') - 3000, NULL, 420000),
('p10-08', 'demo-q10', 'Hayes', 2, 'waiting', strftime('%s', 'now') - 2400, NULL, 420000);

UPDATE parties SET position_at_leave = 3, wait_ms_at_leave = 200000 WHERE id = 'p10-04';
UPDATE parties SET called_at = strftime('%s', 'now') - 300 WHERE id = 'p10-06';
UPDATE parties SET called_at = strftime('%s', 'now') - 120 WHERE id = 'p10-07';

-- Add 5 more no-show parties across queues to reach 18 total
INSERT INTO parties (id, session_id, name, size, status, joined_at, completed_at) VALUES
('p-ns-01', 'demo-q1', 'Diaz', 2, 'no_show', strftime('%s', 'now') - 86400 * 14 + 1500, strftime('%s', 'now') - 86400 * 14 + 1900),
('p-ns-02', 'demo-q2', 'Gray', 3, 'no_show', strftime('%s', 'now') - 86400 * 11 + 1100, strftime('%s', 'now') - 86400 * 11 + 1500),
('p-ns-03', 'demo-q5', 'James', 2, 'no_show', strftime('%s', 'now') - 86400 * 6 + 1200, strftime('%s', 'now') - 86400 * 6 + 1600),
('p-ns-04', 'demo-q8', 'Watson', 4, 'no_show', strftime('%s', 'now') - 86400 * 2 + 1100, strftime('%s', 'now') - 86400 * 2 + 1500),
('p-ns-05', 'demo-q10', 'Cruz', 2, 'no_show', strftime('%s', 'now') - 86400 + 700, strftime('%s', 'now') - 86400 + 1100);

-- Add 5 more waiting parties to reach 10 total
INSERT INTO parties (id, session_id, name, size, status, joined_at, estimated_wait_ms) VALUES
('p-w-01', 'demo-q1', 'Reyes', 2, 'waiting', strftime('%s', 'now') - 1800, 300000),
('p-w-02', 'demo-q2', 'Kelly', 3, 'waiting', strftime('%s', 'now') - 1500, 300000),
('p-w-03', 'demo-q4', 'Mills', 2, 'waiting', strftime('%s', 'now') - 1200, 300000),
('p-w-04', 'demo-q6', 'Stone', 4, 'waiting', strftime('%s', 'now') - 900, 300000),
('p-w-05', 'demo-q8', 'Gibson', 2, 'waiting', strftime('%s', 'now') - 600, 300000),
('p-w-06', 'demo-q9', 'Ford', 3, 'waiting', strftime('%s', 'now') - 300, 300000),
('p-w-07', 'demo-q10', 'Graham', 2, 'waiting', strftime('%s', 'now') - 180, 300000),
('p-w-08', 'demo-q10', 'Sullivan', 2, 'waiting', strftime('%s', 'now') - 60, 300000);

-- Now insert events to match the funnel and push stats
-- Using a recursive CTE to avoid SQLite's compound SELECT limit
-- Funnel: 120 QR scanned, 100 join started, 75 completed, 25 abandoned

-- Create a numbers table for generating events
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 120
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'qr_scanned',
  strftime('%s', 'now') - (n * 21600),
  '{"platform": "' || CASE (n % 5)
    WHEN 0 THEN 'ios_web' WHEN 1 THEN 'android_web' WHEN 2 THEN 'web'
    WHEN 3 THEN 'ios_web' ELSE 'android_web'
  END || '"}'
FROM nums;

-- Join Started events (100)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 100
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'join_started',
  strftime('%s', 'now') - (n * 25920),
  '{"platform": "' || CASE (n % 5)
    WHEN 0 THEN 'ios_web' WHEN 1 THEN 'android_web' WHEN 2 THEN 'web'
    WHEN 3 THEN 'ios_web' ELSE 'android_web'
  END || '"}'
FROM nums;

-- Join Completed events (75)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 75
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'join_completed',
  strftime('%s', 'now') - (n * 34560),
  '{"platform": "' || CASE (n % 5)
    WHEN 0 THEN 'ios_web' WHEN 1 THEN 'android_web' WHEN 2 THEN 'web'
    WHEN 3 THEN 'ios_web' ELSE 'android_web'
  END || '"}'
FROM nums;

-- Abandoned events (25)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 25
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'abandon_after_eta',
  strftime('%s', 'now') - (n * 103680),
  NULL
FROM nums;

-- Push notification events: 100 prompts, 90 granted, 10 denied
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 100
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'push_prompt_shown',
  strftime('%s', 'now') - (n * 25920),
  NULL
FROM nums;

-- Push granted (90)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 90
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'push_granted',
  strftime('%s', 'now') - (n * 28800),
  NULL
FROM nums;

-- Push denied (10)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 10
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'push_denied',
  strftime('%s', 'now') - (n * 259200),
  NULL
FROM nums;

-- Nudge sent (100)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 100
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'nudge_sent',
  strftime('%s', 'now') - (n * 25920),
  '{"kind": "pos_2"}'
FROM nums;

-- Nudge acked (90)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 90
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'nudge_ack',
  strftime('%s', 'now') - (n * 28800),
  NULL
FROM nums;

-- Host action events
-- Queue create completed (matches 10 queues we created)
INSERT INTO events (session_id, type, ts, details)
SELECT id, 'queue_create_completed', created_at, NULL FROM sessions WHERE id LIKE 'demo-q%';

-- Host call next events (70)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 70
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'host_call_next',
  strftime('%s', 'now') - (n * 37029),
  NULL
FROM nums;

-- Host call specific events (15)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 15
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'host_call_specific',
  strftime('%s', 'now') - (n * 172800),
  NULL
FROM nums;

-- Host close queue (for closed queues)
INSERT INTO events (session_id, type, ts, details)
SELECT id, 'host_close_queue', created_at + 86400, NULL FROM sessions WHERE id LIKE 'demo-q%' AND status = 'closed';

-- Trust survey events: 91 yes, 9 no for 91% accuracy
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 91
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'trust_survey_submitted',
  strftime('%s', 'now') - (n * 28462),
  '{"trust": "yes"}'
FROM nums;

WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 9
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'trust_survey_submitted',
  strftime('%s', 'now') - (n * 288000),
  '{"trust": "no"}'
FROM nums;

-- Page view events for the chart (300 spread across 30 days)
WITH RECURSIVE nums(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 300
)
INSERT INTO events (session_id, type, ts, details)
SELECT 
  'demo-q' || ((n % 10) + 1),
  'page_view',
  strftime('%s', 'now') - (n * 8640),
  '{"platform": "' || CASE (n % 5)
    WHEN 0 THEN 'ios_web' WHEN 1 THEN 'android_web' WHEN 2 THEN 'web'
    WHEN 3 THEN 'ios_web' ELSE 'android_web'
  END || '"}'
FROM nums;
