// Plate frame designs, grouped as they are in Google Drive
// (Website Photos → F1 2025 / Livery Files / Fast Food).
// `texture` is the production frame, flattened from its product photo.
// `art` is the original flat artwork, where one exists.
export const GROUPS = [
  {
    id: "f1-2025",
    name: "F1 2025",
    blurb: "Current-season team liveries with full sponsor rows.",
    designs: [
      { id: "mclaren", name: "McLaren", detail: "Papaya & anthracite · OKX, Android, Workday", art: true },
      { id: "ferrari", name: "Ferrari", detail: "Rosso with white sponsor band · Shell V-Power, HP", art: true },
      { id: "red-bull", name: "Red Bull", detail: "Navy & sun yellow · Oracle, Bybit, Honda Mobil", art: true },
      { id: "mercedes", name: "Mercedes-AMG", detail: "Black-to-silver fade · Petronas, INEOS, AMG", art: true },
    ],
  },
  {
    id: "classic-liveries",
    name: "Classic Liveries",
    blurb: "Le Mans, JGTC and touring-car paint schemes.",
    designs: [
      { id: "gulf", name: "Gulf", detail: "Powder blue & marigold racing stripe" },
      { id: "motul", name: "Mugen Motul", detail: "White, red & gold over a black Mugen Power bar" },
      { id: "honda-jaccs", name: "JACCS Honda", detail: "Touring-car stripes in red, green & yellow" },
      { id: "nissan-xanavi", name: "Xanavi Nissan", detail: "JGTC red & silver with flame cut-outs" },
      { id: "hks", name: "HKS Super Oil", detail: "Black with the HKS brush-stroke livery" },
      { id: "mazda-renown", name: "Renown Mazda", detail: "787B orange & green with dashed stripe" },
    ],
  },
  {
    id: "fast-food",
    name: "Fast Food",
    blurb: "Drive-thru favourites.",
    designs: [
      { id: "raising-canes", name: "Raising Cane's", detail: "“One Love” brick red with Box Combo & Cane", art: true },
    ],
  },
];

export const DESIGNS = GROUPS.flatMap((g) => g.designs.map((d) => ({ ...d, group: g })));
