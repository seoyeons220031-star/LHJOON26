-- Close privilege-escalation: users must not be able to add themselves to
-- arbitrary conversations. All membership changes now go through the
-- SECURITY DEFINER RPCs (get_or_create_direct_conversation, create_group_conversation),
-- which bypass RLS. Direct client inserts are no longer permitted.
DROP POLICY IF EXISTS "Users add themselves to conversation" ON public.conversation_participants;

-- Harden the UPDATE policy so user_id / conversation_id cannot be swapped on update.
DROP POLICY IF EXISTS "Users update own participant row" ON public.conversation_participants;
CREATE POLICY "Users update own participant row"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Per-room theme
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS theme_slug TEXT NOT NULL DEFAULT 'mint';