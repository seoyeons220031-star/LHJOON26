// Tracks the conversation the user is currently viewing, so global message
// listeners can skip toasts for that room. Simple module-level ref.
let activeId: string | null = null;

export function setActiveConversation(id: string | null) {
  activeId = id;
}

export function getActiveConversation(): string | null {
  return activeId;
}
