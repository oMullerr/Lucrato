export function validatePasswordStrength(pwd: string): string | null {
  if (!pwd || pwd.length < 8) return 'Senha deve ter pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(pwd)) return 'Senha deve conter pelo menos uma letra.';
  if (!/\d/.test(pwd)) return 'Senha deve conter pelo menos um número.';
  if (pwd.length > 128) return 'Senha não pode passar de 128 caracteres.';
  return null;
}
