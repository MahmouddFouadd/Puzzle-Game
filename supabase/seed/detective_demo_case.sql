-- Detective Mode demo seed
-- TEST/STAGING ONLY. Never run this against production without explicit approval.
-- Requires migration 0012_detective_mode_foundation.sql and at least one auth.users row.
-- The seed uses the first auth user as the test owner and creates a published demo case.

DO $$
DECLARE
  v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Create a test auth user before running this seed';
  END IF;

  INSERT INTO detective_cases (id, slug, title, title_ar, description, description_ar, case_type, difficulty, age_min, age_max, status, created_by, published_at)
  VALUES ('10000000-0000-0000-0000-000000000001', 'the-midnight-blueprint', 'The Midnight Blueprint', 'مخطط منتصف الليل', 'A cooperative starter case about a missing blueprint.', 'قضية تعاونية قصيرة عن مخطط مفقود.', 'QUICK', 1, 8, 14, 'PUBLISHED', v_user, now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_case_versions (id, case_id, version_number, status, created_by, approved_by, published_at)
  VALUES ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 1, 'PUBLISHED', v_user, v_user, now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_scenes (id, version_id, position, title, title_ar, image_path, introduction, introduction_ar)
  VALUES
    ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 1, 'The Study', 'غرفة الدراسة', 'demo/detective/scene-1.svg', 'The study was locked, but three details stand out.', 'كانت غرفة الدراسة مغلقة، لكن ثلاث علامات لافتة ظهرت.'),
    ('10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 2, 'The Garden', 'الحديقة', 'demo/detective/scene-2.svg', 'A trail leads from the study to the garden.', 'يقود أثر واضح من غرفة الدراسة إلى الحديقة.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_stages (id, version_id, stage_key, position, title, title_ar, unlock_rule)
  VALUES
    ('10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000002', 'observe', 1, 'Observe', 'لاحظ', '{}'::jsonb),
    ('10000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000002', 'connect', 2, 'Connect the clues', 'اربط الأدلة', '{"requires_stage":"observe"}'::jsonb),
    ('10000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000002', 'conclude', 3, 'Make a conclusion', 'استنتج الحل', '{"requires_stage":"connect"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_evidence (id, scene_id, evidence_key, internal_title, public_title, public_title_ar, x, y, width, height, public_description, public_description_ar, admin_explanation, classification, importance, unlock_rule)
  VALUES
    ('10000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000011', 'gold-seal', 'Gold seal', 'A gold seal', 'ختم ذهبي', 14, 20, 16, 18, 'A seal with a star-shaped mark.', 'ختم يحمل علامة على شكل نجمة.', 'The seal matches the workshop stamp.', 'FACT', 4, '{}'::jsonb),
    ('10000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000011', 'open-window', 'Open window', 'An open window', 'نافذة مفتوحة', 59, 25, 18, 24, 'The window is open despite the rain.', 'النافذة مفتوحة رغم المطر.', 'The window explains the wet trail.', 'OBSERVATION', 3, '{}'::jsonb),
    ('10000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000012', 'wet-trail', 'Wet trail', 'A wet trail', 'أثر مبلل', 68, 52, 20, 22, 'Small wet footprints lead toward the garden shed.', 'آثار أقدام مبللة تتجه نحو مخزن الحديقة.', 'The trail links the window to the missing blueprint.', 'INFERENCE', 5, '{"requires_evidence":["10000000-0000-0000-0000-000000000032"]}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_evidence_relations (id, version_id, from_evidence_id, to_evidence_id, relation_type, public_explanation)
  VALUES
    ('10000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000033', 'TEMPORAL', 'The open window explains how the wet trail began.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_questions (id, version_id, stage_id, question_type, prompt, prompt_ar, options, answer_key, accepted_alternatives, explanation, explanation_ar, associated_evidence, points, penalty, position)
  VALUES
    ('10000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000021', 'MULTIPLE_CHOICE', 'Which clue is directly linked to the workshop?', 'ما الدليل المرتبط مباشرة بالورشة؟', '[{"id":"seal","text":"The gold seal"},{"id":"window","text":"The open window"},{"id":"trail","text":"The wet trail"}]'::jsonb, '{"option_id":"seal"}'::jsonb, '[]'::jsonb, 'The star seal matches the workshop stamp.', 'الختم ذو النجمة يطابق ختم الورشة.', ARRAY['10000000-0000-0000-0000-000000000031']::uuid[], 10, -5, 1),
    ('10000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000022', 'EVIDENCE_RELATIONSHIP', 'What connects the window and the trail?', 'ما الذي يربط النافذة بالأثر؟', '[]'::jsonb, '{"from":"10000000-0000-0000-0000-000000000032","to":"10000000-0000-0000-0000-000000000033","relation":"TEMPORAL"}'::jsonb, '[]'::jsonb, 'The window was open while rain made the trail.', 'كانت النافذة مفتوحة أثناء هطول المطر فتكوّن الأثر.', ARRAY['10000000-0000-0000-0000-000000000032','10000000-0000-0000-0000-000000000033']::uuid[], 15, -5, 2),
    ('10000000-0000-0000-0000-000000000053', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000023', 'FINAL_CONCLUSION', 'Where should investigators search next?', 'أين يجب أن يبحث المحققون بعد ذلك؟', '[]'::jsonb, '{"answer":"garden shed"}'::jsonb, '[{"answer":"the garden shed"}]'::jsonb, 'The wet footprints lead to the garden shed.', 'تقود آثار الأقدام المبللة إلى مخزن الحديقة.', ARRAY['10000000-0000-0000-0000-000000000033']::uuid[], 25, -10, 3)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_suspects (id, version_id, name, name_ar, description, description_ar, relationship, background, timeline, alibi)
  VALUES
    ('10000000-0000-0000-0000-000000000061', '10000000-0000-0000-0000-000000000002', 'Mina', 'مينا', 'The workshop assistant.', 'مساعدة الورشة.', 'Assistant', 'Knows the workshop stamps.', '[{"event":"18:00","label":"Leaves workshop"}]'::jsonb, 'I was sorting tools.'),
    ('10000000-0000-0000-0000-000000000062', '10000000-0000-0000-0000-000000000002', 'Omar', 'عمر', 'The garden helper.', 'مساعد الحديقة.', 'Gardener', 'Has access to the shed.', '[{"event":"18:15","label":"Checks garden"}]'::jsonb, 'I was watering plants.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_statements (id, suspect_id, statement, statement_ar, truth_status, conflicting_evidence, admin_explanation)
  VALUES
    ('10000000-0000-0000-0000-000000000071', '10000000-0000-0000-0000-000000000061', 'I never entered the garden.', 'لم أدخل الحديقة أبدًا.', 'TRUE', '{}', 'No evidence contradicts Mina.'),
    ('10000000-0000-0000-0000-000000000072', '10000000-0000-0000-0000-000000000062', 'The garden was dry all evening.', 'كانت الحديقة جافة طوال المساء.', 'FALSE', '{"10000000-0000-0000-0000-000000000033"}', 'The wet trail contradicts the statement.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_hints (id, version_id, stage_id, hint_text, hint_text_ar, unlock_rule, penalty, position)
  VALUES
    ('10000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000022', 'Compare what the window explains with where the trail ends.', 'قارن ما تفسره النافذة بمكان انتهاء الأثر.', '{"requires_discoveries":2}'::jsonb, -2, 1),
    ('10000000-0000-0000-0000-000000000082', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000023', 'Follow the wet footprints.', 'اتبع آثار الأقدام المبللة.', '{"requires_discoveries":3}'::jsonb, -3, 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_solutions (id, version_id, public_reveal, public_reveal_ar, solution_key, alternative_hypotheses, educational_explanation, educational_explanation_ar)
  VALUES ('10000000-0000-0000-0000-000000000091', '10000000-0000-0000-0000-000000000002', 'The blueprint is in the garden shed; the wet trail is the key link.', 'المخطط في مخزن الحديقة؛ والأثر المبلل هو حلقة الربط الأساسية.', '{"location":"garden shed","key_evidence":["10000000-0000-0000-0000-000000000032","10000000-0000-0000-0000-000000000033"]}'::jsonb, '[]'::jsonb, 'Good investigators separate observations from assumptions and connect clues in time.', 'يفصل المحقق الجيد بين الملاحظات والافتراضات ويربط الأدلة زمنيًا.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_timeline_events (id, version_id, event_key, label, label_ar, window_key, position)
  VALUES
    ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', 'rain', 'Rain begins', 'يبدأ المطر', '18:00', 1),
    ('10000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'window', 'Window opens', 'تُفتح النافذة', '18:05', 2),
    ('10000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000002', 'trail', 'Trail appears', 'يظهر الأثر', '18:10', 3)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_sessions (id, room_id, version_id, mode, sharing, status, started_at, created_by)
  VALUES ('10000000-0000-0000-0000-0000000000b1', NULL, '10000000-0000-0000-0000-000000000002', 'SOLO', 'PRIVATE', 'PLAYING', now(), v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO detective_player_progress (session_id, user_id, current_stage_id)
  VALUES ('10000000-0000-0000-0000-0000000000b1', v_user, '10000000-0000-0000-0000-000000000021')
  ON CONFLICT (session_id, user_id) DO NOTHING;
END $$;

-- Optional verification reads (safe, bounded, and read-only):
-- select id, slug, status from detective_cases where slug = 'the-midnight-blueprint' limit 10;
-- select id, position, title from detective_scenes where version_id = '10000000-0000-0000-0000-000000000002' order by position limit 10;
