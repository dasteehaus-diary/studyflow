export type RewardType =
  | 'meme'
  | 'audio'
  | 'collectible'
  | 'certificate'
  | 'ambient'
  | 'easter_egg';

export interface RewardDefinition {
  id: string;
  code: string;
  type: RewardType;
  title: string;
  description: string;
  icon: string;
  assetPath?: string;
  weight: number;
  cooldownUnlocks: number;
  oneTime: boolean;
  active: boolean;
  payload: {
    subtitle?: string;
    caption?: string;
    certificateRecipientTitle?: string;
    certificateReason?: string;
    collectibleRarity?: 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Absurd';
    lore?: string;
    soundType?: 'fanfare' | 'retro-chime' | 'lofi-rain' | 'mystery-chord';
    surpriseText?: string;
    postCreditText?: string;
    memeHeader?: string;
    memeFooter?: string;
    emojiArt?: string;
  };
}

export const SEED_REWARDS: RewardDefinition[] = [
  {
    id: 'potato-of-knowledge',
    code: 'POTATO_KNOWLEDGE',
    type: 'collectible',
    title: 'Potato of Knowledge',
    description: 'An unpretentious root vegetable that absorbed 100% of the document.',
    icon: '🥔',
    weight: 12,
    cooldownUnlocks: 4,
    oneTime: true,
    active: true,
    payload: {
      collectibleRarity: 'Absurd',
      subtitle: 'Kartoffel des Wissens',
      lore: 'Found deep within the footnotes. It does not judge how long you procrastinated before finishing this tape.'
    }
  },
  {
    id: 'duck-of-persistence',
    code: 'DUCK_PERSISTENCE',
    type: 'collectible',
    title: 'Duck of Persistence',
    description: 'Quacks encouragingly at unresolved questions.',
    icon: '🦆',
    weight: 12,
    cooldownUnlocks: 4,
    oneTime: true,
    active: true,
    payload: {
      collectibleRarity: 'Rare',
      subtitle: 'Ente der Beharrlichkeit',
      lore: 'A tiny companion for readers who refuse to abandon their reading list.'
    }
  },
  {
    id: 'frog-of-focus',
    code: 'FROG_FOCUS',
    type: 'collectible',
    title: 'Frog of Deep Contemplation',
    description: 'Sits quietly on a lotus leaf, pondering page 47.',
    icon: '🐸',
    weight: 10,
    cooldownUnlocks: 4,
    oneTime: true,
    active: true,
    payload: {
      collectibleRarity: 'Uncommon',
      subtitle: 'Der nachdenkliche Frosch',
      lore: 'Ribbit. You actually reached the end of the tape.'
    }
  },
  {
    id: 'capybara-zen',
    code: 'CAPYBARA_ZEN',
    type: 'collectible',
    title: 'Zen Capybara',
    description: 'Completely unbothered by the 800 unread PDFs on your hard drive.',
    icon: '🐾',
    weight: 8,
    cooldownUnlocks: 5,
    oneTime: true,
    active: true,
    payload: {
      collectibleRarity: 'Legendary',
      subtitle: 'Meister der Gelassenheit',
      lore: 'The ultimate reading companion. It smiles peacefully as you complete another tape.'
    }
  },
  {
    id: 'cert-pdf-survivor',
    code: 'CERT_PDF_SURVIVOR',
    type: 'certificate',
    title: 'Certified PDF Survivor',
    description: 'Official diploma for completing a dense document without closing the tab.',
    icon: '🏆',
    weight: 15,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      certificateRecipientTitle: 'Resilient Tape Finisher',
      certificateReason: 'Successfully navigated hundreds of paragraphs and resisted the urge to check social media.',
      subtitle: 'Conferred with full cassette honours'
    }
  },
  {
    id: 'cert-not-giving-up',
    code: 'CERT_NOT_GIVING_UP',
    type: 'certificate',
    title: 'Diploma in Frictionless Resumption',
    description: 'Awarded for closing the reader, leaving a Parking Note, and actually coming back.',
    icon: '📜',
    weight: 12,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      certificateRecipientTitle: 'Context Master',
      certificateReason: 'Proved that Resume > Track by picking up right where the brain left off.',
      subtitle: 'The anti-abandonment badge of distinction'
    }
  },
  {
    id: 'sound-dramatic-victory',
    code: 'SOUND_DRAMATIC_VICTORY',
    type: 'audio',
    title: 'Unnecessarily Dramatic Victory Chime',
    description: 'An orchestral retro chime celebrating your tape completion.',
    icon: '🎺',
    weight: 15,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      soundType: 'fanfare',
      caption: 'Listen to the sound of victory synthesized live through Web Audio API.'
    }
  },
  {
    id: 'sound-retro-synth',
    code: 'SOUND_RETRO_SYNTH',
    type: 'audio',
    title: 'Cassette B-Side Hidden Track',
    description: 'A gentle lo-fi 80s tape hum and analog chords.',
    icon: '📼',
    weight: 15,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      soundType: 'retro-chime',
      caption: 'The authentic warmth of tape saturation.'
    }
  },
  {
    id: 'ambient-rain-session',
    code: 'AMBIENT_RAIN',
    type: 'ambient',
    title: 'Late Night Library Atmosphere',
    description: 'Subtle soundscape of warm rain tapping against the study window.',
    icon: '🌧️',
    weight: 10,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      soundType: 'lofi-rain',
      caption: 'Relaxing ambient acoustic synthesis.'
    }
  },
  {
    id: 'meme-200-pages',
    code: 'MEME_200_PAGES',
    type: 'meme',
    title: 'The Great Trade Deal',
    description: 'A reality check on modern reading habits.',
    icon: '☕',
    weight: 14,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      memeHeader: 'ME OPENING A 100-PAGE PDF:',
      memeFooter: '"I\'ll just read the abstract"\n\n*4 hours later: fully highlighted tape completed*',
      caption: 'Dopamine prediction error in full effect.'
    }
  },
  {
    id: 'meme-parking-note',
    code: 'MEME_PARKING_NOTE',
    type: 'meme',
    title: 'Past Me vs Future Me',
    description: 'How Parking Notes save friendships with yourself.',
    icon: '🧠',
    weight: 14,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      memeHeader: 'PAST ME LEAVING A PARKING NOTE:',
      memeFooter: '"Here is exactly what we were thinking."\n\nPRESENT ME: "You are an angel."',
      caption: 'Never lose your train of thought again.'
    }
  },
  {
    id: 'easter-fake-legendary',
    code: 'EASTER_FAKE_LEGENDARY',
    type: 'easter_egg',
    title: 'The Mystery of Page 0',
    description: 'A playful post-credit discovery.',
    icon: '✨',
    weight: 10,
    cooldownUnlocks: 3,
    oneTime: true,
    active: true,
    payload: {
      surpriseText: 'You rewound the tape all the way past the beginning and found a secret groove on the cassette spool.',
      postCreditText: 'Side B has ended. Flip the tape whenever you are ready for the next adventure.'
    }
  }
];
