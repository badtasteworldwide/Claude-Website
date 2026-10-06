# Bad Taste Worldwide — Shopify theme

Source for the `bad-taste-worldwide-theme` Online Store 2.0 theme on badtaste.world,
built from the "Bad Taste Worldwide – Standalone" design mockup.

Homepage sections (`templates/index.json`): promo bar, hero with theme switcher,
trust strip, collections grid, best sellers, bundle builder, frame-finder quiz,
reviews, UGC wall, FAQ, newsletter. Plus a cart drawer, sticky buy bar, exit-intent
modal, and product / collection / cart / search / blog templates.

## Deploying

```sh
shopify theme push --store badtaste.world --unpublished   # or --theme <id>
shopify theme publish --store badtaste.world
```

Or zip the repo and upload it under Online Store → Themes → Add theme → Upload zip.
