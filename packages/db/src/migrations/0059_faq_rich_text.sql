ALTER TABLE "faq_entry" ADD COLUMN "question_en_rich" jsonb;--> statement-breakpoint
ALTER TABLE "faq_entry" ADD COLUMN "question_id_rich" jsonb;--> statement-breakpoint
ALTER TABLE "faq_entry" ADD COLUMN "answer_en_rich" jsonb;--> statement-breakpoint
ALTER TABLE "faq_entry" ADD COLUMN "answer_id_rich" jsonb;--> statement-breakpoint
CREATE FUNCTION faq_plain_to_rich_document(input_text text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'type', 'doc',
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'type', 'paragraph',
        'content', CASE
          WHEN COALESCE(input_text, '') = '' THEN '[]'::jsonb
          ELSE jsonb_build_array(jsonb_build_object('text', input_text))
        END
      )
    )
  )
$$;--> statement-breakpoint
CREATE FUNCTION faq_answer_blocks_to_rich_document(legacy_blocks jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'type', 'doc',
    'blocks', COALESCE(
      jsonb_agg(
        CASE block->>'type'
          WHEN 'paragraph' THEN jsonb_build_object(
            'type', 'paragraph',
            'content', CASE
              WHEN COALESCE(block->>'text', '') = '' THEN '[]'::jsonb
              ELSE jsonb_build_array(jsonb_build_object('text', block->>'text'))
            END
          )
          WHEN 'list' THEN jsonb_build_object(
            'type', 'list',
            'style', block->>'style',
            'items', COALESCE((
              SELECT jsonb_agg(
                CASE WHEN item.value = '' THEN '[]'::jsonb
                ELSE jsonb_build_array(jsonb_build_object('text', item.value))
                END
                ORDER BY item.ordinality
              )
              FROM jsonb_array_elements_text(COALESCE(block->'items', '[]'::jsonb))
                WITH ORDINALITY AS item(value, ordinality)
            ), '[]'::jsonb)
          )
          ELSE jsonb_build_object('type', 'paragraph', 'content', '[]'::jsonb)
        END
        ORDER BY entry.ordinality
      ),
      '[]'::jsonb
    )
  )
  FROM jsonb_array_elements(COALESCE(legacy_blocks, '[]'::jsonb))
    WITH ORDINALITY AS entry(block, ordinality)
$$;--> statement-breakpoint
UPDATE "faq_entry"
SET
  "question_en_rich" = faq_plain_to_rich_document("question_en"),
  "question_id_rich" = CASE
    WHEN "question_id" IS NULL OR btrim("question_id") = '' THEN NULL
    ELSE faq_plain_to_rich_document("question_id")
  END,
  "answer_en_rich" = faq_answer_blocks_to_rich_document("answer_en"),
  "answer_id_rich" = CASE
    WHEN "answer_id" IS NULL OR "answer_id" = '[]'::jsonb THEN NULL
    ELSE faq_answer_blocks_to_rich_document("answer_id")
  END;--> statement-breakpoint
ALTER TABLE "faq_entry" ALTER COLUMN "question_en_rich" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "faq_entry" ALTER COLUMN "answer_en_rich" SET NOT NULL;--> statement-breakpoint
DROP FUNCTION faq_plain_to_rich_document(text);--> statement-breakpoint
DROP FUNCTION faq_answer_blocks_to_rich_document(jsonb);
