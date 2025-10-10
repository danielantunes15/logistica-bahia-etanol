// js/auth_utils.js
import bcryptjs from 'https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/+esm';

/**
 * Gera hash seguro da senha usando bcrypt
 */
export async function hashPassword(password) {
    if (!password) return '';
    
    // Gera salt com custo 12 (balance entre segurança e performance)
    const salt = await bcryptjs.genSalt(12);
    const hashedPassword = await bcryptjs.hash(password, salt);
    
    return hashedPassword;
}

/**
 * Compara senha com hash armazenado
 */
export async function comparePassword(password, hashedPassword) {
    if (!password || !hashedPassword) {
        return false;
    }
    
    try {
        return await bcryptjs.compare(password, hashedPassword);
    } catch (error) {
        console.error('Erro ao comparar senhas:', error);
        return false;
    }
}

/**
 * Valida força da senha
 */
export function validatePasswordStrength(password) {
    const minLength = 6;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(test(password));
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return {
        isValid: password.length >= minLength,
        minLength,
        hasUpperCase,
        hasLowerCase,
        hasNumbers,
        hasSpecialChar,
        strength: calculatePasswordStrength(password)
    };
}

function calculatePasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
    
    return score;
}