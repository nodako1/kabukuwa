import type { NpcDefinition, NpcId } from "../types/game";

export const npcs: NpcDefinition[] = [
  {
    id: "grandma",
    name: "おばあちゃん",
    role: "基本ヒントと夏休みの見守り役",
    color: "#c84a3c",
    schedules: [
      { locationId: "grandma-house", startMinutes: 360, endMinutes: 1200, days: "all" },
      { locationId: "backyard", startMinutes: 1095, endMinutes: 1200, days: "all" },
    ],
    dialogues: [
      "朝の涼しいうちは、木の根元までよく見ておいで。焦らなくていいからね。",
      "同じ場所でも、戻ってきたら虫がいる木が変わることがあるよ。",
      "夜は裏庭だけ。ライトと樹液とバナナ、どれに来るか楽しみだねぇ。",
    ],
  },
  {
    id: "shrine-keeper",
    name: "神社のおじさん",
    role: "夕方のヒントと秘密の道の語り手",
    color: "#375e4a",
    schedules: [
      { locationId: "shrine", startMinutes: 360, endMinutes: 600, days: "all" },
      { locationId: "shrine", startMinutes: 960, endMinutes: 1080, days: "all" },
    ],
    dialogues: [
      "この神社は昔から虫が多いんだ。大きな木の影を覚えておくといい。",
      "昔、この奥へ入った子がいてね……。夕方になると道が見えたそうだよ。",
      "石段の横を見たことはあるかい？ 四時を過ぎたら、もう一度おいで。",
    ],
  },
  {
    id: "professor",
    name: "虫博士",
    role: "カブト・クワガタの豆知識を話す旅人",
    color: "#665236",
    schedules: [
      { locationId: "oak-forest", startMinutes: 600, endMinutes: 780, days: "odd" },
      { locationId: "secret-forest", startMinutes: 960, endMinutes: 1080, days: "even" },
    ],
    dialogues: [
      "オオクワガタは昼でもゼロではない。確率が低いだけで、探す価値はあるぞ。",
      "雨の翌日は樹皮がしっとりする。虫の足跡が見つけやすくなるんだ。",
      "大きさは最後まで運だ。見つける工夫と、大きさの公平さは別物なんだよ。",
    ],
  },
  {
    id: "rival",
    name: "ライバル少年",
    role: "同じ夏を走り回る虫取り仲間",
    color: "#356f91",
    schedules: [{ locationId: "school", startMinutes: 480, endMinutes: 1020, days: "odd" }],
    dialogues: [
      "今日はノコギリを見つけた！ 次は絶対もっと大きいのを捕まえるからな。",
      "竹林の方で黒い影が飛んだんだ。あれ、クワガタだったと思う。",
      "勝負は大きさだけじゃないぞ。先に秘密の森を見つけた方が勝ちだ！",
    ],
  },
  {
    id: "candy-shopkeeper",
    name: "駄菓子屋のおばちゃん",
    role: "校門前で季節の雑談を届ける人",
    color: "#a75c45",
    schedules: [{ locationId: "school", startMinutes: 540, endMinutes: 960, days: "even" }],
    dialogues: [
      "夏休みの校庭って、静かなのにどこか賑やかだよねぇ。",
      "虫取りの帰りは水分を忘れずに。夢中になると時間が飛んじゃうよ。",
      "さっき虫眼鏡を持った人が、クヌギ林の方へ歩いていったよ。",
    ],
  },
];

export const npcById = Object.fromEntries(npcs.map((npc) => [npc.id, npc])) as Record<
  NpcId,
  NpcDefinition
>;
