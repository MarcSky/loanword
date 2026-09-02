import {
  $,
  ACTIONS,
  CATEGORY,
  GRADES,
  MODE_LABEL,
  SESSION_LENGTHS,
  ago,
  api,
  app,
  esc,
  go,
  icon,
  langAttrs,
  languageName,
  meta,
  pct,
  reducedMotion,
  refresh,
  registerScreen,
  ring,
  t,
  tintOf,
  tn,
  toast,
  emptyState,
  setTitle,
} from './core.js';

import { checkTyped, ratingFor } from './answer.js';
import { buildChoices as pickChoices, flyDirection, studyAction, swipeTint, swipeVerdict } from './quiz.js';
import { followUp, holdNewCards, progressAt, requeue, shouldHoldNewCards, shuffle } from './plan.js';
import { canSpeak, speak } from './speak.js';

const PREVENTED = new Set(['present-next', 'check', 'grade-result', 'grade-answer', 'reveal']);

const FLIP_MS = 340;
const FLY_MS = 260;
const UNDO_MS = 5000;

const FLIPPING = new Set(['flashcards', 'reverse']);
const SWIPEABLE = new Set(['flashcards', 'reverse']);

export const JUNK_REASONS = [
  ['not-useful', 'Not worth learning'],
  ['already-known', 'I already know it'],
  ['too-rare', 'Too rare to bother'],
  ['wrong-translation', 'The translation is wrong'],
];

const cardOf = (id) => app.cards.find((card) => card.id === id) || null;

export function currentStep() {
  return app.session?.queue[app.session.index] || null;
}

export function currentCard() {
  const step = currentStep();
  return step ? cardOf(step.id) : null;
}

export function buildChoices(card) {
  return pickChoices(card, app.cards, (list) => shuffle(list));
}

export async function startSession({ category = '', level = '', minutes, exclude = [] } = {}) {
  const chosen = minutes || app.config.sessionMinutes || 10;
  let plan;
  try {
    plan = await api('/session/start', { category, level, minutes: chosen, exclude });
  } catch (error) {
    toast(error.message || t('Nothing is due in that group yet'));
    return false;
  }
  app.session = {
    id: plan.sessionId,
    minutes: plan.minutes,
    category: plan.category,
    level: plan.level,
    queue: plan.steps,
    counts: plan.counts,
    planned: plan.steps.length,
    production: plan.production || 'type',
    index: 0,
    revealed: false,
    choices: null,
    answered: null,
    typed: '',
    result: null,
    intervals: null,
    cloze: undefined,
    asked: Date.now(),
    busy: false,
    known: 0,
    learning: 0,
    graded: 0,
    ratings: [],
    held: false,
    junking: false,
    spoken: 0,
    lastJunk: 0,
    lastJunkId: '',
    summary: null,
    produced: null,
    ending: false,
  };
  go('study');
  return true;
}

function goalScreen(page) {
  const due = app.cards.filter((card) => card.isDue);
  const chosen = app.config.sessionMinutes || 10;

  if (!due.length) {
    page.dataset.idle = '1';
    page.innerHTML = `<div class="stage">${emptyState({
      art: {
        src: 'empty-session.webp',
        alt: 'Flat line illustration: a single flashcard lying face down thin black outline, blue and beige fills, white background, no text',
      },
      title: t('Nothing due right now'),
      body: t('The deck will be waiting.'),
      action: `<button class="btn" data-act="go" data-value="overview">${icon('house', 'icon-sm icon')} ${esc(t('Back to overview'))}</button>`,
    })}</div>`;
    return;
  }

  const reviews = due.filter((card) => !card.isNew).length;
  const fresh = due.length - reviews;
  const domains = Object.keys(CATEGORY)
    .map((key) => ({ key, n: due.filter((card) => card.category === key).length }))
    .filter((domain) => domain.n);

  page.dataset.idle = '1';
  page.innerHTML = `<div class="stage"><div class="goal enter">
    <p class="eyebrow">${esc(languageName(app.config.native))} → ${esc(languageName(app.config.target))} · ${esc(tn(due.length, 'card', 'cards'))}</p>
    <h2>${esc(t('How long have you got?'))}</h2>
    <div class="lengths" role="group" aria-label="${esc(t('Session length'))}">
      ${SESSION_LENGTHS.map(
        (minutes, index) => `<button class="length" data-act="pick-minutes" data-value="${minutes}"
          aria-pressed="${chosen === minutes}">
          <span class="n">${minutes}</span>
          <span class="u">${esc(t('minutes'))}</span>
          <kbd>${index + 1}</kbd>
        </button>`,
      ).join('')}
    </div>
    <div class="goal-shape">
      <div><b>${reviews}</b><span>${esc(t('to review'))}</span></div>
      <div><b>${fresh}</b><span>${esc(t('new'))}</span></div>
    </div>
    <div class="goal-domains" role="list" aria-label="${esc(t('Filter by category'))}">
      ${domains
        .map((domain) => {
          const info = meta(domain.key);
          return `<span class="tag" role="listitem" style="${tintOf(domain.key)}">${icon(info.icon)}${esc(info.label)}<b>${domain.n}</b></span>`;
        })
        .join('')}
    </div>
    <button class="btn btn-primary" data-act="start-planned" data-value="${chosen}">
      ${icon('play', 'icon-sm icon')} ${esc(t('Start'))}
    </button>
    <p class="field-hint" style="margin:0">${esc(t('space to reveal · 1–4 to grade · esc to leave'))}</p>
  </div></div>`;
}

function progressBar(session) {
  const done = progressAt({ index: session.index, total: session.queue.length, planned: session.planned });
  return `<span class="session-progress">
    <span class="count">${Math.min(session.index + 1, session.queue.length)} / ${session.queue.length}</span>
    <span class="track"><i style="--p:${done.toFixed(4)}"></i></span>
    <span class="count">${esc(t('{n} min', { n: session.minutes }))}</span>
  </span>`;
}

const noteRow = (card) =>
  card.note ? `<p class="note">${icon('warning-circle', 'icon-sm icon')} ${esc(card.note)}</p>` : '';

const exampleRow = (card) =>
  card.example ? `<p class="example" ${langAttrs(app.config.target)}>${esc(card.example)}</p>` : '';

const readingRow = (card) =>
  card.reading ? `<p class="reading" lang="und" dir="ltr">${esc(card.reading)}</p>` : '';

function speakButton(card) {
  if (!canSpeak(app.config.target)) return '';
  return `<button class="speak" data-act="speak" data-value="${card.id}"
    title="${esc(t('Say it out loud'))}" aria-label="${esc(t('Say it out loud'))}">
    ${icon('speaker-high', 'icon-sm icon')}<kbd>s</kbd>
  </button>`;
}

function keywordRow(card) {
  const said = new Set([card.front, card.back].map((value) => String(value).toLowerCase().trim()));
  const words = (card.keywords || []).filter((word) => !said.has(String(word).toLowerCase().trim()));
  if (!words.length) return '';
  return `<div class="keywords" ${langAttrs(app.config.target)}>${words
    .map((word) => `<span class="keyword">${esc(word)}</span>`)
    .join('')}</div>`;
}

function gradeButtons(session) {
  const intervals = session.intervals;
  return `<div class="grades">
    ${GRADES.slice(1)
      .map((grade) => {
        const next = intervals?.[grade.n];
        const label = next
          ? next.days >= 1
            ? t('{n} d', { n: Math.round(next.days) })
            : t('now')
          : '';
        return `<button class="grade" data-act="grade" data-value="${grade.n}"
          style="--tint:var(--${grade.tint});--tint-ink:var(--${grade.tint}-ink)">
          <span>${grade.n} · ${esc(t(grade.label))}</span>
          ${
            app.config.showIntervals !== false && label
              ? `<span class="interval">${esc(label)}</span>`
              : `<span class="when">${esc(t(grade.hint))}</span>`
          }
        </button>`;
      })
      .join('')}
  </div>`;
}

function presentBody(session, card) {
  return {
    ask: `<div class="prompt" ${langAttrs(app.config.target)}>${esc(card.front)}</div>
      ${readingRow(card)}
      ${speakButton(card)}`,
    tell: `<div class="reveal">
        <div class="answer" ${langAttrs(app.config.native)}>${esc(card.back)}</div>
        ${keywordRow(card)}
        ${exampleRow(card)}
        ${noteRow(card)}
      </div>
      <button class="btn btn-primary next-btn" data-act="present-next">
        ${esc(t('Got it — ask me later'))} ${icon('arrow-right', 'icon-sm icon')}
      </button>`,
    grades: '',
  };
}

function flashcardBody(session, card, reversed) {
  const prompt = reversed ? card.back : card.front;
  const answer = reversed ? card.front : card.back;
  const promptLang = reversed ? app.config.native : app.config.target;
  const answerLang = reversed ? app.config.target : app.config.native;
  return {
    ask: `<div class="prompt" ${langAttrs(promptLang)}>${esc(prompt)}</div>
      ${reversed ? '' : readingRow(card)}
      ${reversed ? '' : speakButton(card)}`,
    tell: session.revealed
      ? `<div class="reveal">
          <div class="answer" ${langAttrs(answerLang)}>${esc(answer)}</div>
          ${reversed ? readingRow(card) : ''}
          ${reversed ? speakButton(card) : ''}
          ${keywordRow(card)}
          ${exampleRow(card)}
          ${noteRow(card)}
        </div>`
      : `<button class="btn btn-primary reveal-btn" data-act="reveal">
          ${icon('eye', 'icon-sm icon')} ${esc(t('Show the answer'))}
        </button>`,
    grades: session.revealed ? gradeButtons(session) : '',
  };
}

function learnBody(session, card) {
  if (!session.choices) session.choices = buildChoices(card);
  const answered = session.answered;
  return {
    ask: `<div class="prompt" ${langAttrs(app.config.target)}>${esc(card.front)}</div>`,
    tell: `<div class="choices" ${answered ? 'data-answered' : ''} ${langAttrs(app.config.native)}>
      ${session.choices
        .map((choice, index) => {
          let state = '';
          if (answered) {
            if (choice === card.back) state = 'right';
            else if (choice === answered.picked) state = 'wrong';
            else state = 'muted';
          }
          return `<button class="choice" data-act="choose" data-value="${esc(choice)}" ${state ? `data-state="${state}"` : ''}>
            <span class="key">${index + 1}</span><span>${esc(choice)}</span>
          </button>`;
        })
        .join('')}
    </div>
    ${answered ? `${verdict(card, answered.correct)}${exampleRow(card)}${noteRow(card)}${nextButton()}` : ''}`,
    grades: '',
  };
}

function typedBody(session, card, mode) {
  const cloze = mode === 'cloze' ? session.cloze : null;
  const result = session.result;
  const state = result ? (result.correct ? (result.verdict === 'close' ? 'close' : 'right') : 'wrong') : '';

  const ask =
    mode === 'cloze' && cloze
      ? `<div class="cloze" ${langAttrs(app.config.target)}>${esc(cloze.before)}<span class="gap">${
          result ? esc(cloze.answer) : '…'
        }</span>${esc(cloze.after)}</div>
        <p class="lede" style="margin-top:10px" ${langAttrs(app.config.native)}>${esc(card.back)}</p>`
      : `<div class="prompt" ${langAttrs(app.config.native)}>${esc(card.back)}</div>`;

  return {
    ask,
    tell: `<div class="typed" ${state ? `data-state="${state}"` : ''}>
        <input id="typed" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
          ${langAttrs(app.config.target)}
          value="${esc(session.typed)}" ${result ? 'readonly' : ''}
          placeholder="${esc(t('type it in {lang}', { lang: String(app.config.target || '').toUpperCase() }))}"
          aria-label="${esc(t('Your answer'))}">
        ${
          result
            ? ''
            : `<button class="btn btn-primary" data-act="check">${esc(t('Check'))} ${icon('arrow-right', 'icon-sm icon')}</button>`
        }
      </div>
      ${
        result
          ? `${verdict(card, result.correct, result.verdict)}
             ${readingRow(card)}
             ${mode === 'cloze' ? '' : exampleRow(card)}
             ${noteRow(card)}
             ${nextButton()}`
          : ''
      }`,
    grades: '',
  };
}

const nextButton = () =>
  `<button class="btn btn-primary next-btn" data-act="next">${esc(t('Next'))} ${icon('arrow-right', 'icon-sm icon')}</button>`;

function verdict(card, correct, kind = '') {
  if (correct) {
    return `<div class="verdict-line" style="color:var(--g3)">
      ${icon('check-circle', 'icon-sm icon')}
      ${esc(kind === 'close' ? t('Close enough — it is {answer}', { answer: card.front }) : t('Right — scheduled further out'))}
    </div>`;
  }
  return `<div class="again-note">
      ${icon('arrow-counter-clockwise', 'icon-sm icon')}
      <span>${t('It is <b>{answer}</b>.', { answer: esc(card.front) })}</span>
    </div>`;
}

function junkPanel() {
  return `<div class="junk-panel" role="group" aria-label="${esc(t('Why is this card junk?'))}">
    <div class="junk-head">${esc(t('Why is this card junk?'))}</div>
    ${JUNK_REASONS.map(
      ([key, label], index) => `<button class="btn btn-quiet" data-act="junk-reason" data-value="${key}">
        <kbd>${index + 1}</kbd> ${esc(t(label))}
      </button>`,
    ).join('')}
    <button class="btn btn-quiet" data-act="junk-cancel"><kbd>esc</kbd> ${esc(t('Keep it'))}</button>
  </div>`;
}

function strip(session) {
  const total = session.queue.length;
  const label = t('{n} of {total}', { n: session.index + 1, total });
  return `<div class="strip" role="img" aria-label="${esc(label)}">
    ${session.queue
      .map((step, index) => {
        const state = index < session.index ? `data-grade="${step.grade || 0}"` : index === session.index ? 'data-current' : '';
        return `<i ${state} ${step.repeat ? 'data-repeat' : ''}></i>`;
      })
      .join('')}
  </div>`;
}

function keyHints(session, mode) {
  const hint = (keys, what) =>
    `<span>${keys.map((key) => `<kbd>${key}</kbd>`).join('')}<b>${esc(t(what))}</b></span>`;
  const leave = hint(['esc'], 'leave');

  if (mode === 'present') return hint(['↵'], 'got it') + hint(['s'], 'say it') + leave;
  if (mode === 'learn') {
    return session.answered ? hint(['↵'], 'next card') + leave : hint(['1', '2', '3', '4'], 'pick an answer') + leave;
  }
  if (mode === 'cloze' || mode === 'type') {
    return session.result ? hint(['↵'], 'next card') + leave : hint(['↵'], 'check your answer') + leave;
  }
  return session.revealed
    ? hint(['1'], 'again') + hint(['2'], 'hard') + hint(['3'], 'good') + hint(['4'], 'easy') + hint(['d'], 'junk') + leave
    : hint(['space'], 'show the answer') + leave;
}

async function loadCloze(session, id) {
  try {
    const gap = await api(`/cloze?id=${encodeURIComponent(id)}`);
    session.cloze = gap.answer ? gap : null;
  } catch {
    session.cloze = null;
  }
  if (currentStep()?.id === id) renderStudy();
}

async function loadIntervals(session, id) {
  if (app.config.showIntervals === false) return;
  try {
    session.intervals = await api(`/intervals?id=${encodeURIComponent(id)}`);
    if (currentStep()?.id === id) renderStudy();
  } catch {
    session.intervals = null;
  }
}

function produceBlock(session, summary) {
  if (!summary.produce) return '';
  const done = session.produced;
  if (done) {
    return `<div class="produce">
      <div class="l">${esc(t('One sentence of your own'))}</div>
      <p class="lede" style="margin:6px 0 0">${esc(done.line)}</p>
      ${
        done.used?.length
          ? `<p class="field-hint" style="margin:6px 0 0">${esc(t('Counted as practice: {words}', { words: done.used.join(', ') }))}</p>`
          : ''
      }
    </div>`;
  }
  return `<form class="produce" data-produce>
    <div class="l">${esc(t('One sentence of your own'))}</div>
    <p class="field-hint" style="margin:4px 0 8px">${esc(
      t('Use two of these: {words}', { words: summary.words.slice(0, 5).join(', ') }),
    )}</p>
    <textarea class="input" name="sentence" rows="2" ${langAttrs(app.config.target)}
      aria-label="${esc(t('Your sentence'))}"></textarea>
    <button class="btn" type="submit" style="margin-top:8px">${esc(t('Get one line back'))}</button>
  </form>`;
}

function renderSummary(page, session) {
  const summary = session.summary;
  if (!summary) {
    page.innerHTML = `<div class="stage"><div class="summary">
      <div class="skeleton" style="height:260px;width:100%"></div>
    </div></div>`;
    endSession();
    return;
  }

  const accuracy = summary.accuracy || 0;
  page.dataset.idle = '1';
  page.innerHTML = `<div class="stage">
    <div class="summary enter">
      <div style="display:grid;place-items:center;gap:var(--s-4)">
        <div class="art-frame" style="max-width:220px">
          <img class="art" src="art/${accuracy >= 0.95 ? 'session-clean' : accuracy >= 0.7 ? 'session-mixed' : 'session-hard'}.webp"
            alt="${esc(t('Flat pastel illustration of index cards on a desk, no text'))}">
        </div>
        ${ring(accuracy, { size: 88, label: pct(accuracy), hole: 'var(--panel)' })}
      </div>
      <h1 style="font-size:2.25rem;margin:0 auto;letter-spacing:-.03em">${esc(
        summary.learned?.length ? t('Something moved') : t('Session done'),
      )}</h1>

      <div class="summary-stats">
        <div><span class="n">${summary.reviewed || 0}</span><span class="l">${esc(t('reviewed'))}</span></div>
        <div><span class="n">${Math.max(1, Math.round((summary.duration_ms || 0) / 60000))}</span><span class="l">${esc(t('minutes'))}</span></div>
        <div><span class="n">${pct(accuracy)}</span><span class="l">${esc(t('accuracy'))}</span></div>
        <div><span class="n">${summary.learned?.length || 0}</span><span class="l">${esc(t('into memory'))}</span></div>
      </div>

      ${
        summary.learned?.length
          ? `<p class="lede" style="margin:0 auto 18px">${esc(
              t('{n} crossed into long-term memory: {words}', {
                n: summary.learned.length,
                words: summary.learned.slice(0, 4).join(', '),
              }),
            )}</p>`
          : ''
      }

      ${
        summary.toughest
          ? `<div class="toughest">
              <div class="micro">${esc(t('The one that fought back'))}</div>
              <div class="w">${esc(summary.toughest.front)} — ${esc(summary.toughest.back)}</div>
              ${summary.toughest.example ? `<div class="e">${esc(summary.toughest.example)}</div>` : ''}
            </div>`
          : ''
      }

      ${
        app.stats?.wild_7
          ? `<p class="lede" style="margin:0 auto 6px">${esc(
              t('{n} of your words turned up in a real prompt this week', { n: app.stats.wild_7 }),
            )}</p>`
          : ''
      }

      ${produceBlock(session, summary)}

      <div class="grades" style="margin-top:22px">
        <button class="btn btn-primary" data-act="more-minutes">
          ${icon('arrow-counter-clockwise', 'icon-sm icon')} ${esc(t('5 more minutes'))} <kbd>r</kbd>
        </button>
        <button class="btn" data-act="go" data-value="overview">
          ${icon('house', 'icon-sm icon')} ${esc(t('Done for now'))} <kbd>↵</kbd>
        </button>
      </div>
    </div>
  </div>`;
}

export function renderStudy() {
  const session = app.session;
  const page = $('#page-study');

  if (!session) return goalScreen(page);
  if (session.index >= session.queue.length) return renderSummary(page, session);

  const step = currentStep();
  const card = cardOf(step.id);
  if (!card) {
    session.index++;
    return renderStudy();
  }

  delete page.dataset.idle;
  const info = meta(card.category);
  const mode = step.mode;
  const parts =
    mode === 'present'
      ? presentBody(session, card)
      : mode === 'learn'
        ? learnBody(session, card)
        : mode === 'cloze' || mode === 'type'
          ? typedBody(session, card, mode)
          : flashcardBody(session, card, mode === 'reverse');

  if (session.revealed && !session.intervals && (mode === 'flashcards' || mode === 'reverse')) {
    loadIntervals(session, card.id);
  }
  if (mode === 'cloze' && session.cloze === undefined) {
    session.cloze = null;
    loadCloze(session, card.id);
  }

  page.innerHTML = `
    <div class="study-bar">
      <button class="btn btn-quiet" data-act="quit" aria-label="${esc(t('Leave the session'))}">
        ${icon('arrow-left', 'icon-sm icon')} ${esc(t('Leave'))}
      </button>
      ${progressBar(session)}
      <span class="tally">
        <span class="known">${icon('check', 'icon-sm icon')}${session.known}</span>
        <span class="learning">${icon('arrow-counter-clockwise', 'icon-sm icon')}${session.learning}</span>
      </span>
      <button class="star" data-act="favorite" data-value="${card.id}"
        aria-pressed="${!!card.isFavorite}"
        aria-label="${esc(card.isFavorite ? t('Remove from favourites') : t('Add to favourites'))}">
        ${icon('star', 'icon-sm icon')}
      </button>
    </div>
    ${strip(session)}

    <div class="stage">
      <article class="card-face" data-mode="${mode}" style="${tintOf(card.category)}">
        <div class="face-head">
          <span class="tag">${icon(info.icon)}${esc(info.label)}</span>
          ${card.cefr ? `<span class="level">${esc(card.cefr)}</span>` : ''}
          ${mode === 'present' ? `<span class="tag" data-plain>${icon('sparkle', 'icon-sm icon')}${esc(t('First look'))}</span>` : ''}
          ${step.seen || mode === 'present' ? '' : `<span class="tag" data-plain>${icon('sparkle', 'icon-sm icon')}${esc(t('New'))}</span>`}
          ${step.warmup ? `<span class="tag" data-plain>${icon('fire', 'icon-sm icon')}${esc(t('Warm-up'))}</span>` : ''}
          ${step.repeat ? `<span class="tag" data-plain>${icon('arrow-counter-clockwise', 'icon-sm icon')}${esc(t('Again'))}</span>` : ''}
          ${card.leech ? `<span class="tag" data-plain>${icon('warning-circle', 'icon-sm icon')}${esc(t('Leech'))}</span>` : ''}
          <span class="mode">${icon('brain', 'icon-sm icon')}${esc(t(MODE_LABEL[mode] || mode))}</span>
        </div>
        <div class="face-ask">${parts.ask}</div>
        <div class="face-tell">${parts.tell}</div>
      </article>
      ${session.junking ? junkPanel() : parts.grades}
    </div>

    <div class="keys">${keyHints(session, mode)}</div>`;

  bindSwipe(page, mode);

  const input = $('#typed');
  if (input && !session.result) input.focus();
  setTitle();

  if (app.config.speech === 'ask' && mode === 'type' && session.spoken !== session.index) {
    session.spoken = session.index;
    speak(card.front, app.config.target);
  }
}

function bindSwipe(page, mode) {
  if (reducedMotion() || !SWIPEABLE.has(mode)) return;
  const session = app.session;
  if (!session?.revealed) return;
  const face = page.querySelector('.card-face');
  if (!face) return;

  let start = null;
  const move = (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    face.style.transform = `translateX(${dx}px) rotate(${dx / 28}deg)`;
    const { tint, reach } = swipeTint(dx);
    face.dataset.swipe = tint;
    face.style.setProperty('--swipe', reach.toFixed(3));
  };
  const end = (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const width = face.getBoundingClientRect().width;
    start = null;
    face.releasePointerCapture?.(event.pointerId);
    face.style.transition = '';
    const rating = swipeVerdict({ dx, dy, width });
    if (!rating) {
      face.style.transform = '';
      delete face.dataset.swipe;
      face.style.removeProperty('--swipe');
      return;
    }
    flyOut(face, rating);
    grade(rating);
  };

  face.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, input, a')) return;
    start = { x: event.clientX, y: event.clientY };
    face.setPointerCapture?.(event.pointerId);
    face.style.transition = 'none';
  });
  face.addEventListener('pointermove', move);
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', () => {
    start = null;
    face.style.transition = '';
    face.style.transform = '';
    delete face.dataset.swipe;
  });
}

function flyOut(face, rating) {
  if (!face || reducedMotion()) return;
  const way = flyDirection(rating);
  face.style.transition = `transform ${FLY_MS}ms var(--ease), opacity ${FLY_MS}ms var(--ease)`;
  face.style.transform = `translateX(${way * 130}%) rotate(${way * 18}deg)`;
  face.style.opacity = '0';
  face.dataset.swipe = way < 0 ? 'again' : 'good';
}

async function endSession() {
  const session = app.session;
  if (!session || session.ending) return;
  session.ending = true;
  try {
    session.summary = await api('/session/end', { id: session.id });
  } catch {
    session.summary = {
      reviewed: session.graded,
      correct: session.known,
      duration_ms: 0,
      accuracy: session.graded ? session.known / session.graded : 0,
      learned: [],
      words: [],
      produce: false,
    };
  }
  await refresh();
  renderStudy();
}

function advance(failed, follow = null) {
  const session = app.session;
  const page = $('#page-study');
  const step = currentStep();

  if (failed && step && !step.repeat) session.queue = requeue(session.queue, session.index, step);
  if (follow) session.queue = followUp(session.queue, session.index, follow, session.production);

  if (!session.held && shouldHoldNewCards(session.ratings)) {
    session.held = true;
    const before = session.queue.length;
    session.queue = holdNewCards(session.queue, session.index);
    if (session.queue.length < before) toast(t('Easing off the new words for now'));
  }

  const step_ = () => {
    session.index++;
    session.revealed = false;
    session.choices = null;
    session.answered = null;
    session.typed = '';
    session.result = null;
    session.intervals = null;
    session.cloze = undefined;
    session.showSource = false;
    session.junking = false;
    session.asked = Date.now();
    renderStudy();
  };

  if (reducedMotion()) return step_();
  page.classList.add('turning');
  setTimeout(() => {
    step_();
    page.classList.remove('turning');
  }, 160);
}

export async function grade(rating) {
  const session = app.session;
  const step = currentStep();
  const card = step && cardOf(step.id);
  if (!session || !card || session.busy) return;
  session.busy = true;
  try {
    const result = await api('/grade', {
      id: card.id,
      rating,
      mode: step.mode,
      ms: Date.now() - (session.asked || Date.now()),
      sessionId: session.id,
    });
    session.graded++;
    session.ratings.push(rating);
    step.grade = rating;
    if (rating >= 3) session.known++;
    else session.learning++;
    card.isDue = false;
    card.isNew = false;
    card.due = result.due;
    card.mastery = result.mastery;
  } catch (error) {
    toast(error.message || t('Could not save that grade'), 'error');
    session.busy = false;
    return;
  }
  session.busy = false;
  advance(rating === 1);
}

function choose(picked) {
  const session = app.session;
  const card = currentCard();
  if (!session || !card || session.answered) return;
  const correct = picked === card.back;
  const ms = Date.now() - (session.asked || Date.now());
  session.answered = { picked, correct, rating: ratingFor({ correct, verdict: 'exact', ms }) };
  renderStudy();
}

function check() {
  const session = app.session;
  const step = currentStep();
  const card = step && cardOf(step.id);
  if (!session || !card || session.result) return;
  const input = $('#typed');
  session.typed = input ? input.value : session.typed;
  const ms = Date.now() - (session.asked || Date.now());
  const result = checkTyped(session.typed, card.front, card.keywords, app.config.target);
  session.result = { ...result, rating: ratingFor({ ...result, ms }) };
  renderStudy();
  if (app.config.speech !== 'off') speak(card.front, app.config.target);
}

async function junk(reason) {
  const session = app.session;
  const card = currentCard();
  if (!session || !card || session.busy) return;
  session.busy = true;
  try {
    const out = await api('/delete', { id: card.id, reason });
    app.cards = app.cards.filter((other) => other.id !== card.id);
    session.lastJunk = Date.now();
    session.lastJunkId = card.id;
    toast(
      out.rewrite ? t('Asked for a better card') : t('Removed from your deck'),
      'ok',
      `<button class="undo" data-act="undo-junk" data-value="${card.id}">${esc(t('Undo'))} <kbd>u</kbd></button>`,
    );
  } catch (error) {
    toast(error.message || t('Could not delete that card'), 'error');
  }
  session.busy = false;
  advance(false);
}

export function studyKeys(event) {
  const session = app.session;
  if (app.route !== 'study') return false;

  const step = session ? currentStep() : null;
  const decision = studyAction(event.key, {
    started: !!session,
    finished: !!session && session.index >= session.queue.length,
    mode: step?.mode,
    revealed: !!session?.revealed,
    answered: !!session?.answered,
    result: !!session?.result,
    junking: !!session?.junking,
    choices: session?.choices?.length || 0,
    reasons: JUNK_REASONS.length,
    lengths: SESSION_LENGTHS.length,
    canUndo: !!session?.lastJunkId && Date.now() - session.lastJunk < UNDO_MS,
  });

  if (!decision) return false;
  if (decision.act === 'none') return true;
  if (PREVENTED.has(decision.act)) event.preventDefault();

  switch (decision.act) {
    case 'pick-minutes':
      ACTIONS['pick-minutes'](String(SESSION_LENGTHS[decision.value - 1]));
      break;
    case 'start-planned':
      ACTIONS['start-planned'](String(app.config.sessionMinutes || 10));
      break;
    case 'undo-junk':
      ACTIONS['undo-junk'](session.lastJunkId);
      session.lastJunkId = '';
      break;
    case 'junk-cancel':
      ACTIONS['junk-cancel']();
      break;
    case 'junk-reason':
      junk(JUNK_REASONS[decision.value - 1][0]);
      break;
    case 'quit':
      ACTIONS.quit();
      break;
    case 'more-minutes':
      ACTIONS['more-minutes']();
      break;
    case 'done':
      go('overview');
      break;
    case 'speak':
      ACTIONS.speak(step?.id || '');
      break;
    case 'present-next':
      ACTIONS['present-next']();
      break;
    case 'check':
      check();
      break;
    case 'grade-result':
      grade(session.result.rating);
      break;
    case 'grade-answer':
      grade(session.answered.rating);
      break;
    case 'choose':
      choose(session.choices[decision.value - 1]);
      break;
    case 'reveal':
      ACTIONS.reveal();
      break;
    case 'grade':
      ACTIONS.grade(String(decision.value));
      break;
    case 'junk-open':
      ACTIONS['session-junk']();
      break;
    default:
      return false;
  }
  return true;
}

Object.assign(ACTIONS, {
  start: (value) => startSession({ category: value || '' }),
  'start-planned': (value) => startSession({ minutes: Number(value) }),
  'pick-minutes': async (value) => {
    app.config.sessionMinutes = Number(value);
    renderStudy();
    await api('/settings', { sessionMinutes: Number(value) }).catch(() => {});
  },
  'more-minutes': () => {
    const seen = app.session ? app.session.queue.map((step) => step.id) : [];
    startSession({ minutes: 5, exclude: seen });
  },
  reveal: () => {
    const session = app.session;
    const mode = currentStep()?.mode;
    session.revealed = true;
    const face = $('#page-study .card-face');
    if (face && !reducedMotion() && FLIPPING.has(mode)) {
      face.classList.add('flipping');
      setTimeout(() => renderStudy(), FLIP_MS / 2);
      return;
    }
    renderStudy();
  },
  'present-next': () => {
    const session = app.session;
    const step = currentStep();
    if (!session || !step) return;
    advance(false, step);
  },
  speak: async (id) => {
    const card = cardOf(id) || currentCard();
    if (!card) return;
    const session = app.session;
    const twice = session && session.spoken === session.index && card.example;
    if (session) session.spoken = session.index;
    const ok = await speak(twice ? card.example : card.front, app.config.target);
    if (!ok) toast(t('No offline voice for that language yet'), 'error');
  },
  grade: (value) => {
    const rating = Number(value);
    if (!reducedMotion()) flyOut($('#page-study .card-face'), rating);
    grade(rating);
  },
  choose: (value) => choose(value),
  check: () => check(),
  next: () => {
    const session = app.session;
    grade(session.result ? session.result.rating : session.answered.rating);
  },
  'show-source': () => {
    app.session.showSource = !app.session.showSource;
    renderStudy();
  },
  'junk-reason': (value) => junk(value),
  'junk-cancel': () => {
    app.session.junking = false;
    renderStudy();
  },
  quit: async () => {
    if (app.session && !app.session.ending) {
      await api('/session/end', { id: app.session.id }).catch(() => {});
    }
    app.session = null;
    await refresh();
    go('overview');
  },
  'session-junk': () => {
    app.session.junking = true;
    renderStudy();
  },
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-produce]');
  if (!form) return;
  event.preventDefault();
  const session = app.session;
  const sentence = new FormData(form).get('sentence');
  if (!session?.summary || !String(sentence || '').trim()) return;
  const button = form.querySelector('button');
  if (button) button.disabled = true;
  try {
    session.produced = await api('/produce', {
      sessionId: session.id,
      sentence: String(sentence),
      words: session.summary.words || [],
    });
    renderStudy();
    await refresh();
  } catch (error) {
    toast(error.message || t('Could not send that'), 'error');
    if (button) button.disabled = false;
  }
});

registerScreen('study', renderStudy);
