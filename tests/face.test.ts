import { describe, expect, it } from 'vitest';
import { EXPRESSIONS, NEUTRAL, expressionFor, mixExpression, type FaceContext } from '../src/anim/face';
import { ride } from './helpers';

// Rosto vivo: cada momento da onda tem uma expressão, e a mistura entre elas é contínua.

const base: FaceContext = { phase: 'remada', airborne: false, falling: false, sinceLanding: Infinity, lastOutcome: null, sinceTakeoff: Infinity, compressing: false };

describe('expressões do rosto', () => {
  it('escolhe a expressão pelo momento da onda', () => {
    expect(expressionFor(base)).toBe('remada');
    expect(expressionFor({ ...base, phase: 'surf' })).toBe('foco');
    expect(expressionFor({ ...base, phase: 'surf', compressing: true })).toBe('concentracao');
    expect(expressionFor({ ...base, airborne: true, sinceTakeoff: 0.05 })).toBe('esforco');
    expect(expressionFor({ ...base, airborne: true, sinceTakeoff: 0.5, phase: 'manobra' })).toBe('voo');
    expect(expressionFor({ ...base, lastOutcome: 'limpa', sinceLanding: 0.5 })).toBe('alegria');
    expect(expressionFor({ ...base, lastOutcome: 'concluida', sinceLanding: 0.5 })).toBe('satisfeito');
    expect(expressionFor({ ...base, lastOutcome: 'instavel', sinceLanding: 0.5 })).toBe('careta');
    expect(expressionFor({ ...base, falling: true, airborne: true })).toBe('susto');
  });

  it('a alegria do pouso passa depois de alguns segundos', () => {
    expect(expressionFor({ ...base, lastOutcome: 'limpa', sinceLanding: 3 })).toBe('remada');
  });

  it('todas as expressões ficam dentro dos limites e misturam sem saltos', () => {
    for (const e of Object.values(EXPRESSIONS)) {
      for (const [k, v] of Object.entries(e)) {
        const lo = k === 'smile' ? -1 : 0;
        expect(v, k).toBeGreaterThanOrEqual(lo);
        expect(v, k).toBeLessThanOrEqual(1);
      }
    }
    const half = mixExpression(NEUTRAL, EXPRESSIONS.alegria, 0.5);
    expect(half.smile).toBeCloseTo(EXPRESSIONS.alegria.smile / 2 + NEUTRAL.smile / 2, 6);
  });

  it('numa onda inteira o rosto passa por foco, voo e alegria', () => {
    const seen = new Set<string>();
    ride('air-reverse', { animate: true }, (s) => {
      if (s.f) seen.add(s.f.face);
    });
    expect(seen.has('foco')).toBe(true);
    expect(seen.has('voo')).toBe(true);
    expect([...seen].some((x) => x === 'alegria' || x === 'satisfeito')).toBe(true);
  });
});
