export interface SExpression {
  head: string;
  args: (string | SExpression)[];
}

function tokenize(s: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;

    for (let i = 0; i < s.length; i++) {
        const char = s[i];

        if (char === '"') {
            inQuote = !inQuote;
            current += char;
        } else if (!inQuote && (char === '(' || char === ')')) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            tokens.push(char);
        } else if (!inQuote && /\s/.test(char)) {
            if (current) {
                tokens.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current) {
        tokens.push(current);
    }

    return tokens;
}

function parseRecursive(tokens: string[]): [SExpression, string[]] {
  if (tokens.length === 0) {
    throw new Error("Unexpected end of input, expected '('.");
  }
  let token = tokens.shift();
  if (token !== '(') {
    throw new Error(`Unexpected token: ${token}, expected '('.`);
  }

  const result: SExpression = { head: '', args: [] };
  let headSet = false;

  while (tokens.length > 0 && tokens[0] !== ')') {
    if (tokens[0] === '(') {
      const [nestedExpr, remainingTokens] = parseRecursive(tokens);
      result.args.push(nestedExpr);
      tokens = remainingTokens;
    } else {
      const value = tokens.shift()!;
      if (!headSet) {
        result.head = value;
        headSet = true;
      } else {
        result.args.push(value);
      }
    }
  }

  if (tokens.length === 0) {
    throw new Error("Unexpected end of input, expected ')'.");
  }
  tokens.shift(); // Consume ')'

  if (!result.head && result.args.length > 0) {
      const firstArg = result.args.shift();
      if(typeof firstArg === 'string') {
          result.head = firstArg;
      } else {
          result.args.unshift(firstArg!);
      }
  }

  return [result, tokens];
}

export function parseSExpression(sExpr: string): SExpression {
    const tokens = tokenize(sExpr);
    if (tokens[0] !== '(') {
        throw new Error("A single token is not a valid S-Expression. Must be enclosed in parentheses.");
    }
    const [result, remainingTokens] = parseRecursive(tokens);
    if (remainingTokens.length > 0) {
        throw new Error(`Unexpected extra tokens at the end of input: ${remainingTokens.join(' ')}`);
    }
    return result;
}

export function sExpressionToString(sExpr: SExpression | string): string {
  if (typeof sExpr === 'string') {
    return sExpr;
  }

  const parts = [];
  if (sExpr.head) {
    parts.push(sExpr.head);
  }
  sExpr.args.forEach(arg => parts.push(sExpressionToString(arg)));

  return `(${parts.join(' ')})`;
}
