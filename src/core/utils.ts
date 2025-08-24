import { UUID, Vector } from './types';

export function generate_uuid(prefix: string = ''): UUID {
    return prefix + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const EMBEDDING_LENGTH = 16; // Using a smaller embedding length for this simulation

/**
 * Generates a placeholder embedding vector for a given string.
 * This is a deterministic pseudo-random generator based on the string content.
 * It does not produce semantically meaningful embeddings.
 * @param content The string content to embed.
 * @param length The desired length of the vector.
 * @returns A vector of numbers.
 */
export function generate_embedding(content: string, length: number = EMBEDDING_LENGTH): Vector {
  if (content.length === 0) {
    return new Array(length).fill(0);
  }
  const vector: Vector = new Array(length).fill(0);
  for (let i = 0; i < content.length * 3; i++) { // Loop more to create more variance
    const charCode = content.charCodeAt(i % content.length);
    const prevIndex = (i - 1 + length) % length;
    vector[i % length] = (vector[prevIndex] * 17 + charCode * 13 + i) % 255;
  }
  // Normalize the vector to have values between 0 and 1
  const maxVal = Math.max(...vector);
  if (maxVal === 0) return vector.map(() => 0.1); // Avoid all-zero vector if it happens

  const normalized_to_1 = vector.map(v => v / maxVal);

  // Final normalization to unit vector
  const mag = Math.sqrt(normalized_to_1.reduce((sum, val) => sum + val * val, 0));
  if (mag === 0) return new Array(length).fill(0);
  return normalized_to_1.map(v => v / mag);
}

/**
 * Checks if a string content represents a schema pattern.
 * For now, we define a schema pattern as a string containing placeholders
 * like $1, $2, %x, etc. This is a heuristic.
 * @param content The string to check.
 * @returns True if it's a schema pattern, false otherwise.
 */
export function is_schema_pattern(content: string): boolean {
  // Matches variables like $1, $2, $anything, %x, %my_var
  const schema_var_regex = /\$[\w\d]+|%\w+/;
  return schema_var_regex.test(content);
}
