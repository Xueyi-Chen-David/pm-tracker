export interface Sample {
  name: string;
  text: string;
  product: { productName: string; servingSize?: number; packageSize?: number; state?: "solid" | "liquid" };
  hint: string;
}

export const SAMPLES: Sample[] = [
  {
    name: "洋芋片（食塩相当量・100g基準）",
    hint: "最常見的日本標示：只有食塩相当量，沒有飽和脂肪與糖類",
    product: { productName: "ポテトチップス うすしお味", servingSize: 30, packageSize: 60, state: "solid" },
    text: `栄養成分表示（100g当たり）
エネルギー 554kcal
たんぱく質 4.7g
脂質 35.2g
炭水化物 54.1g
食塩相当量 0.8g`,
  },
  {
    name: "餅乾（1袋基準・糖質／食物繊維分列）",
    hint: "基準是「1袋(45g)当たり」，且碳水化合物拆成糖質＋食物繊維",
    product: { productName: "チョコチップクッキー", servingSize: 45, packageSize: 180, state: "solid" },
    text: `栄養成分表示　1袋（45g）当たり
エネルギー　232kcal
たんぱく質　2.8g
脂質　12.1g
　―飽和脂肪酸　6.4g
炭水化物　27.6g
　―糖質　26.9g
　―食物繊維　0.7g
食塩相当量　0.31g`,
  },
  {
    name: "綠茶飲料（100ml基準・低含量）",
    hint: "液體以每100毫升標示，多項營養素可適用「得以 0 標示」",
    product: { productName: "緑茶 525ml", servingSize: 525, packageSize: 525, state: "liquid" },
    text: `栄養成分表示（100ml当たり）
エネルギー 0kcal
たんぱく質 0g
脂質 0g
炭水化物 0g
食塩相当量 0.02g
カリウム 11mg`,
  },
  {
    name: "泡麵（完整標示・含糖類與kJ）",
    hint: "同時有 kJ 與 kcal、糖類、ナトリウム，資料最完整",
    product: { productName: "カップ麺 醤油", servingSize: 78, packageSize: 78, state: "solid" },
    text: `栄養成分表示 1食（78g）当たり
エネルギー 1465kJ / 350kcal
たんぱく質 8.2g
脂質 12.5g
うち飽和脂肪酸 5.6g
トランス脂肪酸 0.1g
炭水化物 50.2g
うち糖類 4.8g
食物繊維 2.4g
ナトリウム 1850mg`,
  },
];
