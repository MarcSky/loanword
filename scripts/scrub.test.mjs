import test from 'node:test';
import assert from 'node:assert/strict';
import { scrub, entropy, MASK } from './scrub.mjs';

const MASKED = [
  ['aws access key', 'creds AKIAIOSFODNN7EXAMPLE here', ['AKIAIOSFODNN7EXAMPLE']],
  ['aws sts key', 'ASIAIOSFODNN7EXAMPLE', ['ASIAIOSFODNN7EXAMPLE']],
  ['openai key', 'use sk-proj-abcdef0123456789ABCDEF0123', ['sk-proj-abcdef']],
  ['github pat', 'token ghp_1234567890abcdefghijklmnopqrstuvwx', ['ghp_1234567890']],
  ['github oauth', 'gho_1234567890abcdefghijklmnopqrstuvwx', ['gho_1234567890']],

  ['slack bot token', `${'xox'}b-123456789012-abcdefghijklmnop`, [`${'xox'}b-123456789012`]],
  ['slack user token', `${'xox'}p-9999999999-zzzzzzzzzzzzzzzz`, [`${'xox'}p-9999999999`]],
  ['google api key', 'AIzaSyA1234567890abcdefghijklmnopqrstuvw', ['AIzaSyA1234567890']],
  ['gitlab pat', 'glpat-abcdefghij1234567890ABC', ['glpat-abcdefghij']],
  ['npm token', `npm_${'a'.repeat(36)}`, ['npm_aaaa']],
  ['jwt', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP', ['eyJhbGciOiJIUzI1NiJ9']],
  [
    'pem block',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1\n-----END RSA PRIVATE KEY-----',
    ['MIIEpAIBAAKCAQEA1', 'BEGIN RSA PRIVATE KEY'],
  ],
  [
    'unterminated pem block',
    '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA',
    ['b3BlbnNzaC1rZXktdjEAAAA'],
  ],
  ['env password', 'DB_PASSWORD=hunter2swordfish', ['hunter2swordfish']],
  ['env token', 'export GITHUB_TOKEN=abcdefghijklmnop', ['abcdefghijklmnop']],
  ['env secret lowercase', 'client_secret=s0meth1ngPrivate', ['s0meth1ngPrivate']],
  ['json password field', '{"password": "correct horse"}', ['correct']],
  ['yaml api key', 'api_key: zzzzzzzzzzzzzzzz', ['zzzzzzzzzzzzzzzz']],
  ['credential pair', 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG', ['wJalrXUtnFEMI']],
  ['url with token query', 'abre https://api.example.com/v1/x?token=abc123secret', ['abc123secret', 'api.example.com']],
  ['url basic auth', 'https://admin:hunter2@internal.example.com/db', ['hunter2', 'internal.example.com']],
  ['a plain link', 'mira este articulo https://medium.com/@someone/stemming-37d429da33ec ahora', ['medium.com']],
  ['a link without a scheme', 'la doc esta en www.example.com/guide', ['example.com']],
  ['email', 'escribe a alguien@example.com hoy mismo', ['alguien@example.com']],
  ['ipv4', 'la conexion a 192.168.13.240 se cayo', ['192.168.13.240']],
  ['ipv6 full', 'peer 2001:0db8:85a3:0000:0000:8a2e:0370:7334 down', ['2001:0db8:85a3']],
  ['ipv6 compressed', 'bind to 2001:db8::8a2e:370:7334 please', ['2001:db8::8a2e']],
  ['unix home path', 'la migracion esta en /Users/swiftcoder/work/api/db.sql', ['/Users/swiftcoder']],
  ['linux home path', 'mira /home/deploy/secrets/app.env', ['/home/deploy']],
  ['windows path', 'el fichero C:\\Users\\Ivan\\Desktop\\keys.txt', ['C:\\Users\\Ivan']],
  ['high entropy blob', 'sesion 9f8Kq2LmZx7PvT4bNc1RwYs6Ej3Hd0Ua', ['9f8Kq2LmZx7PvT4bNc1RwYs6Ej3Hd0Ua']],
  ['base64 blob', 'payload aGVsbG8gd29ybGQgdGhpcyBpcyBhIHNlY3JldA==', ['aGVsbG8gd29ybGQ']],
  ['sha256 digest', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', ['e3b0c44298fc1c14']],
  ['two secrets one line', 'AKIAIOSFODNN7EXAMPLE and ghp_1234567890abcdefghijklmnopqrstuvwx', ['AKIAIOSFODNN7EXAMPLE', 'ghp_1234567890']],
  ['secret inside sentence', 'hay que poner token=aVeryLongOpaqueValue en la config', ['aVeryLongOpaqueValue']],
  ['pem inside prose', 'la clave -----BEGIN EC PRIVATE KEY-----\nQUJDREVGRw==\n-----END EC PRIVATE KEY----- y ya', ['QUJDREVGRw']],
];

for (const [name, input, leaks] of MASKED) {
  test(`masks ${name}`, () => {
    const out = scrub(input);
    for (const leak of leaks) {
      assert.ok(!out.includes(leak), `leaked "${leak}" in: ${out}`);
    }
    assert.ok(out.includes(MASK), `no mask emitted for ${name}: ${out}`);
  });
}

const KEPT = [
  ['hay que revertir la migración porque el índice no se reconstruyó'],
  ['vamos a mover esta lógica a un servicio aparte y cubrirla con pruebas'],
  ['the deployment keeps timing out on the health check'],
  ['refactor the retry loop so it backs off exponentially'],
  ['añade caché para estas respuestas, pero no con una clase nueva'],
  ['This change introduces a race condition between the writer and the reaper.'],
  ['let us roll back the migration before the index rebuild finishes'],
];

for (const [phrase] of KEPT) {
  test(`keeps: ${phrase.slice(0, 40)}`, () => {
    assert.equal(scrub(phrase), phrase);
  });
}

test('long ordinary words are not high-entropy', () => {
  assert.ok(entropy('internationalization') < 4.0);
  assert.equal(scrub('internationalization is hard'), 'internationalization is hard');
});

test('random blob is high-entropy', () => {
  assert.ok(entropy('9f8Kq2LmZx7PvT4bNc1RwYs6Ej3Hd0Ua') > 4.0);
});

test('mask preserves sentence structure', () => {
  const out = scrub('guarda la clave AKIAIOSFODNN7EXAMPLE en el vault');
  assert.equal(out, `guarda la clave ${MASK} en el vault`);
});

test('empty and non-string input', () => {
  assert.equal(scrub(''), '');
  assert.equal(scrub(null), '');
  assert.equal(scrub(undefined), '');
  assert.equal(scrub(42), '');
});

test('mask runs collapse', () => {
  const out = scrub('AKIAIOSFODNN7EXAMPLE AKIAIOSFODNN7EXAMPLE AKIAIOSFODNN7EXAMPLE');
  assert.equal(out, MASK);
});
