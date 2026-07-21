import type {
  DailyNatureId,
  NpcId,
  ObservationThemeId,
} from "../types/game";

export interface DailyNatureDefinition {
  id: DailyNatureId;
  name: string;
  icon: string;
  morningText: string;
  diaryLead: string;
}

export interface ObservationThemeDefinition {
  id: ObservationThemeId;
  label: string;
  shortLabel: string;
  stamp: string;
}

export const dailyNatures: DailyNatureDefinition[] = [
  {
    id: "lively-sap",
    name: "樹液がにぎやかな日",
    icon: "雫",
    morningText: "甘い匂いが、いつもより強く感じられる。",
    diaryLead: "今日は樹液の甘い匂いが強い日だった。",
  },
  {
    id: "quiet-roots",
    name: "根元が気になる日",
    icon: "根",
    morningText: "日が高くなると、土の近くが涼しそう。",
    diaryLead: "今日は木の根元や落ち葉が気になる日だった。",
  },
  {
    id: "forest-evening",
    name: "夕方の林に気配",
    icon: "夕",
    morningText: "木漏れ日が弱くなるころ、羽音が増えそう。",
    diaryLead: "今日は夕方の林に気配を感じる日だった。",
  },
  {
    id: "sweet-breeze",
    name: "甘い匂いが残る日",
    icon: "実",
    morningText: "裏庭の仕掛けを、あとで見てみよう。",
    diaryLead: "今日は甘い匂いが長く残る日だった。",
  },
  {
    id: "moths-at-light",
    name: "灯りに集まる日",
    icon: "灯",
    morningText: "暗くなると、小さな羽音が増えそう。",
    diaryLead: "今日は夜の灯りに虫が集まりそうな日だった。",
  },
  {
    id: "still-summer",
    name: "静かな夏の日",
    icon: "葉",
    morningText: "目立つ気配がなくても、よく見れば何かいるかも。",
    diaryLead: "今日は静かな夏の日だった。",
  },
];

export const dailyNatureById = Object.fromEntries(
  dailyNatures.map((nature) => [nature.id, nature]),
) as Record<DailyNatureId, DailyNatureDefinition>;

export const observationThemes: ObservationThemeDefinition[] = [
  { id: "inspect-three-trees", label: "木を3本、じっくり覗いてみよう", shortLabel: "木を3本見る", stamp: "木" },
  { id: "look-high-and-low", label: "幹と足元の両方を見てみよう", shortLabel: "幹と足元を見る", stamp: "根" },
  { id: "trust-your-eyes", label: "気配のない木も1本見てみよう", shortLabel: "気配なしの木を見る", stamp: "目" },
  { id: "visit-two-woods", label: "2つの林を歩いてみよう", shortLabel: "2つの林を歩く", stamp: "林" },
  { id: "listen-to-someone", label: "村の誰かの話を聞いてみよう", shortLabel: "誰かと話す", stamp: "話" },
  { id: "check-a-trap", label: "夜の仕掛けを確認してみよう", shortLabel: "夜の仕掛けを見る", stamp: "灯" },
  { id: "complete-one-tree", label: "1本の木をすみずみまで見よう", shortLabel: "1本を見尽くす", stamp: "完" },
  { id: "walk-the-loop", label: "寄り道しながら一周してみよう", shortLabel: "村を一周する", stamp: "巡" },
];

export const observationThemeById = Object.fromEntries(
  observationThemes.map((theme) => [theme.id, theme]),
) as Record<ObservationThemeId, ObservationThemeDefinition>;

const rumorTexts: Record<NpcId, Record<DailyNatureId, string>> = {
  grandma: {
    "lively-sap": "今日は甘い匂いが強いねぇ。樹液のそばを、ゆっくり見ておいで。",
    "quiet-roots": "お昼になったら、木の足元の落ち葉も見てごらん。",
    "forest-evening": "夕方の林は空気が変わるよ。暗くなる前に耳を澄ませてごらん。",
    "sweet-breeze": "今日は甘い匂いが長く残りそうだねぇ。裏庭をあとで見てみな。",
    "moths-at-light": "暗くなったら、裏庭の灯りに小さなお客さんが来るかもねぇ。",
    "still-summer": "静かな日は、目印のない木もそっと覗くと面白いよ。",
  },
  "shrine-keeper": {
    "lively-sap": "境内の古い木から、いつもより甘い匂いがする気がするよ。",
    "quiet-roots": "石段のそばは涼しい。木の根元にも何か隠れているかもしれないね。",
    "forest-evening": "夕方になると、石段の向こうで羽音がするかもしれないよ。",
    "sweet-breeze": "風に甘い匂いが混じっているね。家のほうからかな。",
    "moths-at-light": "日が落ちると、社の灯りにも小さな虫が集まるものだよ。",
    "still-summer": "静かな境内ほど、小さな音がよく聞こえるものだよ。",
  },
  professor: {
    "lively-sap": "樹液がにぎやかな日は、捕まえる虫以外の顔ぶれも観察するといい。",
    "quiet-roots": "昼は幹だけじゃなく、根元の落ち葉も見てごらん。",
    "forest-evening": "夕方の林では活動する虫が変わる。結果を決めつけず観察してみよう。",
    "sweet-breeze": "発酵した甘い匂いは多くの虫を呼ぶが、何が来るかは毎回違うぞ。",
    "moths-at-light": "灯りにはガや小さな羽虫も来る。カブトだけが観察対象ではないぞ。",
    "still-summer": "気配が薄い木にも意味がある。何もいないことも立派な観察だ。",
  },
  rival: {
    "lively-sap": "さっき林で甘い匂いがしたぞ。どの木かは自分で探せよ！",
    "quiet-roots": "黒い影が足元へ落ちた気がしたんだ。見間違いかもしれないけどな。",
    "forest-evening": "夕方の林で勝負だ！ でも暗くなる前には帰れよ。",
    "sweet-breeze": "家のほうから甘い匂いがするぞ。何か仕掛けてるだろ！",
    "moths-at-light": "夜の灯りって、カブト以外の虫もいっぱい来るんだな。",
    "still-summer": "今日は静かだけど、こういう日に限って見落とすんだよな。",
  },
  "candy-shopkeeper": {
    "lively-sap": "学校帰りの子が、林で甘い匂いがしたって言ってたよ。",
    "quiet-roots": "木陰の落ち葉はひんやりしてるね。虫も涼んでいるかしら。",
    "forest-evening": "夕方の林で羽音を聞いた子がいるみたい。無理はしないでね。",
    "sweet-breeze": "今日は村じゅうに甘い匂いが残っている気がするねぇ。",
    "moths-at-light": "学校の灯りに小さな虫が集まるって、子どもたちが話してたよ。",
    "still-summer": "静かな日もいいものだよ。急がず、寄り道しておいで。",
  },
};

export const rumorIdFor = (npcId: NpcId, natureId: DailyNatureId): string =>
  `${npcId}:${natureId}`;

export const getRumorText = (rumorId: string): string | undefined => {
  const [npcId, natureId] = rumorId.split(":") as [NpcId, DailyNatureId];
  return rumorTexts[npcId]?.[natureId];
};
