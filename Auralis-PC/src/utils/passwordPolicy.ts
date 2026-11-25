export function validateNewPassword(password: string): 'requirements' | 'tooLong' | null {
  if (new TextEncoder().encode(password).byteLength > 72) return 'tooLong'
  if (password.length < 8
    || !/\p{Lu}/u.test(password)
    || !/\p{Ll}/u.test(password)
    || !/[\p{P}\p{S}]/u.test(password)) return 'requirements'
  return null
}
