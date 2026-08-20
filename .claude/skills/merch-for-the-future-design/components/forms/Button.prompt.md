Pill-shaped call-to-action button; use for the primary action on a screen (checkout, add to cart, sign up).

```jsx
<Button variant="primary" onClick={addToCart}>Add to cart</Button>
<Button variant="secondary">← Previous</Button>
```

Variants: `primary` (cerulean fill, default CTA), `secondary` (outlined with tuscan-sun border, for lower-emphasis actions like pagination), `dark` (near-black fill, used on the product detail "Add to cart" button). Always fully rounded — never a squared-off button in this system. Pass `disabled` to grey it out (never hide a disabled primary action).
