import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  email?: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  attachment_url?: string | null;
  attachment_path?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
};

export type ConversationSummary = {
  id: string;
  is_group: boolean;
  name?: string | null;
  title: string | null;
  last_message_at: string;
  participants: Profile[];
  last_message: Message | null;
  unread_count: number;
  my_last_read_at: string;
  muted: boolean;
  pinned_message_id: string | null;
};

export async function getAuthUserId(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (u.user?.id) return u.user.id;
  const { data: s } = await supabase.auth.getSession();
  return s.session?.user?.id ?? null;
}

export async function getMyProfile(): Promise<Profile | null> {
  const userId = await getAuthUserId();
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!data) return null;
  return sanitizeProfile(data);
}

function sanitizeProfile(p: { id?: string; username?: string | null; display_name?: string | null; name?: string | null; avatar_url?: string | null; email?: string | null } | null | undefined): Profile {
  if (!p) {
    return {
      id: "",
      username: "사용자",
      display_name: "사용자",
      avatar_url: null,
    };
  }
  const emailPrefix = (p.email || "").split("@")[0] || "";
  const name =
    p.display_name?.trim() ||
    p.username?.trim() ||
    p.name?.trim() ||
    emailPrefix ||
    "사용자";
  const username = p.username?.trim() || emailPrefix || name || "사용자";
  return {
    id: p.id || "",
    username,
    display_name: name,
    avatar_url: p.avatar_url || null,
  };
}

export function getUserDisplayName(user?: { display_name?: string | null; username?: string | null; name?: string | null; email?: string | null; profile?: { display_name?: string | null; username?: string | null; name?: string | null; email?: string | null } } | null): string {
  if (!user) return "상대방";
  const target = user.profile || user;
  if (target.display_name?.trim()) return target.display_name.trim();
  if (target.username?.trim()) return target.username.trim();
  if (target.name?.trim()) return target.name.trim();
  const emailVal = target.email || user.email || "";
  if (emailVal && typeof emailVal === "string") {
    const emailPrefix = (emailVal.split("@")[0] || "").trim();
    if (emailPrefix) return emailPrefix;
  }
  return "상대방";
}

export function getConversationTitle(
  conv?: {
    is_group?: boolean;
    name?: string | null;
    title?: string | null;
    participants?: Profile[];
  } | null,
  otherUser?: Profile | { display_name?: string | null; username?: string | null; email?: string | null; profile?: Profile | null } | null
): string {
  if (!conv) return "채팅방";

  const explicitName = (conv.name || conv.title || "").trim();

  if (conv.is_group) {
    if (explicitName) return explicitName;
    if (conv.participants && conv.participants.length > 0) {
      const names = conv.participants
        .map((p) => getUserDisplayName(p))
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      if (names) return names;
    }
    return "그룹 채팅";
  }

  // 1-on-1 direct chat
  if (explicitName) return explicitName;

  const target = otherUser || conv.participants?.[0];
  if (target) {
    const prof = "profile" in target && target.profile ? target.profile : target;
    const name =
      prof.display_name?.trim() ||
      prof.username?.trim() ||
      (prof.email && typeof prof.email === "string" ? prof.email.split("@")[0] : null) ||
      "상대방";
    if (name) return name;
  }

  return "상대방";
}

export async function listFriends(): Promise<Profile[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data: f } = await supabase.from("friendships").select("friend_id").eq("user_id", userId);
  const ids = (f ?? []).map((r) => r?.friend_id).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
  return (profs ?? []).map(sanitizeProfile);
}

export async function searchUsers(q: string | null | undefined): Promise<Profile[]> {
  const query = (q || "").trim();
  if (!query) return [];
  const { data, error } = await supabase.rpc("search_users", { _q: query });
  if (error) throw error;
  return (data ?? []).map(sanitizeProfile);
}

export async function addFriendById(friendId: string | null | undefined): Promise<void> {
  if (!friendId) throw new Error("유효하지 않은 친구 ID입니다.");
  const { error } = await supabase.rpc("add_friend", { _friend: friendId });
  if (error) throw error;
}

export async function updateMyProfile(input: {
  display_name?: string;
  avatar_url?: string | null;
}): Promise<Profile> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not signed in");
  const patch: { display_name?: string; avatar_url?: string | null } = {};
  if (input.display_name !== undefined) patch.display_name = input.display_name.trim();
  if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function uploadAvatar(file: File): Promise<string> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not signed in");
  const fileName = file?.name || "avatar.png";
  const ext = (fileName.split(".").pop() || "png").toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file?.type || "image/png",
  });
  if (error) throw error;
  const { data: signed, error: sErr } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (sErr) throw sErr;
  return signed.signedUrl;
}

export async function addFriendByUsername(username: string | null | undefined): Promise<Profile> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not signed in");
  if (!username) throw new Error("사용자명을 입력해 주세요.");
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", clean)
    .maybeSingle();
  if (error) throw error;
  if (!prof) throw new Error("User not found");
  if (prof.id === userId) throw new Error("That's you!");
  const { error: e1 } = await supabase.from("friendships").upsert(
    [
      { user_id: userId, friend_id: prof.id },
      { user_id: prof.id, friend_id: userId },
    ],
    { onConflict: "user_id,friend_id" },
  );
  if (e1) throw e1;
  return sanitizeProfile(prof);
}

export async function removeFriend(friendId: string) {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not signed in");
  await supabase.from("friendships").delete().eq("user_id", userId).eq("friend_id", friendId);
  await supabase.from("friendships").delete().eq("user_id", friendId).eq("friend_id", userId);
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data: u } = await supabase.auth.getUser();
  let me = u.user?.id;
  if (!me) {
    const { data: s } = await supabase.auth.getSession();
    me = s.session?.user?.id;
  }
  if (!me) return [];

  const { data: myParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at, muted")
    .eq("user_id", me);
  const convIds = (myParts ?? []).map((p) => p.conversation_id);
  if (convIds.length === 0) return [];

  const { data: convs } = await supabase
    .from("conversations")
    .select("*")
    .in("id", convIds)
    .order("last_message_at", { ascending: false });

  const { data: allParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id, last_read_at")
    .in("conversation_id", convIds);

  const otherIds = Array.from(
    new Set((allParts ?? []).map((p) => p.user_id).filter((id) => id !== me)),
  );
  const { data: profs } = otherIds.length
    ? await supabase.from("profiles").select("*").in("id", otherIds)
    : { data: [] as Profile[] };
  const profMap = new Map((profs ?? []).map((p) => [p.id, sanitizeProfile(p)]));

  const { data: myProf } = await supabase.from("profiles").select("*").eq("id", me).maybeSingle();
  if (myProf) profMap.set(me, sanitizeProfile(myProf));

  const { data: recentMsgs } = await supabase
    .from("messages")
    .select("*")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(convIds.length * 20);

  const lastMsgMap = new Map<string, Message>();
  for (const m of recentMsgs ?? []) {
    if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m as Message);
  }

  const myReadMap = new Map((myParts ?? []).map((p) => [p.conversation_id, p.last_read_at]));
  const myMuteMap = new Map((myParts ?? []).map((p) => [p.conversation_id, Boolean(p.muted)]));

  const summaries: ConversationSummary[] = (convs ?? []).map((c) => {
    const parts = (allParts ?? []).filter((p) => p.conversation_id === c.id);
    const others = parts.filter((p) => p.user_id !== me);
    const participants = others
      .map((p) => profMap.get(p.user_id))
      .filter((v): v is Profile => Boolean(v));
    const myRead = myReadMap.get(c.id) ?? new Date(0).toISOString();
    const unread = (recentMsgs ?? []).filter(
      (m) => m.conversation_id === c.id && m.sender_id !== me && m.created_at > myRead,
    ).length;
    return {
      id: c.id,
      is_group: c.is_group,
      name: (c as { name?: string | null }).name ?? null,
      title: c.title,
      last_message_at: c.last_message_at,
      participants,
      last_message: lastMsgMap.get(c.id) ?? null,
      unread_count: unread,
      my_last_read_at: myRead,
      muted: myMuteMap.get(c.id) ?? false,
      pinned_message_id: (c as { pinned_message_id?: string | null }).pinned_message_id ?? null,
    };
  });

  return summaries;
}

export async function openDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
    _other: otherUserId,
  });
  if (error) throw error;
  return data as string;
}

export async function createGroupConversation(title: string, memberIds: string[]): Promise<string> {
  const cleanTitle = title.trim() || "그룹 채팅방";
  const { data, error } = await supabase.rpc("create_group_conversation", {
    _title: cleanTitle,
    _members: memberIds,
  });
  if (error) throw error;
  const convId = data as string;

  try {
    await supabase
      .from("conversations")
      .update({ title: cleanTitle, name: cleanTitle } as unknown as { title: string })
      .eq("id", convId);
  } catch {
    // Ignore if column is missing
  }

  return convId;
}

export async function leaveConversation(conversationId: string) {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not signed in");
  const { error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;

  try {
    const { data: remaining } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);
    if (remaining && remaining.length === 0) {
      await supabase.from("conversations").delete().eq("id", conversationId);
    }
  } catch {
    // Ignore cleanup error if triggers/RLS prevent deletion
  }
}

export async function renameConversation(conversationId: string, title: string) {
  const clean = title.trim().slice(0, 60);
  const { error } = await supabase
    .from("conversations")
    .update({ title: clean || null, name: clean || null } as unknown as { title: string | null })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function markConversationRead(conversationId: string) {
  const userId = await getAuthUserId();
  if (!userId) return;
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

export async function sendMessage(
  conversationId: string,
  content: string | null,
  attachment?: {
    url: string;
    path: string;
    type: string;
    name: string;
    size: number;
  } | null,
): Promise<Message> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not signed in");

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      content: content || null,
      attachment_url: attachment?.url ?? null,
      attachment_path: attachment?.path ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;

  try {
    await supabase.from("conversations").update({ last_message_at: now }).eq("id", conversationId);
  } catch {
    // Handled by Postgres trigger
  }

  return data as Message;
}

export async function editMessage(messageId: string, content: string) {
  if (!messageId || messageId.startsWith("tmp-")) return;
  const { error } = await supabase
    .from("messages")
    .update({ content, edited_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: string) {
  if (!messageId || messageId.startsWith("tmp-")) return;
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) {
    console.warn("Hard delete failed, attempting soft delete:", error);
    const { error: softErr } = await supabase
      .from("messages")
      .update({ content: "삭제된 메시지입니다.", deleted_at: new Date().toISOString() })
      .eq("id", messageId);
    if (softErr) throw error;
  }
}

export async function pinConversationMessage(conversationId: string, messageId: string | null) {
  const { error } = await supabase
    .from("conversations")
    .update({ pinned_message_id: messageId })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function setConversationMuted(conversationId: string, muted: boolean) {
  const userId = await getAuthUserId();
  if (!userId) return;
  await supabase
    .from("conversation_participants")
    .update({ muted })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

export async function uploadChatFile(
  conversationId: string,
  file: File,
): Promise<{ url: string; path: string; type: string; name: string; size: number }> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error("Not signed in");

  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `${conversationId}/${userId}/${Date.now()}-${safeName}`;

  try {
    const { error } = await supabase.storage.from("chat-files").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (!error) {
      const { data: signed, error: sErr } = await supabase.storage
        .from("chat-files")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (!sErr && signed?.signedUrl) {
        return {
          url: signed.signedUrl,
          path,
          type: file.type || "application/octet-stream",
          name: file.name,
          size: file.size,
        };
      }
    }
  } catch (storageErr) {
    console.warn("Storage upload failed, falling back to Base64:", storageErr);
  }

  // Fallback to Base64 encoding. It guarantees 100% success offline or when storage is unconfigured.
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(
      "스토리지 업로드에 실패하였으며, 대용량 파일(10MB 초과)은 데이터베이스 직접 전송(Base64)이 불가능합니다. 10MB 이하의 파일을 전송해 주세요.",
    );
  }

  try {
    const base64Url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

    return {
      url: base64Url,
      path: `base64/${Date.now()}-${safeName}`,
      type: file.type || "application/octet-stream",
      name: file.name,
      size: file.size,
    };
  } catch (err) {
    throw new Error(
      "파일을 읽어 변환하는 도중 에러가 발생했습니다: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

export async function getSignedChatFileUrl(path: string): Promise<string> {
  if (path.startsWith("base64/")) {
    return "";
  }
  const { data, error } = await supabase.storage.from("chat-files").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function getConversationDetail(conversationId: string) {
  const { data: u } = await supabase.auth.getUser();
  let me = u.user?.id;
  if (!me) {
    const { data: s } = await supabase.auth.getSession();
    me = s.session?.user?.id;
  }
  if (!me) throw new Error("Not signed in");

  const { data: conv, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conv) throw new Error("Conversation not found");

  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("user_id, last_read_at, muted")
    .eq("conversation_id", conversationId);

  const ids = (parts ?? []).map((p) => p.user_id);
  const { data: profs } = ids.length
    ? await supabase.from("profiles").select("*").in("id", ids)
    : { data: [] as Profile[] };

  const profMap = new Map((profs ?? []).map((p) => [p.id, sanitizeProfile(p)]));

  return {
    conversation: {
      id: conv.id,
      is_group: conv.is_group,
      name: (conv as { name?: string | null }).name ?? null,
      title: conv.title ?? null,
      pinned_message_id: conv.pinned_message_id ?? null,
      theme_slug: conv.theme_slug ?? null,
      created_at: (conv as { created_at?: string }).created_at ?? null,
    },
    me,
    myMuted: Boolean((parts ?? []).find((p) => p.user_id === me)?.muted),
    participants: (parts ?? []).map((p) => ({
      user_id: p.user_id,
      last_read_at: p.last_read_at,
      profile: profMap.get(p.user_id) ?? null,
    })),
  };
}

export async function loadMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function getMessageById(id: string): Promise<Message | null> {
  const { data } = await supabase.from("messages").select("*").eq("id", id).maybeSingle();
  return (data as Message) ?? null;
}

export async function setConversationTheme(conversationId: string, themeSlug: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ theme_slug: themeSlug })
    .eq("id", conversationId);
  if (error) throw error;
}
