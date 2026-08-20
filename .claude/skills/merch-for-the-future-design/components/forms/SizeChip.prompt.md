A rectangular size-selector chip (S/M/L/XL…) used alongside ColorSwatch on product pages.

```jsx
<SizeChip label="M" selected onClick={() => setSize("M")} />
```

Selected state inverts to a solid near-black fill; `soldOut` strikes through the label and disables the chip.
