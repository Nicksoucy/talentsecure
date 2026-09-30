import { stripHtml } from '../services/email.service';

describe('stripHtml (version texte des courriels)', () => {
  it('retire balises, <style> et <script>, normalise les espaces', () => {
    expect(
      stripHtml('<html><style>p{a:b}</style><SCRIPT x>bad()</script><p>Bonjour  <b>Jean</b></p>\n<td>105,00 $</td>')
    ).toBe('Bonjour Jean 105,00 $');
  });

  it('reste linéaire sur une entrée hostile (pas de ReDoS)', () => {
    const start = Date.now();
    stripHtml('<style'.repeat(100_000));
    stripHtml('<'.repeat(100_000));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
