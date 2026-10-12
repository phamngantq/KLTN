-- "Thời gian có thể học" no longer caps a request at 14 weekly windows. Keep the
-- overlap guard; the count bound matches REQUEST_MAX_WINDOWS (anti-abuse only).
DROP TRIGGER request_schedule_windows_valid;
CREATE TRIGGER request_schedule_windows_valid BEFORE INSERT ON request_schedule_windows
WHEN (SELECT count(*) FROM request_schedule_windows WHERE request_id = NEW.request_id) >= 168 OR
  EXISTS (SELECT 1 FROM request_schedule_windows
          WHERE request_id = NEW.request_id AND weekday = NEW.weekday
            AND start_local < NEW.end_local AND end_local > NEW.start_local)
BEGIN
  SELECT RAISE(ABORT, 'REQUEST_WINDOWS_INVALID');
END;
