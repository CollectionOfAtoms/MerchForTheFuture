The `/browse` fine-art masonry tile: full image at natural aspect ratio, with title/artist/price/status sliding up from the bottom as a cerulean overlay on hover.

```jsx
<ArtworkCard image={photo} title="Coral Bloom" artist="J. Caldwell" price="$450" badge="For sale" />
```

Use in a CSS masonry/column layout (`column-count`), not a fixed grid — cards vary in natural height.
