import test from 'node:test';
import assert from 'node:assert/strict';
import { broken, budget, keywordsIn, reasonsOf, vet, wordCount, words, writtenIn } from './lexis.mjs';

const enKa = { native: 'en', target: 'ka' };
const ruEn = { native: 'ru', target: 'en' };
const enDe = { native: 'en', target: 'de' };
const enJa = { native: 'en', target: 'ja' };

test('a word tapped in an example is built in its citation form, one card per tap (L-41…L-45)', async () => {
  const { readFileSync } = await import('node:fs');
  const brief = readFileSync(new URL('../agents/card-builder.md', import.meta.url), 'utf8');
  const deck = readFileSync(new URL('../ui/deck.js', import.meta.url), 'utf8');

  assert.match(brief, /^## Picker$/m, 'the builder has a brief for a tapped word');
  assert.match(brief, /citation form a dictionary\s+lists/, 'and it asks for the citation form, not the token');
  assert.match(brief, /masdar for a Georgian verb/, 'named for the languages that inflect the front away');
  assert.match(brief, /`note` names it/, 'the form the learner met stays on the card (L-42)');

  assert.match(deck, /data-act="pick-start"/, 'the mode is entered on purpose, from a button of its own');
  assert.match(deck, /data-act="pick-cancel"/, 'and left without building anything');
  assert.match(deck, /data-act="pick-word"/, 'in it, a word of the example is tappable');
  assert.match(deck, /data-act="pick-create"/, 'and the taps are built in one go');
  assert.match(deck, /!skipWords\.has\(piece\.segment/, 'a stop-word is not offered at all (L-43)');
  assert.match(deck, /'\/stopwords'/, 'the list comes from the language the learner is studying');
  assert.match(deck, /taken\.add\(String\(owned\.front/, 'nor a word the deck already teaches (L-45)');
  assert.match(deck, /skipWords\.add\(word/, 'and a word this batch just queued is gone from the sheet at once');
  assert.match(deck, /api\('\/words'/, 'through the endpoint that queues them');
  assert.match(deck, /RANGES\.picks\.max/, 'capped by the range, never by a number typed here');
});

test('the batch budget is the sum over records, never their count', () => {
  assert.equal(budget([{ source: 'prompt', text: 'one sentence' }]), 3);
  assert.equal(budget([{ source: 'session', words: Array.from({ length: 40 }, (_, i) => `w${i}`) }]), 40);
  assert.equal(budget([{ source: 'session', words: [] }]), 1, 'an empty session record still gets one');
  assert.equal(budget([{ source: 'clone', text: 'hello' }, { source: 'rewrite', text: 'hi' }]), 2);
  assert.equal(budget([{ source: 'pick', text: 'დაკარგვა' }]), 1, 'one tapped word is one card, not three');
  assert.equal(budget([{ source: 'alphabet', letters: ['ა', 'ბ', 'გ'] }]), 3);
  assert.equal(budget([{ text: 'a bare record is a prompt' }]), 3);
  assert.equal(budget([null, 'junk', 42]), 0);
  assert.equal(budget(undefined), 0);
});

test('words are counted the way the script writes them, not by letter runs', () => {
  assert.equal(wordCount('roll back the migration', 'en'), 4);
  assert.equal(wordCount('code that appears in more than one place', 'en'), 8);
  assert.equal(wordCount('किताब', 'hi'), 1, 'a Devanagari vowel sign does not split a word');
  assert.equal(wordCount('ข้อมูล', 'th'), 1, 'Thai has no spaces and combining marks');
  assert.equal(wordCount('التحقُّق', 'ar'), 1, 'Arabic diacritics do not split a word');
  assert.equal(wordCount('дублированный код', 'ru'), 2);
  assert.ok(wordCount('重复代码', 'zh') >= 1);
  assert.ok(wordCount('コードレビュー', 'ja') >= 1);
  assert.equal(wordCount('', 'en'), 0);
  assert.equal(wordCount('  — · …  ', 'en'), 0, 'punctuation alone is no word');
  assert.deepEqual(words('Roll BACK, please!', 'en'), ['roll', 'back', 'please']);
  assert.equal(wordCount('anything', 'not-a-language-tag-!!'), 1, 'a bad tag falls back instead of throwing');
});

test('a side is written in its language when its own script carries it', () => {
  assert.equal(writtenIn('დუბლირებული კოდი', 'ka', 'en'), true);
  assert.equal(writtenIn('duplicated code', 'en', 'ka'), true);
  assert.equal(writtenIn('duplicated code', 'ka', 'en'), false, 'English is not Georgian');
  assert.equal(writtenIn('APIキー', 'ja', 'en'), true, 'a loanword acronym beside kana is still Japanese');
  assert.equal(writtenIn('ключ API', 'ru', 'en'), true);
  assert.equal(writtenIn('2FA', 'ru', 'en'), false, 'no letters of the language at all');
});

test('the two Georgian cards from the bug report are sent to repair, and the right one passes', () => {
  const definition = vet({ front: 'დუბლირებული კოდი', back: 'code that appears in more than one place' }, enKa);
  assert.equal(definition.reject, '');
  assert.match(definition.repair[0], /definition/);
  assert.equal(broken(definition), true);

  const paraphrase = vet(
    { front: 'მონაცემის გადამოწმება', back: 'checking that data is correct', keywords: ['validation', 'input', 'check'] },
    enKa,
  );
  assert.match(paraphrase.repair[0], /definition/);
  assert.deepEqual(paraphrase.warn, ['keywords in the wrong language']);

  const fixed = vet(
    {
      front: 'დუბლირებული კოდი',
      back: 'duplicated code',
      keywords: ['მიმოხილვა'],
      example: 'კოდის მიმოხილვისას ეკიპაჟმა იპოვა დუბლირებული კოდი რამდენიმე მოდულში.',
    },
    enKa,
  );
  assert.deepEqual(fixed, { reject: '', repair: [], warn: [] });
  assert.equal(broken(fixed), false);
  assert.deepEqual(reasonsOf(fixed), []);
});

test('a front that is not a lexical item is refused outright', () => {
  const stop = new Set(['the', 'onto']);
  assert.equal(vet({ type: 'phrase', front: 'roll back [a migration]', back: 'откатить' }, ruEn).reject, 'a bracketed front');
  assert.equal(vet({ type: 'word', front: 'the', back: 'артикль' }, ruEn, { stopWords: stop }).reject, 'a stop-word card');
  assert.equal(vet({ type: 'word', front: 'Onto', back: 'на' }, ruEn, { stopWords: stop }).reject, 'a stop-word card');
  assert.equal(vet({ type: 'phrase', front: 'the', back: 'артикль' }, ruEn, { stopWords: stop }).reject, '', 'only word cards meet the stop-list');
  assert.equal(
    vet({ front: 'we need to roll back the migration tonight', back: 'откатить миграцию' }, ruEn).reject,
    'a whole sentence on the front',
  );
  assert.equal(vet({ front: 'Roll it back.', back: 'откатить' }, ruEn).reject, 'a whole sentence on the front');
  assert.equal(vet({ front: 'roll back', back: 'roll back' }, enDe).reject, 'a front that is its own back');
  assert.equal(vet({ front: '', back: 'x' }, ruEn).reject, 'an empty side');
  assert.equal(vet({ front: 'x', back: '   ' }, ruEn).reject, 'an empty side');
  assert.equal(vet(null, ruEn).reject, 'an empty side');
});

test('a card with its sides in the wrong language is refused when the scripts can tell', () => {
  assert.equal(vet({ front: 'duplicated code', back: 'დუბლირებული კოდი' }, enKa).reject, 'a side in the wrong language');
  assert.equal(vet({ front: 'откатить', back: 'roll back' }, ruEn).reject, 'a side in the wrong language');
  assert.equal(vet({ front: 'roll back', back: 'откатить' }, ruEn).reject, '');
  assert.equal(vet({ front: 'APIキー', back: 'API key' }, enJa).reject, '', 'kana beside an acronym passes');
  assert.equal(vet({ front: 'Gepäck', back: 'luggage' }, enDe).reject, '');
  assert.equal(vet({ front: 'luggage', back: 'Gepäck' }, enDe).reject, '', 'one script cannot tell the sides apart');
});

test('a letter card is exempt from every lexical rule', () => {
  const letter = vet({ type: 'letter', front: 'ა', back: 'ani', example: 'ანბანი' }, enKa);
  assert.deepEqual(letter, { reject: '', repair: [], warn: [] });
});

test('a back that copies the captured sentence is a paraphrase, unless the record is meant to carry it', () => {
  const prompt = { source: 'prompt', text: 'Roll it back.' };
  const copied = vet({ front: 'откатить', back: 'roll it back' }, { native: 'en', target: 'ru' }, { record: prompt });
  assert.match(copied.repair[0], /copies the record/);

  const short = { source: 'prompt', text: 'roll back' };
  const item = vet({ front: 'откатить', back: 'roll back' }, { native: 'en', target: 'ru' }, { record: short });
  assert.deepEqual(item.repair, [], 'a two-word prompt is itself the lexical item; a card that names it is right');

  const rewrite = { source: 'rewrite', text: 'roll it back' };
  const kept = vet({ front: 'откатить', back: 'roll it back' }, { native: 'en', target: 'ru' }, { record: rewrite });
  assert.deepEqual(kept.repair, [], 'a rewrite record carries the back by design');
});

test('keywords in the wrong script are filtered rather than sinking the card', () => {
  assert.deepEqual(keywordsIn(['validation', 'მონაცემი', 7, 'check'], enKa), ['მონაცემი']);
  assert.deepEqual(keywordsIn(['rollback', 'deploy'], enDe), ['rollback', 'deploy'], 'a shared script keeps them all');
  assert.deepEqual(keywordsIn(undefined, enKa), []);
});

test('an example that does not contain the front only warns, so the repair pass can try once', () => {
  const missing = vet({ front: 'roll back', back: 'откатить', example: 'We rolled it back last night.' }, ruEn);
  assert.equal(missing.reject, '');
  assert.deepEqual(missing.repair, []);
  assert.deepEqual(missing.warn, ['an example without the front in it']);
  assert.equal(broken(missing), false, 'a warning never drops a card');

  const present = vet({ front: 'roll back', back: 'откатить', example: 'We roll back the migration tonight.' }, ruEn);
  assert.deepEqual(present.warn, []);
  assert.deepEqual(vet({ front: 'roll back', back: 'откатить' }, ruEn).warn, [], 'no example, nothing to check');
});

test('a short back in a script with combining marks is not mistaken for a definition', () => {
  assert.deepEqual(vet({ front: 'validation', back: 'डेटा सत्यापन' }, { native: 'hi', target: 'en' }).repair, []);
  assert.deepEqual(vet({ front: 'validation', back: 'การตรวจสอบข้อมูล' }, { native: 'th', target: 'en' }).repair, []);
  assert.deepEqual(vet({ front: 'validation', back: 'التحقُّق من البيانات' }, { native: 'ar', target: 'en' }).repair, []);
});
