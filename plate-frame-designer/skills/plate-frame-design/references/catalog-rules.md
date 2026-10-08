# Catalogue and content rules

The store owner set these rules while the catalogue was built. Follow them when proposing, building or
listing designs.

## What becomes a product

- A design can be listed when its subject has **universal recognition**: a global brand, a famous
  livery, a well-known snack, drink or store, a K-pop group, a classic cartoon, a widely shared meme or
  phrase. Don't list someone's specific one-off: a customer's custom order, a small creator's private
  merch, or a print made for one person.
- Every design in the 3D viewer must have a matching store listing. Designs with no listing are kept
  as files but hidden from the viewer.
- When an older print (legacy mold, no-logo version) and a current one exist for the same product, show
  only the current one. The old one stays in the archive.
- "In store now" means designs with an active listing. "All designs" also includes archived ones.

## Collections (current catalogue, 288 designs)

Formula 1 · Motorsport Liveries · Fast Food · Snacks · Drinks · Alcohol · Grocery & Konbini · K-Pop ·
Cartoons & Anime · Designer · Memes & Text · Squid Game · Collabs (Booty Hustlers, SmellyPanda).
The house style is parody and homage: everyday brands (konbini snacks, soju, fast food, gas-station
oil brands) set in their real colours and type, on a car frame.

## Artwork hygiene

- **No supplier or artist signature in the print.** Some supplier files carry a white "illumaesthetic"
  signature or wordmark, e.g. on the Chum Churum peel corner. Remove only the signature and keep the art
  under it: Chum Churum's coloured peel corner is part of the design. Fix the print file and the 3D
  texture, not the product photo.
- **Product photos are not print files.** If something is wrong in the print, fix the print and leave
  the product's photos alone unless asked.
- **Keep artwork edge bands that are part of the design.** Some designs have a deliberate thin stripe or
  border at the edge (Asahi, Black Boss, 7-Eleven Punjabi, Lawson, Burberry, Costco Hot Dog ×2,
  Wockhardt, Hennessy). Automated edge clean-up must skip them (`edge_bands_are_art` in the dataset).
- **Flipped versions** are separate designs with their own flag. Offer the standard orientation first.

## Naming

- Design id: lowercase slug (`chum-churum-apple`, `ferrari-f1-2026`, `taco-bell-standard`).
- Display name: the subject as people say it ("Taco Bell", "Taco Bell Flipped", "McLaren 2025").
- Source print names follow the printer's convention: `<Name> Domsem Triple.png` for DomSem A3 sheets,
  `<Name>_Plete.ai` for single Illustrator prints, `<Name>.png` in the 300ppi folder.
