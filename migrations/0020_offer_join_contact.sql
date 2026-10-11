-- Offer tutors and joining parents supply private phone numbers in their own
-- forms. Public offer and pre-approval tutor projections must not select them.
ALTER TABLE tutor_student_offers ADD COLUMN contact_phone TEXT
  CHECK (contact_phone IS NULL OR (length(contact_phone) BETWEEN 8 AND 16
    AND contact_phone NOT GLOB '*[^0-9+]*'
    AND instr(substr(contact_phone, 2), '+') = 0));
ALTER TABLE tutor_student_offers ADD COLUMN contact_share_consent_at TEXT;
ALTER TABLE tutor_student_offers ADD COLUMN contact_share_consent_version TEXT;
ALTER TABLE tutor_offer_contract_acks ADD COLUMN contact_share_consent_at TEXT;
ALTER TABLE tutor_offer_contract_acks ADD COLUMN contact_share_consent_version TEXT;
ALTER TABLE tutor_offer_join_requests ADD COLUMN contact_phone TEXT
  CHECK (contact_phone IS NULL OR (length(contact_phone) BETWEEN 8 AND 16
    AND contact_phone NOT GLOB '*[^0-9+]*'
    AND instr(substr(contact_phone, 2), '+') = 0));

-- Existing tutor offers are retained, but an offer without both phone and
-- versioned consent cannot receive a new parent join request.
CREATE TRIGGER tutor_student_offers_new_phone BEFORE INSERT ON tutor_student_offers
WHEN NEW.contact_phone IS NULL
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_PHONE_REQUIRED'); END;
CREATE TRIGGER tutor_student_offers_phone_immutable BEFORE UPDATE OF contact_phone
  ON tutor_student_offers
WHEN OLD.status IN ('pending', 'published')
  OR (OLD.status = 'closed' AND NEW.contact_phone IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'submitted tutor offer phone is immutable'); END;
CREATE TRIGGER tutor_student_offers_contact_consent_immutable BEFORE UPDATE OF
  contact_share_consent_at, contact_share_consent_version ON tutor_student_offers
WHEN OLD.status IN ('pending', 'published', 'closed')
BEGIN SELECT RAISE(ABORT, 'submitted tutor offer consent is immutable'); END;
CREATE TRIGGER tutor_student_offers_submit_contact BEFORE UPDATE OF status ON tutor_student_offers
WHEN NEW.status = 'pending' AND (
  NEW.contact_phone IS NULL OR NEW.contact_share_consent_at IS NULL
  OR NEW.contact_share_consent_version IS NULL OR NOT EXISTS (
    SELECT 1 FROM tutor_offer_contract_acks a
    WHERE a.offer_id = NEW.id AND a.offer_version = OLD.version
      AND a.contact_share_consent_at = NEW.contact_share_consent_at
      AND a.contact_share_consent_version = NEW.contact_share_consent_version
  )
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_CONTACT_CONSENT_REQUIRED'); END;
CREATE TRIGGER tutor_offer_join_requests_phone_gate BEFORE INSERT ON tutor_offer_join_requests
WHEN NEW.contact_phone IS NULL OR NOT EXISTS (
  SELECT 1 FROM tutor_student_offers o WHERE o.id = NEW.offer_id
    AND o.contact_phone IS NOT NULL AND o.contact_share_consent_at IS NOT NULL
    AND o.contact_share_consent_version IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_JOIN_CONTACT_NOT_READY'); END;
CREATE TRIGGER tutor_offer_join_requests_phone_immutable BEFORE UPDATE OF contact_phone
  ON tutor_offer_join_requests
WHEN NOT (OLD.status IN ('withdrawn', 'rejected', 'completed', 'revoked')
  AND NEW.contact_phone IS NULL)
BEGIN SELECT RAISE(ABORT, 'tutor offer join contact is immutable'); END;
-- A tombstoned parent's grade and free text are scrubbed after the join has
-- ended; live applications keep their original consented details.
DROP TRIGGER tutor_offer_join_requests_identity_immutable;
CREATE TRIGGER tutor_offer_join_requests_identity_immutable BEFORE UPDATE OF
  id, offer_id, parent_user_id, offer_version, details_consent_version,
  details_consented_at, contact_consent_version, contact_consented_at, created_at
  ON tutor_offer_join_requests
BEGIN SELECT RAISE(ABORT, 'tutor offer join identity is immutable'); END;
CREATE TRIGGER tutor_offer_join_requests_grade_redaction BEFORE UPDATE OF student_grade
  ON tutor_offer_join_requests
WHEN NOT (OLD.status IN ('withdrawn', 'rejected', 'completed', 'revoked')
  AND NEW.student_grade = 'Đã ẩn')
BEGIN SELECT RAISE(ABORT, 'tutor offer join grade is immutable'); END;
CREATE TRIGGER tutor_offer_join_requests_approve_gate BEFORE UPDATE OF status
  ON tutor_offer_join_requests
WHEN NEW.status = 'approved' AND (
  NEW.contact_phone IS NULL OR NEW.contact_consent_version IS NULL
  OR NEW.contact_consented_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM tutor_student_offers o
    JOIN users tutor ON tutor.id = o.tutor_user_id
    JOIN users parent ON parent.id = NEW.parent_user_id
    WHERE o.id = NEW.offer_id AND o.status = 'published'
      AND o.contact_phone IS NOT NULL AND o.contact_share_consent_at IS NOT NULL
      AND o.contact_share_consent_version IS NOT NULL
      AND tutor.status = 'active' AND parent.status = 'active'
  )
)
BEGIN SELECT RAISE(ABORT, 'TUTOR_OFFER_JOIN_APPROVAL_NOT_ALLOWED'); END;
