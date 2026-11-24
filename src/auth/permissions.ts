/** UI-only gating. The database (RLS + has_permission) is the real enforcement. */
export function can(perms: ReadonlySet<string>, permission: string): boolean {
  return perms.has('*') || perms.has(permission)
}
