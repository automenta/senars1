export interface SExpression {
  head: string;
  args: (string | SExpression)[];
}

// A robust S-expression parser.
// This is a simplified version of a recursive descent parser.
function parseSExpressionRecursive(tokens: string[]): [SExpression | string, number] {
    let token = tokens[0];
    if (token === undefined) {
        throw new Error("Unexpected end of input.");
    }

    if (token === '(' || token === '{') {
        const end_token = token === '(' ? ')' : '}';
        const expr: SExpression = { head: '', args: [] };
        if (token === '{') {
            expr.head = 'scope';
        }
        let i = 1;

        // The head of the S-expression.
        if (expr.head === '' && tokens[i] && tokens[i] !== '(' && tokens[i] !== ')') {
            expr.head = tokens[i];
            i++;
        }

        // The arguments of the S-expression.
        while (tokens[i] && tokens[i] !== end_token) {
            const [arg, consumed] = parseSExpressionRecursive(tokens.slice(i));
            expr.args.push(arg);
            i += consumed;
        }

        if (tokens[i] !== end_token) {
            throw new Error(`Expected '${end_token}' at the end of S-expression.`);
        }

        return [expr, i + 1];
    } else if (token === ')' || token === '}') {
        throw new Error(`Unexpected '${token}' token.`);
    } else {
        return [token, 1];
    }
}

export function parseSExpression(sExpr: string): SExpression {
    const tokens = sExpr.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').replace(/{/g, ' { ').replace(/}/g, ' } ').trim().split(/\s+/);
    const [result, consumed] = parseSExpressionRecursive(tokens);
    if (consumed < tokens.length) {
        // This can happen with multiple top-level S-expressions, which is not supported.
        console.warn("Input has extra tokens that were not consumed.", { consumed, tokens });
    }
    if (typeof result === 'string') {
        // Allow single-token S-expressions if they are scope expressions
        if (sExpr.trim().startsWith('{')) {
            return { head: 'scope', args: [result] };
        }
        throw new Error("A single token is not a valid S-Expression. Must be enclosed in parentheses.");
    }
    return result;
}

export function sExpressionToString(sExpr: SExpression | string): string {
  if (typeof sExpr === 'string') {
    return sExpr;
  }
  const args = sExpr.args.map(arg => sExpressionToString(arg)).join(' ');
  return `(${sExpr.head} ${args})`.trim();
}
