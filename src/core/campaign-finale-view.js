function required(documentRef, id) {
  const element = documentRef?.getElementById?.(id);
  if (!element) throw new Error(`Campaign finale is missing #${id}`);
  return element;
}

function appendTextElement(documentRef, parent, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

/** Apartment-owned DOM Adapter for the pure durable finale Module. */
export function createCampaignFinaleView({ documentRef = globalThis.document } = {}) {
  const overlay = required(documentRef, 'overlay');
  const card = required(documentRef, 'campaign-finale');
  const title = required(documentRef, 'campaign-finale-title');
  const subtitle = required(documentRef, 'campaign-finale-subtitle');
  const stats = required(documentRef, 'campaign-finale-stats');
  const highlights = required(documentRef, 'campaign-finale-highlights');
  const credits = required(documentRef, 'campaign-finale-credits');
  const continueButton = required(documentRef, 'campaign-freeplay-btn');
  const creditsButton = required(documentRef, 'campaign-roll-credits-btn');
  const error = required(documentRef, 'campaign-finale-error');

  let replay = false;
  let onContinue = null;
  let onRollCredits = null;

  continueButton.addEventListener('click', () => onContinue?.({ replay }));
  creditsButton.addEventListener('click', () => onRollCredits?.());

  return Object.freeze({
    setContinueHandler(handler) {
      if (typeof handler !== 'function') throw new TypeError('Finale continue handler must be a function');
      onContinue = handler;
    },

    setRollCreditsHandler(handler) {
      if (typeof handler !== 'function') throw new TypeError('Finale credits handler must be a function');
      onRollCredits = handler;
    },

    show(recap, { replay: isReplay = false } = {}) {
      if (!recap) throw new TypeError('Campaign finale view requires a recap');
      replay = isReplay;
      title.textContent = recap.title;
      subtitle.textContent = recap.subtitle;
      stats.textContent = '';
      for (const item of recap.stats) {
        const row = documentRef.createElement('div');
        appendTextElement(documentRef, row, 'dt', '', item.label);
        appendTextElement(documentRef, row, 'dd', '', item.value);
        stats.appendChild(row);
      }

      highlights.textContent = '';
      highlights.classList.toggle('hidden-hard', recap.highlights.length === 0);
      for (const line of recap.highlights) {
        appendTextElement(documentRef, highlights, 'li', '', line);
      }

      credits.textContent = '';
      appendTextElement(documentRef, credits, 'p', 'finale-credit-mark', 'SQUATCH LIFE');
      for (const item of recap.credits) {
        const group = documentRef.createElement('div');
        appendTextElement(documentRef, group, 'span', 'finale-credit-role', item.role);
        appendTextElement(documentRef, group, 'strong', '', item.name);
        credits.appendChild(group);
      }
      credits.classList.remove('rolling');
      // Restart the authored roll when the durable card is reopened from pause.
      void credits.offsetWidth;
      credits.classList.add('rolling');

      error.hidden = true;
      error.textContent = '';
      continueButton.textContent = replay ? 'Return to Freeplay' : 'Continue in Freeplay';
      card.classList.remove('hidden-hard');
      card.setAttribute('aria-hidden', 'false');
      overlay.classList.add('campaign-finale');
      continueButton.focus({ preventScroll: true });
    },

    hide() {
      overlay.classList.remove('campaign-finale');
      card.classList.add('hidden-hard');
      card.setAttribute('aria-hidden', 'true');
    },

    showError(message) {
      error.textContent = message;
      error.hidden = false;
      continueButton.focus({ preventScroll: true });
    },
  });
}

