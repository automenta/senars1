export interface SExpression {
  head: string;
  args: (string | SExpression)[];
}

// Helper to tokenize an S-Expression string, respecting quotes and parentheses
function tokenizeSExpression(sExpr: string): string[] {
  const tokens: string[] = [];
  let currentToken = '';
  let inQuote = false;
  let parenDepth = 0;

  for (let i = 0; i < sExpr.length; i++) {
    const char = sExpr[i];

    if (char === '"') {
      inQuote = !inQuote;
      currentToken += char;
    } else if (inQuote) {
      currentToken += char;
    } else if (char === '(') {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
      tokens.push('(');
      parenDepth++;
    } else if (char === ')') {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
      tokens.push(')');
      parenDepth--;
    } else if (char === ' ' && parenDepth === 0) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    } else {
      currentToken += char;
    }
  }

  if (currentToken) {
    tokens.push(currentToken);
  }
  return tokens.filter(token => token.trim() !== '');
}

export function parseSExpression(sExpr: string): SExpression {
  sExpr = sExpr.trim();
  if (!sExpr.startsWith('(') || !sExpr.endsWith(')')) {
    throw new Error("Invalid S-Expression format: must start and end with parentheses.");
  }

  // Remove outer parentheses and tokenize the inner content
  const innerContent = sExpr.substring(1, sExpr.length - 1).trim();
  const tokens = tokenizeSExpression(innerContent);

  if (tokens.length === 0) {
    throw new Error("Empty S-Expression.");
  }

  const head = tokens[0];
  const args: (string | SExpression)[] = [];

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '(') {
      // Find the matching closing parenthesis for nested S-Expression
      let nestedParenDepth = 1;
      let j = i + 1;
      while (j < tokens.length && nestedParenDepth > 0) {
        if (tokens[j] === '(') nestedParenDepth++;
        else if (tokens[j] === ')') nestedParenDepth--;
        j++;
      }
      if (nestedParenDepth !== 0) {
        throw new Error("Mismatched parentheses in S-Expression.");
      }
      const nestedSExprTokens = tokens.slice(i, j);
      args.push(parseSExpression(`(${nestedSExprTokens.join(' ')})`));
      i = j;
    } else {
      // Handle string literals like (. "some string")
      if (token === '.' && tokens[i + 1] && tokens[i + 1].startsWith('"') && tokens[i + 1].endsWith('"')) {
        args.push(`(. ${tokens[i + 1]})`); // Keep the original format for now
        i += 2;
      } else {
        args.push(token);
        i++;
      }
    }
  }

  return { head, args };
}

export function sExpressionToString(sExpr: SExpression | string): string {
  if (typeof sExpr === 'string') {
    return sExpr;
  }
  const args = sExpr.args.map(arg => sExpressionToString(arg)).join(' ');
  return `(${sExpr.head} ${args})`.trim();
}
