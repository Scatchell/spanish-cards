import { describe, expect, it } from 'vitest';
import { tidySpacing } from '../../src/text/spacing.js';

describe('tidySpacing', () => {
  it.each([
    ['Hola,me llamo David!', 'Hola, me llamo David!'],
    ['Hola , me  llamo David !', 'Hola, me llamo David!'],
    ['  hola  ', 'hola'],
    ['Hola.me llamo', 'Hola. me llamo'],
    ['Espera...ya', 'Espera... ya'],
    ['Hola,¿cómo estás?', 'Hola, ¿cómo estás?'],
    ['Hola¿ cómo estás ?', 'Hola ¿cómo estás?'],
    ['¡ Hola !', '¡Hola!'],
    ['ver (aquí)ahora', 'ver (aquí) ahora'],
  ])('fixes spacing: %j -> %j', (input, expected) => {
    expect(tidySpacing(input)).toBe(expected);
  });

  it.each([
    'EE.UU. es grande',
    'p.ej. esto',
    'a.m.',
    '3,5 kilos a las 10:30',
    '1.000 pesos',
    "don't stop",
    'well-known',
  ])('leaves %j alone', (input) => {
    expect(tidySpacing(input)).toBe(input);
  });
});
