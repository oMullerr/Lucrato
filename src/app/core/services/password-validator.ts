/** Returns an i18n key (under `validation.*`) describing the first failed rule,
 *  or null when the password is strong enough. Callers resolve it with TranslateService. */
export function validatePasswordStrength(pwd: string): string | null {
  if (!pwd || pwd.length < 8) return 'validation.pwdMin';
  if (!/[a-zA-Z]/.test(pwd)) return 'validation.pwdLetter';
  if (!/\d/.test(pwd)) return 'validation.pwdNumber';
  if (pwd.length > 128) return 'validation.pwdMax';
  return null;
}
