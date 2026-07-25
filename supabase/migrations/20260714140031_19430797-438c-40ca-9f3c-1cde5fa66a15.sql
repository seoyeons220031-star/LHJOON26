-- Search users by email, username, or display_name
CREATE OR REPLACE FUNCTION public.search_users(_q text)
RETURNS TABLE (id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE _q IS NOT NULL AND length(trim(_q)) > 0
    AND p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      p.username ILIKE '%' || trim(_q) || '%'
      OR p.display_name ILIKE '%' || trim(_q) || '%'
      OR u.email ILIKE '%' || trim(_q) || '%'
    )
  LIMIT 20;
$$;

-- Add friend by user id (bidirectional)
CREATE OR REPLACE FUNCTION public.add_friend(_friend uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _me = _friend THEN RAISE EXCEPTION 'Cannot friend yourself'; END IF;
  INSERT INTO public.friendships (user_id, friend_id) VALUES (_me, _friend)
    ON CONFLICT DO NOTHING;
  INSERT INTO public.friendships (user_id, friend_id) VALUES (_friend, _me)
    ON CONFLICT DO NOTHING;
END;
$$;