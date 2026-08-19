A circular color-variant button for apparel color pickers, one per offered color.

```jsx
<ColorSwatch name="Forest Green" hex="#3b6e4f" selected onClick={() => selectColor(i)} />
```

Selected state gets a dark ring; `soldOut` greys and grayscales it and disables clicks. Always laid out in a `flex-wrap` row with `gap`, right-justified on the product detail page.
