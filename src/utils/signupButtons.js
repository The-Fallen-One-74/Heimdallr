const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PREFIX = 'signup';

const BUTTONS = [
  { status: 'going', label: 'Join', emoji: '✅', style: ButtonStyle.Success },
  { status: 'maybe', label: 'Maybe', emoji: '❓', style: ButtonStyle.Secondary },
  { status: 'not_going', label: 'Can\'t', emoji: '❌', style: ButtonStyle.Secondary }
];

/**
 * Whether an event gets sign-up buttons. Holidays don't.
 */
function wantsSignups(event) {
  return event?.type !== 'holiday';
}

/**
 * Join / Maybe / Can't buttons for an event, with current counts
 * @param {number|string} eventId
 * @param {{ going: string[], maybe: string[], not_going: string[] }} [groups]
 * @returns {ActionRowBuilder}
 */
function buildSignupRow(eventId, groups) {
  return new ActionRowBuilder().addComponents(
    BUTTONS.map(b => {
      const count = groups?.[b.status]?.length || 0;
      return new ButtonBuilder()
        .setCustomId(`${PREFIX}:${eventId}:${b.status}`)
        .setLabel(count ? `${b.label} (${count})` : b.label)
        .setEmoji(b.emoji)
        .setStyle(b.style);
    })
  );
}

/**
 * Read a sign-up button's custom ID
 * @returns {{ eventId: number, status: string }|null}
 */
function parseSignupCustomId(customId) {
  const match = /^signup:(\d+):(going|maybe|not_going)$/.exec(customId || '');
  if (!match) return null;
  return { eventId: Number(match[1]), status: match[2] };
}

/**
 * Short confirmation shown only to the member who clicked
 */
function signupConfirmation(status) {
  return {
    going: '✅ You\'re in. You\'ll be tagged in reminders.',
    maybe: '❓ Marked as maybe. You\'ll be tagged in reminders.',
    not_going: '❌ Marked as can\'t make it.'
  }[status];
}

module.exports = {
  wantsSignups,
  buildSignupRow,
  parseSignupCustomId,
  signupConfirmation
};
