/**
 * 16 ラブタイプの一覧。
 *
 * 免許証のデザイン・キャッチ・ステータスなどは
 * assets/licenses/<CODE>.png（完成画像）側が持っているため、
 * ここには「選択肢として出すために必要な情報」だけを置く。
 *
 * - code     : 4文字コード。完成画像のファイル名にもなる（例: FCPE → FCPE.png）
 * - nickname : タイプ名
 * - catch    : キャッチコピー（セレクトの補足・シェア文に使う）
 */
const LOVE_TYPES = [
  { code: 'LCRO', nickname: 'ボス猫', catch: '我が道をゆくカリスマリーダー' },
  { code: 'LCRE', nickname: '隠れベイビー', catch: '甘えたい願望を秘めた誠実リーダー' },
  { code: 'LCPO', nickname: '主役体質', catch: '情熱と甘えを併せ持つドラマチックリーダー' },
  { code: 'LCPE', nickname: 'ツンデレヤンキー', catch: '不器用な愛情表現の誠実リーダー' },
  { code: 'LARO', nickname: '憧れの先輩', catch: '自立した頼れるリーダー' },
  { code: 'LARE', nickname: 'カリスマバランサー', catch: '知性と包容力のバランスリーダー' },
  { code: 'LAPO', nickname: 'パーフェクトカメレオン', catch: '適応力抜群の万能リーダー' },
  { code: 'LAPE', nickname: 'キャプテンライオン', catch: '情熱と責任感のリーダー' },
  { code: 'FCRO', nickname: 'ロマンスマジシャン', catch: 'ロマンチックで甘え上手な癒し系' },
  { code: 'FCRE', nickname: 'ちゃっかりうさぎ', catch: '甘え上手な現実派フォロワー' },
  { code: 'FCPO', nickname: '恋愛モンスター', catch: '情熱全開の甘えん坊' },
  { code: 'FCPE', nickname: '忠犬ハチ公', catch: '一途で誠実な尽くし型' },
  { code: 'FARO', nickname: '不思議生命体', catch: 'マイペースで独特な世界観の持ち主' },
  { code: 'FARE', nickname: '敏腕マネージャー', catch: '冷静で頼れる縁の下の力持ち' },
  { code: 'FAPO', nickname: 'デビル天使', catch: '小悪魔的魅力と自由を愛するフォロワー' },
  { code: 'FAPE', nickname: '最後の恋人', catch: '一途で情熱的な究極のパートナー' },
];

const LOVE_TYPE_MAP = LOVE_TYPES.reduce((acc, t) => {
  acc[t.code] = t;
  return acc;
}, {});
