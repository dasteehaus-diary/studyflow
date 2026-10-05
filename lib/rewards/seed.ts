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
  // 1. Potato of Knowledge
  {
    id: 'potato-of-knowledge',
    code: 'POTATO_KNOWLEDGE',
    type: 'collectible',
    title: 'Potato of Knowledge',
    description: 'Một củ khoai tây khiêm tốn đã hấp thụ 100% tài liệu mà không phán xét bất kỳ điều gì.',
    icon: '🥔',
    weight: 12,
    cooldownUnlocks: 4,
    oneTime: true,
    active: true,
    payload: {
      subtitle: 'Kartoffel des Wissens',
      lore: 'Được tìm thấy sâu trong những chú thích cuối trang. Nó không hề phán xét bạn đã trì hoãn bao lâu trước khi nghe hết cuộn băng này.'
    }
  },
  // 2. Duck of Persistence
  {
    id: 'duck-of-persistence',
    code: 'DUCK_PERSISTENCE',
    type: 'collectible',
    title: 'Duck of Persistence',
    description: 'Chú vịt kiên trì luôn quác động viên mỗi khi bạn đứng trước những câu hỏi hóc búa.',
    icon: '🦆',
    weight: 12,
    cooldownUnlocks: 4,
    oneTime: true,
    active: true,
    payload: {
      subtitle: 'Ente der Beharrlichkeit',
      lore: 'Người bạn đồng hành nhỏ bé dành cho những độc giả từ chối việc bỏ dở danh sách đọc của mình.'
    }
  },
  // 3. Frog of Deep Contemplation
  {
    id: 'frog-of-focus',
    code: 'FROG_FOCUS',
    type: 'collectible',
    title: 'Frog of Deep Contemplation',
    description: 'Ngồi tĩnh lặng trên lá sen, trầm ngâm suy ngẫm về những ý niệm sâu sắc.',
    icon: '🐸',
    weight: 10,
    cooldownUnlocks: 4,
    oneTime: true,
    active: true,
    payload: {
      subtitle: 'Der nachdenkliche Frosch',
      lore: 'Ribbit. Bạn đã thật sự đi tới cuối cuộn băng rồi đấy.'
    }
  },
  // 4. Zen Capybara
  {
    id: 'capybara-zen',
    code: 'CAPYBARA_ZEN',
    type: 'collectible',
    title: 'Zen Capybara',
    description: 'Hoàn toàn bình thản trước 800 file PDF chưa đọc đang nằm trong ổ cứng của bạn.',
    icon: '🐾',
    weight: 8,
    cooldownUnlocks: 5,
    oneTime: true,
    active: true,
    payload: {
      subtitle: 'Meister der Gelassenheit',
      lore: 'Biểu tượng tối thượng của sự an nhiên. Nó mỉm cười thanh thản khi bạn hoàn thành một cuộn băng.'
    }
  },
  // 5. Very Important Rock
  {
    id: 'very-important-rock',
    code: 'VERY_IMPORTANT_ROCK',
    type: 'collectible',
    title: 'Hòn đá cực kỳ quan trọng',
    description: 'Chỉ là một hòn đá bình thường, nhưng vì bạn đã đọc xong tài liệu nên nó trở nên vô cùng quan trọng.',
    icon: '🪨',
    weight: 12,
    cooldownUnlocks: 3,
    oneTime: true,
    active: true,
    payload: {
      subtitle: 'Đứng vững trước mọi sự xao nhãng',
      lore: 'Không có thông báo mạng xã hội nào có thể lay chuyển được hòn đá này.'
    }
  },
  // 6. Tiny Crown
  {
    id: 'tiny-crown',
    code: 'TINY_CROWN',
    type: 'collectible',
    title: 'Vương miện giấy tí hon',
    description: 'Tự trao vương miện vì đã đọc hết một tài liệu dày cộp mà không đóng tab trình duyệt.',
    icon: '👑',
    weight: 10,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      subtitle: 'Trị vì vương quốc của sự kiên nhẫn',
      lore: 'Được gấp tỉ mỉ từ trang giấy ghi chú.'
    }
  },
  // 7. Imaginary Coffee
  {
    id: 'imaginary-coffee',
    code: 'IMAGINARY_COFFEE',
    type: 'collectible',
    title: 'Tách cà phê tưởng tượng',
    description: 'Hương thơm nồng nàn, 0 calo, 100% tinh thần minh mẫn sau khi hoàn thành buổi học.',
    icon: '☕',
    weight: 14,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      subtitle: 'Caffeine của trí não',
      lore: 'Uống một ngụm tinh thần trước khi lật sang cuốn sách tiếp theo.'
    }
  },
  // 8. Gold Star for Adults
  {
    id: 'gold-star-adults',
    code: 'GOLD_STAR_ADULTS',
    type: 'collectible',
    title: 'Ngôi sao vàng cho người trưởng thành',
    description: 'Hồi bé làm bài tốt được cô giáo chấm hoa điểm 10. Lớn lên tự tặng mình một ngôi sao vàng vì đã hoàn thành cuộn băng.',
    icon: '⭐',
    weight: 14,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      subtitle: 'Bạn đã làm rất tốt hôm nay',
      lore: 'Xác nhận: Bạn là một độc giả kiên định.'
    }
  },
  // 9. Certified PDF Survivor
  {
    id: 'cert-pdf-survivor',
    code: 'CERT_PDF_SURVIVOR',
    type: 'certificate',
    title: 'Chứng chỉ Sinh tồn cùng PDF',
    description: 'Bằng khen chính thức vì đã vượt qua hàng chục trang tài liệu chuyên sâu mà không bỏ dở giữa chừng.',
    icon: '🏆',
    weight: 15,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      certificateRecipientTitle: 'Kiện tướng hoàn thành cuộn băng',
      certificateReason: 'Đã xuất sắc điều hướng qua các đoạn văn học thuật và đẩy lùi ham muốn lướt mạng xã hội.',
      subtitle: 'Được trao tặng với đầy đủ vinh dự cassette'
    }
  },
  // 10. Diploma in Frictionless Resumption
  {
    id: 'cert-not-giving-up',
    code: 'CERT_NOT_GIVING_UP',
    type: 'certificate',
    title: 'Bằng tốt nghiệp: Trở lại mạch đọc',
    description: 'Tôn vinh hành động lưu Parking Note, tắt máy đi làm việc khác và thực sự quay lại đọc tiếp.',
    icon: '📜',
    weight: 12,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      certificateRecipientTitle: 'Bậc thầy bối cảnh',
      certificateReason: 'Minh chứng sống cho triết lý Resume > Track bằng việc tiếp tục chính xác nơi suy nghĩ dừng lại.',
      subtitle: 'Biểu trưng chống bỏ dở StudyFlow'
    }
  },
  // 11. Pro Page Turner
  {
    id: 'pro-page-turner',
    code: 'PRO_PAGE_TURNER',
    type: 'certificate',
    title: 'Chứng nhận: Thợ Lật Trang Chuyên Nghiệp',
    description: 'Được trao tặng vì kỹ năng cuộn trang điêu luyện và không bỏ sót bất kỳ dòng tư tưởng nào.',
    icon: '📄',
    weight: 12,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      certificateRecipientTitle: 'Nghệ nhân cuộn trang',
      certificateReason: 'Lật từ trang 1 đến trang cuối cùng với sự kiên định đáng kinh ngạc.'
    }
  },
  // 12. Dramatic Victory Sound
  {
    id: 'sound-dramatic-victory',
    code: 'SOUND_DRAMATIC_VICTORY',
    type: 'audio',
    title: 'Giai điệu chiến thắng 8-bit hào hùng',
    description: 'Âm thanh ăn mừng live được tổng hợp trực tiếp bằng Web Audio API trên trình duyệt của bạn.',
    icon: '🎺',
    weight: 15,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      soundType: 'fanfare',
      caption: 'Lắng nghe âm thanh chiến thắng vang dội khi hoàn thành cuộn băng cassette.'
    }
  },
  // 13. Cassette B-Side Hidden Track
  {
    id: 'sound-retro-synth',
    code: 'SOUND_RETRO_SYNTH',
    type: 'audio',
    title: 'Track ẩn mặt B cuộn băng',
    description: 'Âm sắc lo-fi analog ấm áp đưa bạn vào trạng thái thư thái sau những giờ đọc sách tập trung.',
    icon: '📼',
    weight: 15,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      soundType: 'retro-chime',
      caption: 'Sự mộc mạc và chân thực của băng cassette cổ điển.'
    }
  },
  // 14. Late Night Library Atmosphere
  {
    id: 'ambient-rain-session',
    code: 'AMBIENT_RAIN',
    type: 'ambient',
    title: 'Thư viện đêm mưa tĩnh mịch',
    description: 'Không gian âm thanh êm dịu của những giọt mưa gõ nhẹ bên khung cửa sổ phòng học.',
    icon: '🌧️',
    weight: 10,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      soundType: 'lofi-rain',
      caption: 'Tổng hợp sóng âm thư giãn tự nhiên, giúp tâm trí lắng dịu.'
    }
  },
  // 15. The Great Trade Deal
  {
    id: 'meme-200-pages',
    code: 'MEME_200_PAGES',
    type: 'meme',
    title: 'Thỏa thuận vĩ đại',
    description: 'Câu chuyện muôn thuở của những người mê đọc sách.',
    icon: '📖',
    weight: 14,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      memeHeader: 'KHI MỞ MỘT TÀI LIỆU 100 TRANG:',
      memeFooter: '"Mình chỉ đọc lướt phần tóm tắt thôi..."\n\n*4 tiếng sau: Cuộn băng đã được highlight toàn bộ*',
      caption: 'Dopamine khi tập trung thật sự là có thật.'
    }
  },
  // 16. Past Me vs Present Me
  {
    id: 'meme-parking-note',
    code: 'MEME_PARKING_NOTE',
    type: 'meme',
    title: 'Tôi trong quá khứ vs Tôi lúc này',
    description: 'Cách mà Parking Note cứu vớt tình bạn giữa bạn và chính mình trong tương lai.',
    icon: '🧠',
    weight: 14,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      memeHeader: 'TÔI QUÁ KHỨ ĐỂ LẠI PARKING NOTE:',
      memeFooter: '"Đây là chính xác những gì chúng ta đang nghĩ dở."\n\nTÔI HIỆN TẠI: "Cảm ơn vì đã không làm mình bối rối."',
      caption: 'Không bao giờ đánh mất mạch suy nghĩ nữa.'
    }
  },
  // 17. The Mystery of Page 0
  {
    id: 'easter-fake-legendary',
    code: 'EASTER_FAKE_LEGENDARY',
    type: 'easter_egg',
    title: 'Bí ẩn của Trang 0',
    description: 'Một khám phá bất ngờ ở đoạn kết cuộn băng.',
    icon: '✨',
    weight: 10,
    cooldownUnlocks: 3,
    oneTime: true,
    active: true,
    payload: {
      surpriseText: 'Bạn đã tua cuộn băng ngược về trước điểm khởi đầu và tìm thấy một rãnh bí mật trên trục cassette.',
      postCreditText: 'Mặt B đã kết thúc. Hãy lật mặt băng bất cứ khi nào bạn sẵn sàng cho hành trình tiếp theo.'
    }
  },
  // 18. Box inside a Box
  {
    id: 'box-inside-box',
    code: 'BOX_INSIDE_BOX',
    type: 'easter_egg',
    title: 'Chiếc hộp bên trong chiếc hộp',
    description: 'Bạn mở món quà ra và tìm thấy một chiếc hộp nhỏ hơn. Bên trong là một lời khen.',
    icon: '📦',
    weight: 10,
    cooldownUnlocks: 3,
    oneTime: true,
    active: true,
    payload: {
      surpriseText: 'Mở hộp 1... Mở hộp 2... Mở hộp 3...',
      postCreditText: 'Chúc mừng bạn đã hoàn thành tài liệu! Hãy nghỉ ngơi một chút trước khi đọc tiếp.'
    }
  },
  // 19. Cat Sleeping on Book
  {
    id: 'cat-sleeping-on-book',
    code: 'CAT_SLEEPING',
    type: 'collectible',
    title: 'Mèo ngủ gật trên trang sách',
    description: 'Một chú mèo mướp lười biếng cuộn tròn trên cuốn sách của bạn vì nhận thấy bạn đã đọc xong.',
    icon: '🐱',
    weight: 12,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      subtitle: 'Người gác cổng trang sách ấm áp',
      lore: 'Meow. Nhiệm vụ hôm nay đã hoàn thành, giờ là lúc thư giãn.'
    }
  },
  // 20. Fake Urgent Broadcast
  {
    id: 'fake-urgent-broadcast',
    code: 'FAKE_URGENT_BROADCAST',
    type: 'meme',
    title: 'Bản tin khẩn cấp',
    description: 'Một thông báo phát đi trên toàn hệ thống tư duy của bạn.',
    icon: '📢',
    weight: 12,
    cooldownUnlocks: 3,
    oneTime: false,
    active: true,
    payload: {
      memeHeader: 'THÔNG BÁO ĐẶC BIỆT:',
      memeFooter: 'Một người vừa thật sự đọc hết toàn bộ tài liệu thay vì lưu vào bookmark rồi quên lãng!\n\nXác nhận: Đó chính là bạn.',
      caption: 'Chống bỏ dở thành công.'
    }
  },
  // 21. Tea of Clarity
  {
    id: 'tea-of-clarity',
    code: 'TEA_CLARITY',
    type: 'collectible',
    title: 'Tách trà tĩnh tâm',
    description: 'Hương sen thanh mát, biểu tượng của sự sáng tỏ sau những trang sách phức tạp.',
    icon: '🍵',
    weight: 12,
    cooldownUnlocks: 2,
    oneTime: false,
    active: true,
    payload: {
      subtitle: 'Sự tĩnh lặng quý giá',
      lore: 'Khi dòng suy nghĩ lắng xuống, những ý niệm cốt lõi bắt đầu kết tinh.'
    }
  },
  // 22. Golden Bookmark
  {
    id: 'golden-bookmark',
    code: 'GOLDEN_BOOKMARK',
    type: 'collectible',
    title: 'Dấu trang mạ vàng danh dự',
    description: 'Chiếc kẹp sách thanh nhã ghi dấu hành trình bạn không bao giờ bỏ rơi tài liệu giữa chừng.',
    icon: '🔖',
    weight: 10,
    cooldownUnlocks: 4,
    oneTime: true,
    active: true,
    payload: {
      subtitle: 'Khắc sâu triết lý Resume > Track',
      lore: 'Không cần đếm số trang, quan trọng là luôn quay lại với mạch đọc.'
    }
  }
];
