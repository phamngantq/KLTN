-- Profile preferences can also be added by the application batch. Keep the
-- same quotas under concurrent writes and direct D1 access.
CREATE TRIGGER tutor_preference_grades_limit_insert
BEFORE INSERT ON tutor_preference_grades
WHEN (SELECT count(*) FROM tutor_preference_grades WHERE tutor_id = NEW.tutor_id) >= 14
BEGIN SELECT RAISE(ABORT, 'PROFILE_PREFERENCE_LIMIT'); END;

CREATE TRIGGER tutor_preference_areas_limit_insert
BEFORE INSERT ON tutor_preference_areas
WHEN (SELECT count(*) FROM tutor_preference_areas WHERE tutor_id = NEW.tutor_id) >= 12
BEGIN SELECT RAISE(ABORT, 'PROFILE_PREFERENCE_LIMIT'); END;
