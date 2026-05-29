import { validatePasswordStrength } from './password-validator';

describe('validatePasswordStrength', () => {
  it('rejeita senha vazia', () => {
    expect(validatePasswordStrength('')).toBe('Senha deve ter pelo menos 8 caracteres.');
  });

  it('rejeita senha com menos de 8 caracteres', () => {
    expect(validatePasswordStrength('abc12')).toBe('Senha deve ter pelo menos 8 caracteres.');
  });

  it('rejeita senha sem letras', () => {
    expect(validatePasswordStrength('12345678')).toBe('Senha deve conter pelo menos uma letra.');
  });

  it('rejeita senha sem dígitos', () => {
    expect(validatePasswordStrength('abcdefgh')).toBe('Senha deve conter pelo menos um número.');
  });

  it('rejeita senha com mais de 128 caracteres', () => {
    const longPwd = 'a1'.repeat(65); // 130 chars
    expect(validatePasswordStrength(longPwd)).toBe('Senha não pode passar de 128 caracteres.');
  });

  it('aceita senha válida simples', () => {
    expect(validatePasswordStrength('abcd1234')).toBeNull();
  });

  it('aceita senha com letras maiúsculas e dígitos', () => {
    expect(validatePasswordStrength('Senha123')).toBeNull();
  });

  it('aceita senha exatamente com 8 caracteres', () => {
    expect(validatePasswordStrength('a1234567')).toBeNull();
  });

  it('aceita senha exatamente com 128 caracteres', () => {
    const pwd = 'a1'.repeat(64); // 128 chars
    expect(pwd.length).toBe(128);
    expect(validatePasswordStrength(pwd)).toBeNull();
  });

  it('rejeita senha com 129 caracteres', () => {
    const pwd = 'a1'.repeat(64) + 'b'; // 129 chars
    expect(pwd.length).toBe(129);
    expect(validatePasswordStrength(pwd)).toBe('Senha não pode passar de 128 caracteres.');
  });

  it('aceita senha com caracteres especiais (desde que tenha letra + número)', () => {
    expect(validatePasswordStrength('a@1!b#2$')).toBeNull();
  });
});
