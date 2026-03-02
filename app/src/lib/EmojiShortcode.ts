import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Map of common emoji shortcodes to their UTF-8 characters.
// This covers ~150 popular shortcodes used in chat and productivity tools.
const EMOJI_MAP: Record<string, string> = {
  // Smileys & People
  smile: '\u{1F604}',
  laugh: '\u{1F602}',
  joy: '\u{1F602}',
  rofl: '\u{1F923}',
  grin: '\u{1F601}',
  wink: '\u{1F609}',
  blush: '\u{1F60A}',
  innocent: '\u{1F607}',
  heart_eyes: '\u{1F60D}',
  kissing: '\u{1F617}',
  tongue: '\u{1F61B}',
  think: '\u{1F914}',
  thinking: '\u{1F914}',
  shush: '\u{1F92B}',
  zipper_mouth: '\u{1F910}',
  raised_eyebrow: '\u{1F928}',
  neutral: '\u{1F610}',
  expressionless: '\u{1F611}',
  unamused: '\u{1F612}',
  rolling_eyes: '\u{1F644}',
  grimace: '\u{1F62C}',
  relieved: '\u{1F60C}',
  sleepy: '\u{1F62A}',
  sleeping: '\u{1F634}',
  mask: '\u{1F637}',
  nerd: '\u{1F913}',
  sunglasses: '\u{1F60E}',
  confused: '\u{1F615}',
  worried: '\u{1F61F}',
  frown: '\u{2639}\uFE0F',
  open_mouth: '\u{1F62E}',
  hushed: '\u{1F62F}',
  astonished: '\u{1F632}',
  scream: '\u{1F631}',
  cry: '\u{1F622}',
  sob: '\u{1F62D}',
  angry: '\u{1F620}',
  rage: '\u{1F621}',
  swear: '\u{1F92C}',
  skull: '\u{1F480}',
  poop: '\u{1F4A9}',
  clown: '\u{1F921}',
  ghost: '\u{1F47B}',
  alien: '\u{1F47D}',
  robot: '\u{1F916}',
  wave: '\u{1F44B}',
  ok_hand: '\u{1F44C}',
  ok: '\u{1F44C}',
  thumbsup: '\u{1F44D}',
  '+1': '\u{1F44D}',
  thumbsdown: '\u{1F44E}',
  '-1': '\u{1F44E}',
  fist: '\u{270A}',
  punch: '\u{1F44A}',
  clap: '\u{1F44F}',
  raised_hands: '\u{1F64C}',
  handshake: '\u{1F91D}',
  pray: '\u{1F64F}',
  point_up: '\u{261D}\uFE0F',
  point_down: '\u{1F447}',
  point_left: '\u{1F448}',
  point_right: '\u{1F449}',
  middle_finger: '\u{1F595}',
  muscle: '\u{1F4AA}',
  eyes: '\u{1F440}',
  brain: '\u{1F9E0}',
  shrug: '\u{1F937}',

  // Hearts & Emotions
  heart: '\u{2764}\uFE0F',
  red_heart: '\u{2764}\uFE0F',
  orange_heart: '\u{1F9E1}',
  yellow_heart: '\u{1F49B}',
  green_heart: '\u{1F49A}',
  blue_heart: '\u{1F499}',
  purple_heart: '\u{1F49C}',
  black_heart: '\u{1F5A4}',
  broken_heart: '\u{1F494}',
  sparkling_heart: '\u{1F496}',
  fire: '\u{1F525}',
  star: '\u{2B50}',
  sparkles: '\u{2728}',
  zap: '\u{26A1}',
  boom: '\u{1F4A5}',
  '100': '\u{1F4AF}',

  // Objects & Symbols
  check: '\u{2705}',
  white_check_mark: '\u{2705}',
  x: '\u{274C}',
  warning: '\u{26A0}\uFE0F',
  question: '\u{2753}',
  exclamation: '\u{2757}',
  bulb: '\u{1F4A1}',
  lightbulb: '\u{1F4A1}',
  pin: '\u{1F4CC}',
  pushpin: '\u{1F4CC}',
  link: '\u{1F517}',
  lock: '\u{1F512}',
  key: '\u{1F511}',
  bell: '\u{1F514}',
  bookmark: '\u{1F516}',
  memo: '\u{1F4DD}',
  pencil: '\u{270F}\uFE0F',
  clipboard: '\u{1F4CB}',
  calendar: '\u{1F4C5}',
  clock: '\u{1F552}',
  hourglass: '\u{231B}',
  phone: '\u{1F4F1}',
  email: '\u{1F4E7}',
  computer: '\u{1F4BB}',
  folder: '\u{1F4C1}',
  trash: '\u{1F5D1}\uFE0F',
  mag: '\u{1F50D}',
  search: '\u{1F50D}',
  gear: '\u{2699}\uFE0F',
  wrench: '\u{1F527}',
  hammer: '\u{1F528}',
  shield: '\u{1F6E1}\uFE0F',
  trophy: '\u{1F3C6}',
  medal: '\u{1F3C5}',
  flag: '\u{1F3F4}',
  rocket: '\u{1F680}',
  airplane: '\u{2708}\uFE0F',
  ship: '\u{1F6A2}',
  car: '\u{1F697}',
  bike: '\u{1F6B2}',

  // Celebration & Activities
  party: '\u{1F389}',
  tada: '\u{1F389}',
  confetti: '\u{1F38A}',
  balloon: '\u{1F388}',
  gift: '\u{1F381}',
  cake: '\u{1F382}',
  champagne: '\u{1F37E}',
  crown: '\u{1F451}',
  gem: '\u{1F48E}',
  money: '\u{1F4B0}',
  dollar: '\u{1F4B5}',
  chart: '\u{1F4C8}',
  chart_up: '\u{1F4C8}',
  chart_down: '\u{1F4C9}',

  // Nature & Weather
  sun: '\u{2600}\uFE0F',
  moon: '\u{1F319}',
  cloud: '\u{2601}\uFE0F',
  rain: '\u{1F327}\uFE0F',
  snow: '\u{2744}\uFE0F',
  rainbow: '\u{1F308}',
  tree: '\u{1F333}',
  flower: '\u{1F33A}',
  rose: '\u{1F339}',
  seedling: '\u{1F331}',
  leaf: '\u{1F343}',
  mushroom: '\u{1F344}',
  dog: '\u{1F436}',
  cat: '\u{1F431}',
  bug: '\u{1F41B}',
  bee: '\u{1F41D}',
  butterfly: '\u{1F98B}',
  turtle: '\u{1F422}',
  snake: '\u{1F40D}',
  penguin: '\u{1F427}',
  unicorn: '\u{1F984}',
  dragon: '\u{1F409}',

  // Food & Drink
  coffee: '\u{2615}',
  tea: '\u{1F375}',
  beer: '\u{1F37A}',
  wine: '\u{1F377}',
  pizza: '\u{1F355}',
  burger: '\u{1F354}',
  taco: '\u{1F32E}',
  cookie: '\u{1F36A}',
  apple: '\u{1F34E}',
  banana: '\u{1F34C}',
  avocado: '\u{1F951}',
  ice_cream: '\u{1F368}',

  // Arrows & Indicators
  arrow_up: '\u{2B06}\uFE0F',
  arrow_down: '\u{2B07}\uFE0F',
  arrow_left: '\u{2B05}\uFE0F',
  arrow_right: '\u{27A1}\uFE0F',
  refresh: '\u{1F504}',
  infinity: '\u{267E}\uFE0F',
  peace: '\u{262E}\uFE0F',
  yin_yang: '\u{262F}\uFE0F',

  // Misc popular
  info: '\u{2139}\uFE0F',
  stop: '\u{1F6D1}',
  construction: '\u{1F6A7}',
  no_entry: '\u{26D4}',
  recycle: '\u{267B}\uFE0F',
  heavy_check_mark: '\u{2714}\uFE0F',
  cross_mark: '\u{274E}',
  plus: '\u{2795}',
  minus: '\u{2796}',
  wave_dash: '\u{3030}\uFE0F',
};

/**
 * TipTap extension that converts emoji shortcodes like :smile: into UTF-8 emoji.
 *
 * Uses a ProseMirror plugin that listens for text input. When the user types
 * a closing `:`, it looks backwards for a matching opening `:` and checks
 * if the text between them is a known shortcode. If so, the `:shortcode:` text
 * is replaced with the corresponding emoji character.
 *
 * Unrecognized shortcodes are left as-is.
 */
export const EmojiShortcode = Extension.create({
  name: 'emojiShortcode',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('emojiShortcode'),
        props: {
          handleTextInput(view, from, to, text) {
            // Only act when the user types a closing `:`
            if (text !== ':') {
              return false;
            }

            const { state } = view;
            const { doc } = state;

            // Get the text node containing the cursor position
            const $from = doc.resolve(from);
            const textBefore = $from.parent.textBetween(
              0,
              $from.parentOffset,
              undefined,
              '\uFFFC'
            );

            // Find the last `:` in the text before the cursor
            const lastColonIndex = textBefore.lastIndexOf(':');
            if (lastColonIndex === -1) {
              return false;
            }

            // Extract the shortcode between the colons
            const shortcode = textBefore.slice(lastColonIndex + 1);

            // Validate: shortcode must be non-empty and contain only valid characters
            // (letters, digits, underscores, hyphens, plus signs)
            if (!shortcode || !/^[a-zA-Z0-9_+\-]+$/.test(shortcode)) {
              return false;
            }

            // Look up the emoji
            const emoji = EMOJI_MAP[shortcode.toLowerCase()];
            if (!emoji) {
              return false;
            }

            // Calculate the absolute position of the opening `:`
            // parentOffset tells us where `from` is within the parent node,
            // and we know `textBefore` ends at parentOffset
            const startOfParent = from - $from.parentOffset;
            const absoluteStart = startOfParent + lastColonIndex;

            // Replace `:shortcode:` (including the closing `:` being typed) with the emoji
            const tr = state.tr.replaceWith(
              absoluteStart,
              to,
              state.schema.text(emoji)
            );
            view.dispatch(tr);

            return true;
          },
        },
      }),
    ];
  },
});
