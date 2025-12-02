import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

/**
 * Generate a random password similar to the format shown in requirements
 * Example: w4vkx0uyc4l
 */
export function generatePassword(length: number = 11): string {
    const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytesBuffer = randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
        password += charset[randomBytesBuffer[i] % charset.length];
    }

    return password;
}

/**
 * Generate username from email
 * Example: john.doe@example.com -> john.doe@example.com
 */
export function generateUsername(email: string): string {
    return email.toLowerCase().trim();
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(plainPassword: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(plainPassword, saltRounds);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(
    plainPassword: string,
    hashedPassword: string,
): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Generate credentials for a participant/respondent
 */
export async function generateCredentials(email: string): Promise<{
    username: string;
    password: string;
    hashedPassword: string;
}> {
    const username = generateUsername(email);
    const password = generatePassword();
    const hashedPassword = await hashPassword(password);

    return {
        username,
        password, // Plain password to send in email
        hashedPassword, // To store in database
    };
}
