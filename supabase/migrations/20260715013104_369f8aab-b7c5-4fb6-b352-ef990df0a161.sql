
-- Message attachments + edit/delete + pin + mute
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT;

ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;

-- Allow sender to update/delete own messages
DROP POLICY IF EXISTS "Sender updates own message" ON public.messages;
CREATE POLICY "Sender updates own message" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Sender deletes own message" ON public.messages;
CREATE POLICY "Sender deletes own message" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- Enable realtime UPDATE/DELETE payloads
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

-- Add tables to realtime publication (safe if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage policies for chat-files bucket (bucket created via tool)
DROP POLICY IF EXISTS "Chat files participants read" ON storage.objects;
CREATE POLICY "Chat files participants read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND public.is_conversation_participant(
      (split_part(name, '/', 1))::uuid,
      auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat files participants upload" ON storage.objects;
CREATE POLICY "Chat files participants upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND public.is_conversation_participant(
      (split_part(name, '/', 1))::uuid,
      auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat files owner delete" ON storage.objects;
CREATE POLICY "Chat files owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND owner = auth.uid());
