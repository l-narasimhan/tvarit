// What a darkstore holds: real Indian quick-commerce SKUs at their real pack size in metres (w × h × d, h
// vertical as it stands on the shelf; for round packs w = d = diameter). Colours are the pack's dominant colour.

export type Shape = 'box' | 'pouch' | 'bottle' | 'jar' | 'can' | 'tub' | 'tray' | 'bag'
export type Group =
  | 'staples' | 'snacks' | 'beverages' | 'breakfast' | 'personal' | 'household'
  | 'baby' | 'misc' | 'bakery' | 'dairy' | 'hv' | 'bulk'

export interface Product {
  sku: string
  name: string
  group: Group
  shape: Shape
  w: number
  h: number
  d: number
  color: number
  mrp: number
}

type Row = [string, Shape, number, number, number, number, number]
const rows: Record<Group, Row[]> = {
  staples: [
    ['Aashirvaad Shudh Chakki Atta 5 kg', 'bag', 0.29, 0.42, 0.11, 0xe8b84a, 295],
    ['Tata Salt 1 kg', 'pouch', 0.12, 0.20, 0.05, 0x1d4fa0, 28],
    ['Fortune Sunflower Oil 1 L', 'pouch', 0.15, 0.22, 0.07, 0xf2c21a, 165],
    ['Saffola Gold Oil 1 L', 'bottle', 0.08, 0.27, 0.08, 0xf5a300, 210],
    ['India Gate Basmati Rice 1 kg', 'pouch', 0.16, 0.25, 0.07, 0xb8232f, 150],
    ['Tata Sampann Toor Dal 1 kg', 'pouch', 0.15, 0.24, 0.06, 0xe07a1f, 185],
    ['Madhur Pure Sugar 1 kg', 'pouch', 0.14, 0.22, 0.06, 0x2f7ec2, 55],
    ['MDH Garam Masala 100 g', 'box', 0.07, 0.12, 0.04, 0xc1272d, 92],
    ['Everest Tikhalal Chilli 100 g', 'box', 0.07, 0.12, 0.04, 0xb21f24, 48],
    ['Tata Tea Premium 500 g', 'box', 0.12, 0.18, 0.06, 0xb3202a, 285],
    ['Bru Instant Coffee 100 g', 'jar', 0.08, 0.12, 0.08, 0x6b3b1a, 215],
    ['Kissan Fresh Tomato Ketchup 950 g', 'bottle', 0.09, 0.22, 0.09, 0xd7261e, 155],
  ],
  snacks: [
    ["Lay's India's Magic Masala 52 g", 'pouch', 0.18, 0.25, 0.07, 0x1f5fb8, 20],
    ["Lay's Classic Salted 52 g", 'pouch', 0.18, 0.25, 0.07, 0xf4c20d, 20],
    ['Kurkure Masala Munch 90 g', 'pouch', 0.17, 0.25, 0.07, 0xf07e1b, 20],
    ["Haldiram's Aloo Bhujia 200 g", 'pouch', 0.15, 0.24, 0.06, 0xe8a21a, 55],
    ['Bingo Mad Angles 66 g', 'pouch', 0.17, 0.24, 0.07, 0x6b2c91, 20],
    ['Parle-G Gold 250 g', 'box', 0.18, 0.05, 0.07, 0xf5d000, 30],
    ['Britannia Good Day Cashew 200 g', 'box', 0.19, 0.06, 0.07, 0xe39a2d, 40],
    ['Oreo Vanilla Creme 120 g', 'box', 0.15, 0.06, 0.05, 0x1b3f8f, 35],
    ['Sunfeast Dark Fantasy 75 g', 'box', 0.20, 0.05, 0.07, 0x3b1e12, 40],
    ['Cadbury Dairy Milk Silk 60 g', 'box', 0.16, 0.02, 0.08, 0x4b1d6e, 80],
    ['Nestlé KitKat 4 Finger', 'box', 0.10, 0.02, 0.04, 0xd52b1e, 30],
  ],
  beverages: [
    ['Coca-Cola 750 ml', 'bottle', 0.075, 0.28, 0.075, 0xc8102e, 40],
    ['Thums Up 750 ml', 'bottle', 0.075, 0.28, 0.075, 0x1b2a5c, 40],
    ['Sprite 750 ml', 'bottle', 0.075, 0.28, 0.075, 0x00a651, 40],
    ['Bisleri Water 1 L', 'bottle', 0.08, 0.30, 0.08, 0x2aa3dc, 20],
    ['Red Bull 250 ml', 'can', 0.053, 0.135, 0.053, 0x1c3f94, 125],
    ['Real Mixed Fruit Juice 1 L', 'box', 0.095, 0.20, 0.06, 0xf39200, 125],
    ['Tropicana Orange 1 L', 'box', 0.095, 0.20, 0.06, 0xf47b20, 130],
    ['Paper Boat Aamras 250 ml', 'pouch', 0.10, 0.18, 0.03, 0xf5b400, 35],
  ],
  breakfast: [
    ['Maggi 2-Minute Noodles 4-pack', 'pouch', 0.20, 0.12, 0.06, 0xf5c400, 56],
    ['Sunfeast YiPPee! Noodles 4-pack', 'pouch', 0.20, 0.12, 0.06, 0xfdd835, 54],
    ["Kellogg's Corn Flakes 475 g", 'box', 0.19, 0.28, 0.07, 0xe2231a, 199],
    ['MTR Rava Idli Mix 500 g', 'box', 0.12, 0.18, 0.05, 0xe0a526, 110],
    ['Knorr Tomato Soup 53 g', 'box', 0.10, 0.14, 0.02, 0x0b7a3e, 65],
    ['Saffola Masala Oats 500 g', 'pouch', 0.16, 0.24, 0.08, 0xf1b434, 190],
  ],
  personal: [
    ['Colgate Strong Teeth 200 g', 'box', 0.20, 0.05, 0.04, 0xd8232a, 110],
    ['Dove Cream Beauty Bar 3×100 g', 'box', 0.20, 0.06, 0.07, 0xeef1f4, 199],
    ['Head & Shoulders 340 ml', 'bottle', 0.07, 0.22, 0.07, 0x1d4f91, 380],
    ['Clinic Plus Shampoo 355 ml', 'bottle', 0.07, 0.22, 0.07, 0xe64a9a, 240],
    ['Nivea Body Lotion 400 ml', 'bottle', 0.08, 0.22, 0.08, 0x1b3a8a, 420],
    ['Whisper Choice XL 20 pads', 'pouch', 0.14, 0.20, 0.08, 0x7b3fa0, 160],
    ['Dettol Liquid Handwash 200 ml', 'bottle', 0.07, 0.18, 0.07, 0x0f7a3d, 99],
    ['Parachute Coconut Oil 250 ml', 'bottle', 0.065, 0.17, 0.065, 0x0b6b3a, 120],
  ],
  household: [
    ['Surf Excel Easy Wash 1 kg', 'pouch', 0.16, 0.25, 0.07, 0x1a4aa8, 140],
    ['Ariel Matic Front Load 1 kg', 'pouch', 0.16, 0.25, 0.07, 0x0a6b3a, 250],
    ['Vim Dishwash Bar 3×200 g', 'box', 0.20, 0.05, 0.08, 0x7ab800, 60],
    ['Vim Dishwash Liquid 500 ml', 'bottle', 0.07, 0.22, 0.07, 0x7ab800, 115],
    ['Harpic Power Plus 500 ml', 'bottle', 0.08, 0.25, 0.08, 0x1f3f9a, 110],
    ['Lizol Floor Cleaner 500 ml', 'bottle', 0.08, 0.24, 0.08, 0xe53b2c, 119],
    ['Good Knight Refill', 'box', 0.08, 0.12, 0.04, 0xe0301e, 85],
    ['Comfort Fabric Conditioner 860 ml', 'bottle', 0.09, 0.24, 0.09, 0x1f9ad6, 235],
    ['Origami Facial Tissue 100 pulls', 'box', 0.22, 0.08, 0.11, 0xdfe8ef, 90],
  ],
  baby: [
    ['Nestlé Cerelac Wheat Apple 300 g', 'box', 0.12, 0.18, 0.07, 0xe7b227, 250],
    ['Pampers Pants M 38', 'bag', 0.26, 0.30, 0.12, 0x0aa5a0, 699],
    ['Himalaya Baby Lotion 200 ml', 'bottle', 0.07, 0.18, 0.07, 0x4fa3d9, 195],
    ["Johnson's Baby Powder 200 g", 'bottle', 0.07, 0.17, 0.07, 0xf2f2f2, 175],
  ],
  misc: [
    ['Pedigree Adult Chicken 1.2 kg', 'pouch', 0.20, 0.30, 0.08, 0xf5c518, 380],
    ['Whiskas Ocean Fish 480 g', 'pouch', 0.14, 0.22, 0.06, 0x6b2a8c, 225],
    ['Duracell AA 4-pack', 'box', 0.10, 0.14, 0.02, 0x2a2a2a, 180],
    ['Classmate Notebook 172 pages', 'box', 0.18, 0.25, 0.02, 0x1f5fa8, 60],
  ],
  bakery: [
    ['Britannia Sandwich Bread 400 g', 'box', 0.24, 0.11, 0.10, 0xd2a15a, 45],
    ['Harvest Gold White Bread 400 g', 'box', 0.24, 0.11, 0.10, 0xc8102e, 45],
    ['Farm Eggs 12', 'tray', 0.30, 0.07, 0.10, 0xe2d3b5, 96],
    ['Modern Pav 6', 'box', 0.20, 0.06, 0.15, 0xe89b2f, 35],
    ['Britannia Fruit Cake 60 g', 'box', 0.15, 0.05, 0.06, 0x9b1b30, 25],
  ],
  dairy: [
    ['Amul Taaza Toned Milk 500 ml', 'pouch', 0.12, 0.18, 0.05, 0x2e86de, 28],
    ['Mother Dairy Full Cream Milk 500 ml', 'pouch', 0.12, 0.18, 0.05, 0x1e73be, 34],
    ['Amul Butter 100 g', 'box', 0.10, 0.03, 0.05, 0xf5d23b, 58],
    ['Amul Butter 500 g', 'box', 0.14, 0.05, 0.07, 0xf5d23b, 285],
    ['Mother Dairy Classic Dahi 400 g', 'tub', 0.10, 0.08, 0.10, 0x1e73be, 45],
    ['Amul Cheese Slices 200 g', 'box', 0.10, 0.03, 0.10, 0xf2c230, 145],
    ['Amul Fresh Paneer 200 g', 'box', 0.12, 0.03, 0.09, 0xf7f3e8, 90],
    ['Epigamia Greek Yogurt 90 g', 'tub', 0.08, 0.07, 0.08, 0x7ec8e3, 60],
    ['Amul Kool Kesar 180 ml', 'bottle', 0.05, 0.15, 0.05, 0xe89c1f, 30],
    ['iD Idly & Dosa Batter 1 kg', 'pouch', 0.14, 0.22, 0.08, 0xe3342f, 95],
    ['Yakult Probiotic 5×65 ml', 'box', 0.12, 0.10, 0.05, 0xe2231a, 90],
  ],
  hv: [
    ['Ferrero Rocher 16 pcs', 'box', 0.20, 0.08, 0.13, 0x9b7a2b, 699],
    ['Cadbury Celebrations Premium', 'box', 0.20, 0.10, 0.10, 0x6b1e8e, 499],
    ['Toblerone Milk 100 g', 'box', 0.20, 0.035, 0.035, 0xf2d400, 299],
    ['Maybelline Fit Me Foundation', 'box', 0.06, 0.12, 0.03, 0xd3a88c, 599],
    ['Lakmé 9to5 Lipstick', 'box', 0.03, 0.09, 0.03, 0x1a1a1a, 550],
    ['Gillette Mach3 Cartridges 4', 'box', 0.10, 0.18, 0.03, 0x1e2c5a, 899],
    ['boAt Airdopes 141', 'box', 0.10, 0.10, 0.05, 0x1a1a1a, 1299],
    ['Nutraj California Almonds 500 g', 'pouch', 0.15, 0.22, 0.07, 0xb5651d, 549],
    ['Happilo Whole Cashews 200 g', 'pouch', 0.15, 0.22, 0.07, 0xe2b76a, 329],
    ['Davidoff Rich Aroma Coffee 100 g', 'jar', 0.08, 0.12, 0.08, 0x1a1a1a, 649],
  ],
  bulk: [
    ['Aashirvaad Atta 10 kg (bag)', 'bag', 0.40, 0.12, 0.60, 0xe8b84a, 520],
    ['Bisleri 1 L × 12 (case)', 'box', 0.35, 0.30, 0.26, 0x2aa3dc, 240],
    ['Coca-Cola 2.25 L × 6 (case)', 'box', 0.37, 0.34, 0.24, 0xc8102e, 540],
    ['Fortune Soya Oil 15 L (tin)', 'box', 0.24, 0.34, 0.24, 0xf2c21a, 2150],
    ['India Gate Basmati 5 kg (bag)', 'bag', 0.30, 0.10, 0.45, 0xb8232f, 650],
  ],
}

const code = (g: Group) => g.slice(0, 3).toUpperCase()
export const CATALOG: Product[] = (Object.keys(rows) as Group[]).flatMap(g =>
  rows[g].map(([name, shape, w, h, d, color, mrp], i) =>
    ({ sku: `${code(g)}-${String(i + 1).padStart(3, '0')}`, name, group: g, shape, w, h, d, color, mrp })))

export const byGroup = (g: Group) => CATALOG.filter(p => p.group === g)

/** Which category a rack holds, from its aisle code — the way a planogram assigns aisles. */
export function groupForRack(id: string, zone: 'ambient' | 'chiller' | 'hv'): Group {
  if (zone === 'chiller') return 'dairy'
  if (zone === 'hv') return 'hv'
  const aisle = id.split('-')[0]
  const map: Record<string, Group> = {
    A1: 'staples', A2: 'staples', A3: 'snacks', A4: 'snacks', A5: 'beverages', C5: 'beverages',
    B1: 'breakfast', B2: 'breakfast', B3: 'beverages', J1: 'baby', H1: 'baby', O1: 'misc', M1: 'misc',
    L1: 'misc', I1: 'bakery', X1: 'beverages',
  }
  if (map[aisle]) return map[aisle]
  if (aisle.startsWith('C')) return 'personal'
  if (aisle.startsWith('D')) return 'household'
  return 'misc'
}
