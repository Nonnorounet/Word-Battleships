import { describe, expect, it } from 'vitest';
import { packProblem, packsFromCsv, parseCsv, sheetId } from './sheet';

const grid = `"Pack","Axis","Position","Word","French"
${[...Array(10)].map((_, i) => `"Aero","Row","${i + 1}","Row ${i}","Ligne ${i}"`).join('\n')}
${'ABCDEFGHIJ'.split('').map((l) => `"Aero","Column","${l}","verb ${l}","verbe ${l}"`).join('\n')}`;
const ships = `"Pack","Word","Letters","Hint (EN)","Hint (FR)"
"Aero","rocket","6","A, ""quoted"" hint","fr"
"Aero","ORBIT","5","h","f"
"Aero","WING","4","h","f"
"Aero","JET","3","h","f"
"Aero","HUB","3","h","f"`;
const ch = `"Pack","Type","Prompt","Answer","Also accept","Hint (FR)"
"Aero","Translation","un retard","a delay","delay; the delay","x"`;

describe('sheet', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b,c","d""e"\n1,2,3')).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  });
  it('builds a pack from the three tabs', () => {
    const [p] = packsFromCsv(grid, ships, ch);
    expect(p.name).toBe('Aero');
    expect(p.rows[0]).toEqual({ word: 'Row 0', fr: 'Ligne 0' });
    expect(p.cols[9].word).toBe('verb J');
    expect(p.ships[0]).toEqual({ word: 'ROCKET', hintEn: 'A, "quoted" hint', hintFr: 'fr' });
    expect(p.challenges[0].also).toEqual(['delay', 'the delay']);
    expect(packProblem(p)).toBeNull();
  });
  it('explains what is missing', () => {
    const [p] = packsFromCsv(grid, ships.split('\n').slice(0, 5).join('\n'), ch);
    expect(packProblem(p)).toBe('1/2 ship words of 3 letters');
  });
  it('reads the id from a link', () => {
    expect(sheetId('https://docs.google.com/spreadsheets/d/1FTocqbtlV8p9xo8FZwJY4snjVw-LptKboBonSOdGrwQ/edit?usp=x')).toBe('1FTocqbtlV8p9xo8FZwJY4snjVw-LptKboBonSOdGrwQ');
  });
});
