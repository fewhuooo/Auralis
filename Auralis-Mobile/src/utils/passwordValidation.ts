export function validatePasswordStrength(password: string): string {
  if (!password) return '请输入密码。'
  const utf8Bytes = Array.from(password).reduce((bytes, char) => {
    const point = char.codePointAt(0) ?? 0
    if (point <= 0x7f) return bytes + 1
    if (point <= 0x7ff) return bytes + 2
    return bytes + (point > 0xffff ? 4 : 3)
  }, 0)
  if (utf8Bytes > 72) return '密码太长，请缩短后重试。'
  if (
    password.length < 8
    || !/\p{Lu}/u.test(password)
    || !/\p{Ll}/u.test(password)
    || !/[\p{P}\p{S}]/u.test(password)
  ) {
    return '密码至少 8 位，且包含大写字母、小写字母和符号。'
  }
  return ''
}
