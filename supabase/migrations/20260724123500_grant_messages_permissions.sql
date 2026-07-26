-- Grant UPDATE and DELETE on messages to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

-- Grant DELETE on conversations to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;

-- Ensure RLS policies exist for messages update and delete
DROP POLICY IF EXISTS "Sender updates own message" ON public.messages;
CREATE POLICY "Sender updates own message" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Sender deletes own message" ON public.messages;
CREATE POLICY "Sender deletes own message" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- Allow conversation deletion if user is a participant or creator
DROP POLICY IF EXISTS "Participants delete conversation" ON public.conversations;
CREATE POLICY "Participants delete conversation" ON public.conversations
  FOR DELETE TO authenticated
  USING (public.is_conversation_participant(id, auth.uid()));
